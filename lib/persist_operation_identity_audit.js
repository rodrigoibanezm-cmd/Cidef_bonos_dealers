import { db } from "./db.js";

export async function persistOperationIdentityAudit({ tenantId, vin, result, phase = "GLOBAL_FINAL", issueCode = null, sql = null }) {
  const dbSql = sql || db();
  const rows = await dbSql`
    insert into bonus_operation_identity_audits (
      tenant_id, vin, status, resolution_method, resolved_role,
      nombre_cliente_resuelto, rut_cliente_resuelto, reason, evidence,
      audit_phase, issue_code
    ) values (
      ${tenantId}, ${vin}, ${result.status}, ${result.method ?? null}, ${result.role ?? null},
      ${result.nombre_cliente ?? null}, ${result.rut_cliente ?? null}, ${result.reason ?? null},
      ${JSON.stringify(result.evidence ?? {})}::jsonb, ${phase}, ${issueCode}
    ) returning *
  `;
  return rows[0] || null;
}
