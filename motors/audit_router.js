import { getR2Object } from "../lib/r2.js";
import { normalizeOperationIdentity } from "../lib/normalize_operation_identity.js";
import { documentReviewStatus, REVIEW_STATUS } from "../lib/document_review_status.js";
import {
  applyTargetedValues,
  loadTargetedExtractionAudits,
  originalTargetedValues,
  persistTargetedExtractionAudit,
} from "../lib/targeted_extraction_audit.js";
import { extractFv } from "./extract_fv.js";
import { extractFc } from "./extract_fc.js";
import { extractInscrip } from "./extract_inscrip.js";
import { extractFinanciamiento } from "./extract_financiamiento.js";
import { extractReposicion } from "./extract_reposicion.js";

const EXTRACTORS = {
  FV: extractFv,
  FC: extractFc,
  INSCRIPCION: extractInscrip,
  FINANCIAMIENTO: extractFinanciamiento,
  REPOSICION: extractReposicion,
};

const DOC_KEYS = { FV: "fv", FC: "fc", INSCRIPCION: "ins", FINANCIAMIENTO: "fin", REPOSICION: "repo" };

function norm(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function fieldsForExtractionIssue(issue, row) {
  const reason = issue.code.split(":").slice(1).join(":");
  if (/VIN_/.test(reason)) return issue.document_type === "INSCRIPCION" ? ["vin_documento"] : ["vin"];
  if (reason === "INVALID_DOCUMENT") {
    if (issue.document_type === "INSCRIPCION") return ["documento_valido", "vin_documento"];
    if (issue.document_type === "FINANCIAMIENTO") return ["documento_valido", "nombre_cliente", "rut_cliente", "financiera"];
    if (issue.document_type === "REPOSICION") return ["documento_valido", "vin_nuevo", "vin_original"];
    return ["documento_valido"];
  }
  if (["PARSE_ERROR", "EXTRACTION_ERROR"].includes(reason)) {
    if (issue.document_type === "FV") return ["vin", "fecha_factura_venta", "precio_venta_total"];
    if (issue.document_type === "FC") return ["vin", "fecha_factura_compra", "precio_compra_total"];
    if (issue.document_type === "INSCRIPCION") return ["vin_documento", "nombre_adquirente", "rut_adquirente"];
    if (issue.document_type === "FINANCIAMIENTO") return ["nombre_cliente", "rut_cliente", "financiera"];
    return ["vin_nuevo", "vin_original"];
  }
  return [];
}

export function planAuditAction(issue, documents) {
  if (issue.code === "INS_RUT_CLIENTE_MISMATCH") {
    return {
      documentType: "FV",
      fields: ["nombre_facturado", "rut_facturado", "nombre_compra_para", "rut_compra_para"],
      context: issue.context,
      reason: issue.code,
    };
  }
  if (issue.code === "FC_VIN_MISMATCH") return { documentType: "FC", fields: ["vin"], context: issue.context, reason: issue.code };
  if (issue.code === "INS_VIN_MISMATCH") return { documentType: "INSCRIPCION", fields: ["vin_documento"], context: issue.context, reason: issue.code };
  if (issue.code === "FIN_RUT_CLIENTE_MISMATCH") return { documentType: "FINANCIAMIENTO", fields: ["nombre_cliente", "rut_cliente"], context: issue.context, reason: issue.code };
  if (issue.code === "REPO_VIN_ORIGINAL_MISMATCH") return { documentType: "REPOSICION", fields: ["vin_original"], context: issue.context, reason: issue.code };
  if (issue.code === "REPO_VIN_NUEVO_EQUALS_ORIGINAL") return { documentType: "REPOSICION", fields: ["vin_nuevo", "vin_original"], context: issue.context, reason: issue.code };
  if (issue.kind === "EXTRACTION" && issue.document_type) {
    const row = documents[DOC_KEYS[issue.document_type]];
    const fields = fieldsForExtractionIssue(issue, row);
    return fields.length ? { documentType: issue.document_type, fields, context: issue.context, reason: issue.code } : null;
  }
  return null;
}

function issueResolved(issue, documents, vin) {
  if (issue.code === "INS_RUT_CLIENTE_MISMATCH") return normalizeOperationIdentity({ fv: documents.fv, ins: documents.ins }).status === "RESOLVED";
  if (issue.code === "FC_VIN_MISMATCH") return norm(documents.fc?.vin) === vin;
  if (issue.code === "INS_VIN_MISMATCH") return norm(documents.ins?.vin) === vin;
  if (issue.code === "FIN_RUT_CLIENTE_MISMATCH") return norm(documents.fin?.rut_cliente) === norm(issue.context.expected_rut);
  if (issue.code === "REPO_VIN_ORIGINAL_MISMATCH") return norm(documents.repo?.vin_original) === vin;
  if (issue.code === "REPO_VIN_NUEVO_EQUALS_ORIGINAL") return Boolean(documents.repo?.vin_nuevo && norm(documents.repo.vin_nuevo) !== vin);
  if (issue.kind === "EXTRACTION") {
    const row = documents[DOC_KEYS[issue.document_type]];
    if (issue.code.endsWith(":INVALID_DOCUMENT")) {
      if (issue.document_type === "INSCRIPCION") return row?.documento_valido === true && Boolean(row?.vin);
      if (issue.document_type === "REPOSICION") return row?.documento_valido === true && Boolean(row?.vin_nuevo);
      return row?.documento_valido === true;
    }
    return documentReviewStatus(row) === REVIEW_STATUS.OK;
  }
  return false;
}

async function fileFromR2(fileId) {
  const object = await getR2Object(fileId);
  return { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
}

async function runTargeted({ action, row, tenantId, attempt }) {
  const extractor = EXTRACTORS[action.documentType];
  const file = await fileFromR2(row.file_id);
  return extractor({
    tenantId,
    fileId: row.file_id,
    expectedVin: row.operation_vin,
    file,
    mode: "targeted",
    fields: action.fields,
    context: action.context,
    reason: action.reason,
    attempt,
  });
}

export async function auditRouter({
  tenantId,
  vin,
  initialClosure,
  documents,
  sql,
  loadAudits = loadTargetedExtractionAudits,
  persistAudit = persistTargetedExtractionAudit,
  runTargetedExtraction = runTargeted,
}) {
  let effectiveDocuments = documents;
  const exhaustedIssues = [];
  const auditResults = [];

  for (const issue of initialClosure.issues) {
    const action = planAuditAction(issue, effectiveDocuments);
    if (!action) continue;

    // First use the evidence already captured by the full extraction. Targeted
    // extraction is only a fallback for fields that are still insufficient.
    if (issueResolved(issue, effectiveDocuments, vin)) continue;

    const row = effectiveDocuments[DOC_KEYS[action.documentType]];
    if (!row?.file_id) {
      exhaustedIssues.push(issue.code);
      continue;
    }

    const previous = await loadAudits({ tenantId, vin, issueCode: issue.code, sql });
    for (const audit of previous) {
      if (["CAPTURED", "RESOLVED"].includes(audit.resolution_status)) {
        effectiveDocuments = applyTargetedValues(effectiveDocuments, {
          documentType: audit.document_type,
          values: audit.targeted_values,
          issueCode: issue.code,
        });
      }
    }
    if (issueResolved(issue, effectiveDocuments, vin)) continue;

    for (let attempt = previous.length + 1; attempt <= 2; attempt += 1) {
      let extraction = null;
      let error = null;
      try {
        extraction = await runTargetedExtraction({ action, row, tenantId, attempt });
        if (!extraction.parse_error) {
          effectiveDocuments = applyTargetedValues(effectiveDocuments, {
            documentType: action.documentType,
            values: extraction.values,
            issueCode: issue.code,
          });
        }
      } catch (caught) {
        error = caught?.message || String(caught);
      }

      const resolved = !error && !extraction?.parse_error && issueResolved(issue, effectiveDocuments, vin);
      const audit = await persistAudit({
        sql,
        audit: {
          tenantId,
          vin,
          issueCode: issue.code,
          documentType: action.documentType,
          extractionId: row.id,
          fileId: row.file_id,
          fields: action.fields,
          context: action.context,
          reason: action.reason,
          attempt,
          originalValues: originalTargetedValues(documents, action.documentType, action.fields),
          targetedValues: extraction?.values ?? {},
          extractionStatus: extraction?.status ?? "ERROR",
          resolutionStatus: resolved ? "RESOLVED" : extraction && !extraction.parse_error ? "CAPTURED" : "FAILED",
          error,
          evidence: { contract_version: extraction?.contract_version ?? null },
        },
      });
      auditResults.push(audit);
      if (resolved) break;
    }

    if (!issueResolved(issue, effectiveDocuments, vin)) exhaustedIssues.push(issue.code);
  }

  return { documents: effectiveDocuments, exhaustedIssues: [...new Set(exhaustedIssues)], auditResults };
}
