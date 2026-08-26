import { db } from "./db.js";

const DOCUMENT_ORDER = ["FC", "FV", "INSCRIPCION", "FINANCIAMIENTO", "REPOSICION"];
const TECHNICAL_REVIEW_ACTOR_USER = "REVIEW_PENDING_SIGNATURE";
const TECHNICAL_REVIEW_ACTOR_TENANT = "CIDEF";

function orderedSequence(documents) {
  const present = new Set(documents.map((x) => x.document_type));
  return DOCUMENT_ORDER.filter((type) => present.has(type));
}
function isReviewableState(state) { return !["PAGADA", "RECHAZADA"].includes(String(state || "").toUpperCase()); }

export function assertBonusRequestCalculationReady(request) {
  if (request?.requiere_revision_humana) throw new Error("Request requires human resolution before final approval");
  if (request?.pdv_ok !== "OK" || request?.total_devolver === null || request?.total_devolver === undefined) throw new Error("Economic calculation must be complete before final approval");
}

export async function getBonusRequestForReview(requestId, { sql = null } = {}) {
  const dbSql = sql || db();
  const requests = await dbSql`select * from bonus_requests where id=${requestId} limit 1`;
  const request = requests[0] || null;
  if (!request) return null;
  const documents = await dbSql`select request_id,document_type,file_id,file_name,file_url,extraction,validation_status,review_status,reviewed_extraction,reviewed_by_user_id,reviewed_by_tenant_id,reviewed_at,updated_at from bonus_request_documents where request_id=${requestId}`;
  const reconstructionRows = await dbSql`select evidence->'fc_reconstruction' as fc_reconstruction from bonus_operation_closure_audits where tenant_id=${request.tenant_id} and upper(vin)=upper(${request.vin}) and phase='FINAL' and evidence ? 'fc_reconstruction' order by created_at desc limit 1`;
  const priceRows = await dbSql`select evidence from bonus_price_lookup_audits where request_id=${requestId} and status='ok' order by created_at desc limit 1`;
  const sequence = orderedSequence(documents); const byType = new Map(documents.map((x) => [x.document_type, x])); const orderedDocuments = sequence.map((type) => byType.get(type)).filter(Boolean); const nextDocument = orderedDocuments.find((x) => x.review_status !== "APROBADO") || null;
  return { request, documents: orderedDocuments, sequence, next_document_type: nextDocument?.document_type || null, review_complete: orderedDocuments.length > 0 && !nextDocument, fc_reconstruction: reconstructionRows[0]?.fc_reconstruction || null, price_lookup_evidence: priceRows[0]?.evidence || null };
}

export async function approveBonusDocument({ requestId, documentType, reviewedExtraction }) {
  const review = await getBonusRequestForReview(requestId);
  if (!review || !isReviewableState(review.request.estado)) throw new Error("Request is not available for approval");
  if (review.next_document_type !== documentType) throw new Error(`Next document to approve is ${review.next_document_type || "none"}`);
  const current = review.documents.find((x) => x.document_type === documentType); const finalExtraction = reviewedExtraction ?? current?.extraction ?? {}; const sql = db();
  const updated = await sql`update bonus_request_documents set review_status='APROBADO',reviewed_extraction=${JSON.stringify(finalExtraction)}::jsonb,reviewed_by_user_id=${TECHNICAL_REVIEW_ACTOR_USER},reviewed_by_tenant_id=${TECHNICAL_REVIEW_ACTOR_TENANT},reviewed_at=now(),updated_at=now() where request_id=${requestId} and document_type=${documentType} and review_status='PENDIENTE' returning request_id,document_type,reviewed_at`;
  if (!updated[0]) throw new Error("Document was already reviewed");
  await sql`update bonus_requests set estado=case when estado='PENDIENTE' then 'EN_REVISION' else estado end,updated_at=now() where id=${requestId}`;
  await sql`insert into bonus_request_events(request_id,document_type,action,actor_user_id,actor_tenant_id,metadata) values(${requestId},${documentType},'DOCUMENTO_APROBADO',${TECHNICAL_REVIEW_ACTOR_USER},${TECHNICAL_REVIEW_ACTOR_TENANT},${JSON.stringify({ reviewed_extraction: finalExtraction, signature_status: "PENDING_FINAL_SIGNATURE" })}::jsonb)`;
  const after = await getBonusRequestForReview(requestId);
  return { ok: true, document_type: documentType, documents_complete: Boolean(after?.review_complete), request_approved: false, next_document_type: after?.next_document_type || null };
}

export async function approveBonusRequest({ requestId, actorUserId, actorTenantId }) {
  if (!actorUserId || !actorTenantId) throw new Error("Supervisor identity is required");
  const review = await getBonusRequestForReview(requestId);
  if (!review || !isReviewableState(review.request.estado)) throw new Error("Request is not available for approval");
  if (!review.review_complete) throw new Error("All documents must be approved before approving the request");
  assertBonusRequestCalculationReady(review.request); const sql = db();
  const approved = await sql`update bonus_requests set estado='APROBADA',approved_by_user_id=${actorUserId},approved_by_tenant_id=${actorTenantId},approved_at=now(),updated_at=now() where id=${requestId} and coalesce(estado,'')<>'PAGADA' returning id,estado,approved_at`;
  if (!approved[0]) throw new Error("Request could not be approved");
  await sql`update bonus_request_documents set reviewed_by_user_id=${actorUserId},reviewed_by_tenant_id=${actorTenantId},updated_at=now() where request_id=${requestId} and reviewed_by_user_id=${TECHNICAL_REVIEW_ACTOR_USER}`;
  await sql`insert into bonus_request_events(request_id,action,actor_user_id,actor_tenant_id,metadata) values(${requestId},'SOLICITUD_APROBADA',${actorUserId},${actorTenantId},'{}'::jsonb)`;
  return { ok: true, request_approved: true, request: approved[0] };
}
