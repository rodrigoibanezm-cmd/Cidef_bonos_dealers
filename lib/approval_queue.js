import { db } from "./db.js";

const QUEUE_FIELDS = `
  id,
  tenant_id,
  dealer_nombre,
  vin,
  marca,
  modelo,
  nombre_cliente,
  rut_cliente,
  coalesce(submitted_at, created_at) as fecha_ingreso,
  fecha_compra,
  monto_compra,
  fecha_venta,
  monto_venta,
  dias_stock_dealer,
  pdv_ok,
  fac_compra_ok,
  fac_venta_ok,
  inscripcion_venta_ok,
  fac_reposicion_ok,
  carta_credito_ok,
  bono_dif,
  bono_cierre,
  bono_fin,
  total_devolver,
  cierre_estado,
  audit_status,
  documentacion_estado,
  requiere_revision_humana,
  tiene_inconsistencias,
  inconsistencias,
  estado,
  approved_at,
  paid_at,
  created_at,
  updated_at
`;

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
      count(*) filter (where coalesce(estado, '') <> 'PAGADA')::int as total_pendientes,
      count(*) filter (
        where coalesce(estado, '') <> 'PAGADA'
          and coalesce(submitted_at, created_at) is not null
          and current_date - coalesce(submitted_at, created_at)::date >= ${urgentDays}
      )::int as total_urgentes
    from bonus_requests
  `;
  return rows[0];
}

function decorateQueueRows(rows, urgentDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return rows.map((row) => {
    const entered = row.fecha_ingreso ? new Date(row.fecha_ingreso) : null;
    const days = entered ? Math.max(0, Math.floor((today - new Date(entered.getFullYear(), entered.getMonth(), entered.getDate())) / 86400000)) : 0;
    return {
      ...row,
      dias: days,
      estado_cola: days >= urgentDays && row.estado !== "PAGADA" ? "URGENTE" : String(row.estado || "PENDIENTE").toUpperCase(),
    };
  });
}

export async function listPendingBonusRequests({ urgentDays, limit = 200 }) {
  const sql = db();
  const rows = await sql.query(`
    select ${QUEUE_FIELDS}
    from bonus_requests
    where coalesce(estado, '') <> 'PAGADA'
    order by coalesce(submitted_at, created_at) asc
    limit ${Number(limit)}
  `);
  return decorateQueueRows(rows, urgentDays);
}

export async function listBonusRequestsByDealer({ dealer, urgentDays, limit = 200 }) {
  const sql = db();
  const rows = await sql.query(`
    select ${QUEUE_FIELDS}
    from bonus_requests
    where trim(coalesce(dealer_nombre, tenant_id, '')) = $1
    order by coalesce(submitted_at, created_at) desc
    limit ${Number(limit)}
  `, [dealer]);
  return decorateQueueRows(rows, urgentDays);
}

export async function listDealers() {
  const sql = db();
  return sql.query(`
    select distinct coalesce(
      nullif(trim(razon_social_canonica), ''),
      nullif(trim(nombre_comercial), '')
    ) as dealer
    from dealers_master
    where coalesce(
      nullif(trim(razon_social_canonica), ''),
      nullif(trim(nombre_comercial), '')
    ) is not null
    order by dealer asc
  `);
}
