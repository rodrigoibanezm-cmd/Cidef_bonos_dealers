import { db } from "./db.js";

const BASE_SEQUENCE = ["FC", "FV", "INSCRIP"];

function requiredSequence(request, documents) {
  const sequence = [...BASE_SEQUENCE];
  if (request.financiado_forum === true) sequence.push("CARTA");
  if (documents.some((x) => x.document_type === "REPOS")) sequence.push("REPOS");
  return sequence;
}

export async function getBonusRequestForReview(requestId) {
  const sql = db();
  const requests = await sql`
    select *
    from bonus_requests
    where id = ${requestId}
    limit 1
  `;
  const request = requests[0] || null;
  if (!request) return null;

  const documents = await sql`
    select
      request_id,
      document_type,
      file_id,
      file_name,
      file_url,
      extraction,
      validation_status,
      review_status,
      reviewed_extraction,
      reviewed_by_user_id,
      reviewed_by_tenant_id,
      reviewed_at,
      updated_at
    from bonus_request_documents
    where request_id = ${requestId}
  `;

  const sequence = requiredSequence(request, documents);
  const byType = new Map(documents.map((x) => [x.document_type, x]));
  const orderedDocuments = sequence.map((type) => byType.get(type)).filter(Boolean);
  const nextDocument = orderedDocuments.find((x) => x.review_status !== "APROBADO") || null;

  return {
    request,
    documents: orderedDocuments,
    sequence,
    next_document_type: nextDocument?.document_type || null,
    review_complete: !nextDocument && orderedDocuments.length === sequence.length,
  };
}

export async function approveBonusDocument({
  requestId,
  documentType,
  actorUserId,
  actorTenantId,
  reviewedExtraction,
}) {
  if (!actorUserId || !actorTenantId) throw new Error("Supervisor identity is required");

  const review = await getBonusRequestForReview(requestId);
  if (!review || review.request.estado !== "INGRESADA") {
    throw new Error("Request is not available for approval");
  }
  if (review.next_document_type !== documentType) {
    throw new Error(`Next document to approve is ${review.next_document_type || "none"}`);
  }

  const current = review.documents.find((x) => x.document_type === documentType);
  const finalExtraction = reviewedExtraction ?? current?.extraction ?? {};
  const sql = db();

  const updated = await sql`
    update bonus_request_documents
    set
      review_status = 'APROBADO',
      reviewed_extraction = ${JSON.stringify(finalExtraction)}::jsonb,
      reviewed_by_user_id = ${actorUserId},
      reviewed_by_tenant_id = ${actorTenantId},
      reviewed_at = now(),
      updated_at = now()
    where request_id = ${requestId}
      and document_type = ${documentType}
      and review_status = 'PENDIENTE'
    returning request_id, document_type, reviewed_at
  `;

  if (!updated[0]) throw new Error("Document was already reviewed");

  await sql`
    insert into bonus_request_events (
      request_id, document_type, action, actor_user_id, actor_tenant_id, metadata
    ) values (
      ${requestId}, ${documentType}, 'DOCUMENTO_APROBADO', ${actorUserId}, ${actorTenantId},
      ${JSON.stringify({ reviewed_extraction: finalExtraction })}::jsonb
    )
  `;

  const after = await getBonusRequestForReview(requestId);
  let requestApproved = false;

  if (after?.review_complete) {
    const approved = await sql`
      update bonus_requests
      set
        estado = 'APROBADA',
        approved_by_user_id = ${actorUserId},
        approved_by_tenant_id = ${actorTenantId},
        approved_at = now(),
        updated_at = now()
      where id = ${requestId}
        and estado = 'INGRESADA'
      returning id, estado, approved_at
    `;

    requestApproved = Boolean(approved[0]);
    if (requestApproved) {
      await sql`
        insert into bonus_request_events (
          request_id, action, actor_user_id, actor_tenant_id, metadata
        ) values (
          ${requestId}, 'SOLICITUD_APROBADA', ${actorUserId}, ${actorTenantId}, '{}'::jsonb
        )
      `;
    }
  }

  return {
    ok: true,
    document_type: documentType,
    request_approved: requestApproved,
    next_document_type: after?.next_document_type || null,
  };
}
