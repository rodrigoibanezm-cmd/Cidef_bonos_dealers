import { db } from "./db.js";

export async function persistPriceLookupAudit({ requestId, tenantId, vin, status, evidence, sql = null }) {
  const dbSql = sql || db();
  const rows = await dbSql`
    insert into bonus_price_lookup_audits (request_id, tenant_id, vin, status, evidence)
    values (${requestId}, ${tenantId}, ${vin}, ${status}, ${JSON.stringify(evidence ?? {})}::jsonb)
    returning *
  `;
  return rows[0] || null;
}
