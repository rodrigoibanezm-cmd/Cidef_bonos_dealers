import { db } from "./db.js";

export async function listBonusAuditors() {
  const sql = db();
  return sql`
    select id, name, tenant_id
    from bonus_auditors
    where active = true
    order by name
  `;
}

export async function getBonusAuditor(auditorId) {
  const sql = db();
  const rows = await sql`
    select id, name, tenant_id
    from bonus_auditors
    where id = ${auditorId}
      and active = true
    limit 1
  `;
  return rows[0] || null;
}
