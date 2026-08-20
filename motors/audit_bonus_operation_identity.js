import { db } from "../lib/db.js";
import { normalizeOperationIdentity } from "../lib/normalize_operation_identity.js";
import { persistOperationIdentityAudit } from "../lib/persist_operation_identity_audit.js";

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function auditBonusOperationIdentity({
  tenantId,
  vin,
  fv = null,
  ins = null,
  sql = null,
  phase = "GLOBAL_FINAL",
  issueCode = "INS_RUT_CLIENTE_MISMATCH",
}) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!vin) throw new Error("vin is required");
  const dbSql = sql || db();
  const normalizedVin = normVin(vin);

  if (!fv) {
    const rows = await dbSql`
      select * from bonus_fv_extractions
      where tenant_id=${tenantId} and upper(vin)=${normalizedVin}
      order by updated_at desc limit 1
    `;
    fv = rows[0] || null;
  }
  if (!ins) {
    const rows = await dbSql`
      select * from bonus_inscripcion_extractions
      where tenant_id=${tenantId} and upper(vin)=${normalizedVin}
      order by updated_at desc limit 1
    `;
    ins = rows[0] || null;
  }

  const result = normalizeOperationIdentity({ fv, ins });
  await persistOperationIdentityAudit({
    tenantId,
    vin: normalizedVin,
    result,
    phase,
    issueCode,
    sql: dbSql,
  });

  return result;
}
