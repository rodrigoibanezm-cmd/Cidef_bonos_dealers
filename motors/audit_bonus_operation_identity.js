import { db } from "../lib/db.js";
import { normalizeOperationIdentity } from "../lib/operation_identity_normalizer.js";

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function auditBonusOperationIdentity({ tenantId, vin, fv = null, ins = null, sql = null }) {
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
  await dbSql`
    insert into bonus_operation_identity_audits (
      tenant_id, vin, status, resolution_method, resolved_role,
      nombre_cliente_resuelto, rut_cliente_resuelto, reason, evidence
    ) values (
      ${tenantId}, ${normalizedVin}, ${result.status}, ${result.method ?? null}, ${result.role ?? null},
      ${result.nombre_cliente ?? null}, ${result.rut_cliente ?? null}, ${result.reason ?? null},
      ${JSON.stringify(result.evidence ?? {})}::jsonb
    )
    on conflict (tenant_id, vin)
    do update set
      status=excluded.status,
      resolution_method=excluded.resolution_method,
      resolved_role=excluded.resolved_role,
      nombre_cliente_resuelto=excluded.nombre_cliente_resuelto,
      rut_cliente_resuelto=excluded.rut_cliente_resuelto,
      reason=excluded.reason,
      evidence=excluded.evidence,
      updated_at=now()
  `;

  return result;
}
