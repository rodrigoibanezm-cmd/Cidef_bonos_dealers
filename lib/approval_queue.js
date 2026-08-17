import { db } from "./db.js";

export async function getApprovalQueueKpis({ urgentDays }) {
  const sql = db();
  const rows = await sql`
    select
      count(*) filter (
        where estado = 'APROBADA'
          and approved_at >= date_trunc('month', now())
      )::int as total_mes,
      count(*) filter (
        where estado = 'APROBADA'
          and approved_at >= date_trunc('year', now())
      )::int as total_ano,
      count(*) filter (where estado = 'INGRESADA')::int as total_pendientes,
      count(*) filter (
        where estado = 'INGRESADA'
          and submitted_at is not null
          and current_date - submitted_at::date >= ${urgentDays}
      )::int as total_urgentes
    from bonus_requests
  `;
  return rows[0];
}

export async function listPendingBonusRequests({ urgentDays, limit = 200 }) {
  const sql = db();
  return sql`
    select
      id,
      tenant_id,
      vin,
      null::text as marca,
      null::text as modelo,
      submitted_at as fecha_ingreso,
      greatest(current_date - submitted_at::date, 0)::int as dias,
      case
        when current_date - submitted_at::date >= ${urgentDays} then 'URGENTE'
        else 'PENDIENTE'
      end as estado_cola,
      estado
    from bonus_requests
    where estado = 'INGRESADA'
      and submitted_at is not null
    order by submitted_at asc
    limit ${limit}
  `;
}

export async function listApprovedBonusRequestsByDealer({ tenantId, limit = 200 }) {
  const sql = db();
  return sql`
    select
      id,
      tenant_id,
      vin,
      null::text as marca,
      null::text as modelo,
      submitted_at as fecha_ingreso,
      approved_at,
      approved_by_user_id,
      approved_by_tenant_id,
      greatest(approved_at::date - submitted_at::date, 0)::int as dias,
      estado
    from bonus_requests
    where tenant_id = ${tenantId}
      and estado = 'APROBADA'
    order by approved_at desc
    limit ${limit}
  `;
}

export async function listDealers() {
  const sql = db();
  const [tables] = await sql`
    select
      to_regclass('public.dealers_masters') is not null as has_plural,
      to_regclass('public.dealers_master') is not null as has_singular
  `;

  if (tables?.has_plural) {
    return sql.query(`
      select distinct trim(dealer) as dealer
      from dealers_masters
      where nullif(trim(dealer), '') is not null
      order by dealer asc
    `);
  }

  if (tables?.has_singular) {
    return sql.query(`
      select distinct trim(dealer) as dealer
      from dealers_master
      where nullif(trim(dealer), '') is not null
      order by dealer asc
    `);
  }

  throw new Error('Missing dealers master table');
}
