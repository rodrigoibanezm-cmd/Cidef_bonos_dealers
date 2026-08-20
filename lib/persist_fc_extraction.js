import { db } from "./db.js";

export async function persistFcExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_fc_extractions (
      tenant_id, file_id, source_filename, vin,
      folio_factura_compra, fecha_factura_compra,
      precio_compra_neto, precio_compra_total, nota_venta,
      nombre_destinatario, rut_destinatario,
      marca, modelo, anio,
      status, parse_error, contract_version
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.source_filename ?? null}, ${extraction.vin ?? null},
      ${extraction.folio_factura_compra ?? null}, ${extraction.fecha_factura_compra ?? null},
      ${extraction.precio_compra_neto ?? null}, ${extraction.precio_compra_total ?? null}, ${extraction.nota_venta ?? null},
      ${extraction.nombre_destinatario ?? null}, ${extraction.rut_destinatario ?? null},
      ${extraction.marca ?? null}, ${extraction.modelo ?? null}, ${extraction.anio ?? null},
      ${extraction.status || "UNKNOWN"}, ${extraction.parse_error === true},
      ${extraction.contract_version || "unknown"}
    )
    ON CONFLICT (tenant_id, file_id)
    DO UPDATE SET
      source_filename = EXCLUDED.source_filename,
      vin = EXCLUDED.vin,
      folio_factura_compra = EXCLUDED.folio_factura_compra,
      fecha_factura_compra = EXCLUDED.fecha_factura_compra,
      precio_compra_neto = EXCLUDED.precio_compra_neto,
      precio_compra_total = EXCLUDED.precio_compra_total,
      nota_venta = EXCLUDED.nota_venta,
      nombre_destinatario = EXCLUDED.nombre_destinatario,
      rut_destinatario = EXCLUDED.rut_destinatario,
      marca = EXCLUDED.marca,
      modelo = EXCLUDED.modelo,
      anio = EXCLUDED.anio,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      updated_at = now()
    RETURNING id, tenant_id, file_id, source_filename, vin, status, created_at, updated_at;
  `;

  return rows[0] || null;
}
