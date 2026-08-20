import { db } from "../lib/db.js";
import { auditBonusOperationIdentity } from "./audit_bonus_operation_identity.js";
import { auditRouter } from "./audit_router.js";
import { buildBonusOperationClosure } from "../lib/build_bonus_operation_closure.js";
import { loadBonusOperationDocuments } from "../lib/load_bonus_operation_documents.js";
import { persistConsolidatedBonusRequest } from "../lib/persist_consolidated_bonus_request.js";
import { persistOperationClosure } from "../lib/persist_operation_closure.js";

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function consolidateOne({ sql, tenantId, vin }) {
  const originalDocuments = await loadBonusOperationDocuments({ sql, tenantId, vin });
  if (!originalDocuments.fv) return null;

  const initialClosure = buildBonusOperationClosure({ vin, documents: originalDocuments });
  await persistOperationClosure({ tenantId, vin, phase: "INICIAL", closure: initialClosure, sql });

  const targeted = await auditRouter({
    tenantId,
    vin,
    initialClosure,
    documents: originalDocuments,
    sql,
  });

  let identityResolution = null;
  if (initialClosure.inconsistencias.includes("INS_RUT_CLIENTE_MISMATCH")) {
    identityResolution = await auditBonusOperationIdentity({
      tenantId,
      vin,
      fv: targeted.documents.fv,
      ins: targeted.documents.ins,
      sql,
      phase: "GLOBAL_FINAL",
      issueCode: "INS_RUT_CLIENTE_MISMATCH",
    });
  }

  const finalClosure = buildBonusOperationClosure({
    vin,
    documents: targeted.documents,
    identityResolution,
    exhaustedIssues: targeted.exhaustedIssues,
    isFinal: true,
  });
  await persistOperationClosure({ tenantId, vin, phase: "FINAL", closure: finalClosure, sql });

  const operation = await persistConsolidatedBonusRequest({
    sql,
    tenantId,
    vin,
    documents: targeted.documents,
    closure: finalClosure,
  });

  return {
    ...operation,
    initial_closure: initialClosure.cierre_estado,
    final_closure: finalClosure.cierre_estado,
    audit_attempts: targeted.auditResults.length,
  };
}

export async function consolidateBonusOperations({ tenantId = null, vin = null } = {}) {
  const sql = db();
  const normalizedVin = normVin(vin);
  const operations = tenantId && normalizedVin
    ? [{ tenant_id: tenantId, vin: normalizedVin }]
    : tenantId
      ? await sql`
          select tenant_id, coalesce(nullif(upper(operation_vin),''), upper(vin)) as vin
          from bonus_fv_extractions
          where tenant_id=${tenantId} and coalesce(nullif(operation_vin,''), vin) is not null
          group by tenant_id, coalesce(nullif(upper(operation_vin),''), upper(vin))
        `
      : await sql`
          select tenant_id, coalesce(nullif(upper(operation_vin),''), upper(vin)) as vin
          from bonus_fv_extractions
          where coalesce(nullif(operation_vin,''), vin) is not null
          group by tenant_id, coalesce(nullif(upper(operation_vin),''), upper(vin))
        `;

  const results = [];
  for (const operation of operations) {
    const result = await consolidateOne({
      sql,
      tenantId: operation.tenant_id,
      vin: normVin(operation.vin),
    });
    if (result) results.push(result);
  }
  return { processed: operations.length, operations: results };
}
