import { resolveFcEvidence } from "./reconstruct_fc_from_inventory.js";

function normRut(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
}

async function latestByOperationVin(sql, table, tenantId, vin) {
  if (table === "fv") return (await sql`select * from bonus_fv_extractions where tenant_id=${tenantId} and coalesce(nullif(upper(operation_vin),''), upper(vin))=${vin} order by updated_at desc limit 1`)[0] || null;
  if (table === "fc") return (await sql`select * from bonus_fc_extractions where tenant_id=${tenantId} and coalesce(nullif(upper(operation_vin),''), upper(vin))=${vin} order by updated_at desc limit 1`)[0] || null;
  if (table === "ins") return (await sql`select * from bonus_inscripcion_extractions where tenant_id=${tenantId} and coalesce(nullif(upper(operation_vin),''), upper(vin))=${vin} order by updated_at desc limit 1`)[0] || null;
  if (table === "repo") return (await sql`select * from bonus_reposicion_extractions where tenant_id=${tenantId} and coalesce(nullif(upper(operation_vin),''), upper(vin_original))=${vin} order by updated_at desc limit 1`)[0] || null;
  if (table === "fin") return (await sql`select * from bonus_financiamiento_extractions where tenant_id=${tenantId} and upper(operation_vin)=${vin} order by updated_at desc limit 1`)[0] || null;
  throw new Error(`unsupported document table: ${table}`);
}

export async function loadBonusOperationDocuments({ sql, tenantId, vin }) {
  const [fv, documentaryFc, ins, repo, finByVin] = await Promise.all([
    latestByOperationVin(sql, "fv", tenantId, vin),
    latestByOperationVin(sql, "fc", tenantId, vin),
    latestByOperationVin(sql, "ins", tenantId, vin),
    latestByOperationVin(sql, "repo", tenantId, vin),
    latestByOperationVin(sql, "fin", tenantId, vin),
  ]);

  let fc = documentaryFc;
  if (!fc) {
    const inventoryRows = await sql`
      select vin_chasis, marca, modelo, desc_abrev, ano, factura, numero_factura, fecha_factura,
             importe_total_con_iva, nota_de_venta, cliente, dealer_nombre, dealer_venta, es_dealer
      from inventario_vehiculos_global_raw
      where upper(regexp_replace(coalesce(vin_chasis, ''), '[^A-Za-z0-9]', '', 'g'))=${vin}
    `;
    fc = resolveFcEvidence({
      documentaryFc,
      inventoryRows,
      vin,
      expectedDealer: fv?.nombre_dealer ?? null,
    });
  }

  let fin = finByVin;
  const candidateRut = normRut(fv?.rut_cliente);
  if (!fin && candidateRut) {
    const rows = await sql`
      select * from bonus_financiamiento_extractions
      where tenant_id=${tenantId}
        and regexp_replace(upper(coalesce(rut_cliente,'')), '[^0-9K]', '', 'g')=${candidateRut}
      order by updated_at desc limit 1
    `;
    fin = rows[0] || null;
  }

  return { fv, fc, ins, fin, repo };
}
