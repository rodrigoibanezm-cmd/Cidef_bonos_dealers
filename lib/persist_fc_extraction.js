import { db } from "./db.js";

export async function persistFcExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_fc_extractions (
      tenant_id, file_id, source_filename, operation_vin, vin,
      folio_factura_compra, fecha_factura_compra,
      precio_compra_neto, precio_compra_total, nota_venta,
      nombre_destinatario, rut_destinatario,
      marca, modelo, modelo_source, anio,
      status, parse_error, contract_version,
      expected_vin, vin_match, readable,
      chassis_retried, chassis_first_read, chassis_retry_read,
      chassis_retry_consistent, full_extraction_vin, extraction_vin_match
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.source_filename ?? null}, ${extraction.operation_vin ?? null}, ${extraction.vin ?? null},
      ${extraction.folio_factura_compra ?? null}, ${extraction.fecha_factura_compra ?? null},
      ${extraction.precio_compra_neto ?? null}, ${extraction.precio_compra_total ?? null}, ${extraction.nota_venta ?? null},
      ${extraction.nombre_destinatario ?? null}, ${extraction.rut_destinatario ?? null},
      ${extraction.marca ?? null}, ${extraction.modelo ?? null}, ${extraction.modelo_source ?? null}, ${extraction.anio ?? null},
      ${extraction.status || "UNKNOWN"}, ${extraction.parse_error === true},
      ${extraction.contract_version || "unknown"},
      ${extraction.expected_vin ?? null}, ${extraction.vin_match ?? null}, ${extraction.readable ?? null},
      ${extraction.chassis_retried ?? null}, ${extraction.chassis_first_read ?? null}, ${extraction.chassis_retry_read ?? null},
      ${extraction.chassis_retry_consistent ?? null}, ${extraction.full_extraction_vin ?? null}, ${extraction.extraction_vin_match ?? null}
    )
    ON CONFLICT (tenant_id, file_id)
    DO UPDATE SET
      source_filename = EXCLUDED.source_filename,
      operation_vin = EXCLUDED.operation_vin,
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
      modelo_source = EXCLUDED.modelo_source,
      anio = EXCLUDED.anio,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      expected_vin = EXCLUDED.expected_vin,
      vin_match = EXCLUDED.vin_match,
      readable = EXCLUDED.readable,
      chassis_retried = EXCLUDED.chassis_retried,
      chassis_first_read = EXCLUDED.chassis_first_read,
      chassis_retry_read = EXCLUDED.chassis_retry_read,
      chassis_retry_consistent = EXCLUDED.chassis_retry_consistent,
      full_extraction_vin = EXCLUDED.full_extraction_vin,
      extraction_vin_match = EXCLUDED.extraction_vin_match,
      updated_at = now()
    RETURNING
      id, tenant_id, file_id, source_filename, vin, modelo, modelo_source, status,
      expected_vin, vin_match, readable,
      chassis_retried, chassis_first_read, chassis_retry_read,
      chassis_retry_consistent, full_extraction_vin, extraction_vin_match,
      created_at, updated_at;
  `;

  return rows[0] || null;
}
