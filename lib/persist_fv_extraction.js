import { db } from "./db.js";

export async function persistFvExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_fv_extractions (
      tenant_id, file_id, source_filename, vin, nombre_cliente, rut_cliente,
      nombre_dealer, rut_dealer, folio_factura_venta, fecha_factura_venta,
      precio_venta_total, financiamiento, status, parse_error, contract_version
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.source_filename ?? null},
      ${extraction.vin ?? null}, ${extraction.nombre_cliente ?? null}, ${extraction.rut_cliente ?? null},
      ${extraction.nombre_dealer ?? null}, ${extraction.rut_dealer ?? null},
      ${extraction.folio_factura_venta ?? null}, ${extraction.fecha_factura_venta ?? null},
      ${extraction.precio_venta_total ?? null}, ${extraction.financiamiento ?? null},
      ${extraction.status || "UNKNOWN"}, ${extraction.parse_error === true},
      ${extraction.contract_version || "unknown"}
    )
    ON CONFLICT (rut_dealer, folio_factura_venta, vin)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      file_id = EXCLUDED.file_id,
      source_filename = EXCLUDED.source_filename,
      nombre_cliente = EXCLUDED.nombre_cliente,
      rut_cliente = EXCLUDED.rut_cliente,
      nombre_dealer = EXCLUDED.nombre_dealer,
      fecha_factura_venta = EXCLUDED.fecha_factura_venta,
      precio_venta_total = EXCLUDED.precio_venta_total,
      financiamiento = EXCLUDED.financiamiento,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      updated_at = now()
    RETURNING id, tenant_id, file_id, source_filename, vin, status, created_at, updated_at;
  `;

  return rows[0] || null;
}
