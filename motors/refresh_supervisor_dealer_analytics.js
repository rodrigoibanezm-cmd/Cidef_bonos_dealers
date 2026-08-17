import { db } from "../lib/db.js";

export async function refreshSupervisorDealerAnalytics() {
  const sql = db();

  await sql`
    create table if not exists supervisor_dealer_analytics (
      supervisor text,
      dealer text not null,
      dealer_rut text,
      vin text not null,
      marca text,
      modelo text,
      vendedor text,
      fecha_factura date,
      fecha_ingreso_stk date,
      dias_stock integer,
      request_id uuid,
      estado_solicitud_bono text,
      monto_venta bigint,
      financiado_forum boolean,
      refreshed_at timestamptz not null default now(),
      primary key (dealer, vin)
    )
  `;

  await sql`truncate table supervisor_dealer_analytics`;

  await sql`
    insert into supervisor_dealer_analytics (
      supervisor,
      dealer,
      dealer_rut,
      vin,
      marca,
      modelo,
      vendedor,
      fecha_factura,
      fecha_ingreso_stk,
      dias_stock,
      request_id,
      estado_solicitud_bono,
      monto_venta,
      financiado_forum,
      refreshed_at
    )
    with inventario as (
      select distinct on (trim(dealer_venta), trim(vin_chasis))
        trim(dealer_venta) as dealer,
        dealer_rut,
        trim(vin_chasis) as vin,
        marca,
        desc_abrev as modelo,
        vendedor,
        case
          when trim(fecha_factura) ~ '^\\d{4}-\\d{2}-\\d{2}$' then trim(fecha_factura)::date
          when trim(fecha_factura) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' then to_date(trim(fecha_factura), 'DD/MM/YYYY')
          else null
        end as fecha_factura_date,
        case
          when trim(fecha_ingreso_stk) ~ '^\\d{4}-\\d{2}-\\d{2}$' then trim(fecha_ingreso_stk)::date
          when trim(fecha_ingreso_stk) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' then to_date(trim(fecha_ingreso_stk), 'DD/MM/YYYY')
          else null
        end as fecha_ingreso_stk_date
      from inventario_vehiculos_global_raw
      where es_dealer = true
        and nullif(trim(vin_chasis), '') is not null
        and nullif(trim(dealer_venta), '') is not null
      order by
        trim(dealer_venta),
        trim(vin_chasis),
        case
          when trim(fecha_factura) ~ '^\\d{4}-\\d{2}-\\d{2}$' then trim(fecha_factura)::date
          when trim(fecha_factura) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' then to_date(trim(fecha_factura), 'DD/MM/YYYY')
          else null
        end desc nulls last
    ),
    solicitudes as (
      select distinct on (vin)
        id,
        vin,
        estado,
        monto_venta,
        financiado_forum
      from bonus_requests
      order by vin, created_at desc
    )
    select
      dm.supervisor,
      i.dealer,
      i.dealer_rut,
      i.vin,
      i.marca,
      i.modelo,
      i.vendedor,
      i.fecha_factura_date,
      i.fecha_ingreso_stk_date,
      case
        when i.fecha_factura_date is not null then current_date - i.fecha_factura_date
        else null
      end as dias_stock,
      s.id,
      s.estado,
      s.monto_venta,
      s.financiado_forum,
      now()
    from inventario i
    left join dealers_master dm
      on trim(dm.dealer) = i.dealer
    left join solicitudes s
      on trim(s.vin) = i.vin
  `;

  const rows = await sql`
    select
      count(*)::int as total_vins,
      count(*) filter (where supervisor is not null)::int as vins_con_supervisor,
      count(*) filter (where supervisor is null)::int as vins_sin_supervisor,
      count(distinct dealer)::int as dealers
    from supervisor_dealer_analytics
  `;

  return rows[0];
}
