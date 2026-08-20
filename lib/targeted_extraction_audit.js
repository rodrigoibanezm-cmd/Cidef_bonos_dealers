import { db } from "./db.js";

const FIELD_ALIASES = {
  INSCRIPCION: { vin_documento: "vin" },
};

function rowKey(documentType) {
  return ({ FV: "fv", FC: "fc", INSCRIPCION: "ins", FINANCIAMIENTO: "fin", REPOSICION: "repo" })[documentType];
}

export function applyTargetedValues(documents, { documentType, values, issueCode }) {
  const key = rowKey(documentType);
  const original = documents[key];
  if (!original) return documents;

  const aliases = FIELD_ALIASES[documentType] || {};
  const patch = {};
  for (const [field, value] of Object.entries(values || {})) patch[aliases[field] || field] = value;
  if (Object.hasOwn(patch, "vin")) patch.vin_documento = patch.vin;

  const hasRequestedValue = Object.values(patch).some((value) => value !== null && value !== "");
  if (hasRequestedValue && /VIN_(UNREADABLE|MISMATCH|ERROR|INCONSISTENT)/.test(issueCode)) {
    patch.status = "OK_TARGETED";
    patch.parse_error = false;
  }
  if (patch.documento_valido === true && issueCode.includes("INVALID_DOCUMENT")) {
    patch.status = "OK_TARGETED";
    patch.parse_error = false;
  }

  return { ...documents, [key]: { ...original, ...patch, _targeted_correction: true } };
}

export function originalTargetedValues(documents, documentType, fields) {
  const row = documents[rowKey(documentType)] || {};
  const aliases = FIELD_ALIASES[documentType] || {};
  return Object.fromEntries(fields.map((field) => [field, row[aliases[field] || field] ?? null]));
}

export async function loadTargetedExtractionAudits({ tenantId, vin, issueCode, sql = null }) {
  const dbSql = sql || db();
  return dbSql`
    select * from bonus_document_extraction_audits
    where tenant_id=${tenantId} and vin=${vin} and issue_code=${issueCode}
    order by attempt asc, created_at asc
  `;
}

export async function persistTargetedExtractionAudit({ audit, sql = null }) {
  const dbSql = sql || db();
  const rows = await dbSql`
    insert into bonus_document_extraction_audits (
      tenant_id, vin, issue_code, document_type, extraction_id, file_id,
      fields, context, reason, attempt, original_values, targeted_values,
      extraction_status, resolution_status, error, evidence
    ) values (
      ${audit.tenantId}, ${audit.vin}, ${audit.issueCode}, ${audit.documentType},
      ${audit.extractionId ?? null}, ${audit.fileId}, ${JSON.stringify(audit.fields)}::jsonb,
      ${JSON.stringify(audit.context)}::jsonb, ${audit.reason}, ${audit.attempt},
      ${JSON.stringify(audit.originalValues)}::jsonb, ${JSON.stringify(audit.targetedValues ?? {})}::jsonb,
      ${audit.extractionStatus}, ${audit.resolutionStatus}, ${audit.error ?? null},
      ${JSON.stringify(audit.evidence ?? {})}::jsonb
    ) on conflict (tenant_id, vin, issue_code, attempt) do nothing
    returning *
  `;
  return rows[0] || null;
}
