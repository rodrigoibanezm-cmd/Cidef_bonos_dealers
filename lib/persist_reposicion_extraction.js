import { db } from "./db.js";

export async function persistReposicionExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_reposicion_extractions (
      tenant_id, file_id, source_filename, operation_vin, documento_valido,
      fecha, vin_nuevo, vin_original, nombre_dealer, rut_dealer, modelo, modelo_source,
      status, parse_error, contract_version
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.source_filename ?? null}, ${extraction.operation_vin ?? null},
      ${extraction.documento_valido === true}, ${extraction.fecha ?? null},
      ${extraction.vin_nuevo ?? null}, ${extraction.vin_original ?? null},
      ${extraction.nombre_dealer ?? null}, ${extraction.rut_dealer ?? null},
      ${extraction.modelo ?? null}, ${extraction.modelo_source ?? null},
      ${extraction.status || "UNKNOWN"}, ${extraction.parse_error === true},
      ${extraction.contract_version || "unknown"}
    )
    ON CONFLICT (tenant_id, file_id)
    DO UPDATE SET
      source_filename = EXCLUDED.source_filename,
      operation_vin = EXCLUDED.operation_vin,
      documento_valido = EXCLUDED.documento_valido,
      fecha = EXCLUDED.fecha,
      vin_nuevo = EXCLUDED.vin_nuevo,
      vin_original = EXCLUDED.vin_original,
      nombre_dealer = EXCLUDED.nombre_dealer,
      rut_dealer = EXCLUDED.rut_dealer,
      modelo = EXCLUDED.modelo,
      modelo_source = EXCLUDED.modelo_source,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      updated_at = now()
    RETURNING id, tenant_id, file_id, source_filename, vin_nuevo, modelo, modelo_source, status, created_at, updated_at;
  `;

  return rows[0] || null;
}
