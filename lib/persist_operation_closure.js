import { db } from "./db.js";

export async function persistOperationClosure({ tenantId, vin, phase, closure, sql = null }) {
  const dbSql = sql || db();
  const rows = await dbSql`
    insert into bonus_operation_closure_audits (
      tenant_id, vin, phase, cierre_estado, requiere_revision_humana, audit_status,
      document_statuses, documentos_faltantes, inconsistencias, exhausted_issues, evidence
    ) values (
      ${tenantId}, ${vin}, ${phase}, ${closure.cierre_estado}, ${closure.requiere_revision_humana}, ${closure.audit_status},
      ${JSON.stringify(closure.document_statuses)}::jsonb,
      ${JSON.stringify(closure.documentos_faltantes)}::jsonb,
      ${JSON.stringify(closure.inconsistencias)}::jsonb,
      ${JSON.stringify(closure.exhausted_issues)}::jsonb,
      ${JSON.stringify({ issues: closure.issues, identity: closure.identity ?? null })}::jsonb
    ) returning *
  `;
  return rows[0] || null;
}
