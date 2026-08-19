import { db } from "./db.js";

export async function persistInscripcionExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_inscripcion_extractions (
      tenant_id, file_id, source_filename, documento_valido, tipo_tramite, folio,
      numero_solicitud, fecha_solicitud, vin, ppu, marca, modelo, anio,
      nombre_adquirente, rut_adquirente, nombre_dealer, rut_dealer,
      status, parse_error, contract_version
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.source_filename ?? null},
      ${extraction.documento_valido === true}, ${extraction.tipo_tramite ?? null},
      ${extraction.folio ?? null}, ${extraction.numero_solicitud ?? null},
      ${extraction.fecha_solicitud ?? null}, ${extraction.vin ?? null},
      ${extraction.ppu ?? null}, ${extraction.marca ?? null}, ${extraction.modelo ?? null},
      ${extraction.anio ?? null}, ${extraction.nombre_adquirente ?? null},
      ${extraction.rut_adquirente ?? null}, ${extraction.nombre_dealer ?? null},
      ${extraction.rut_dealer ?? null}, ${extraction.status || "UNKNOWN"},
      ${extraction.parse_error === true}, ${extraction.contract_version || "unknown"}
    )
    ON CONFLICT (vin, numero_solicitud)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      file_id = EXCLUDED.file_id,
      source_filename = EXCLUDED.source_filename,
      documento_valido = EXCLUDED.documento_valido,
      tipo_tramite = EXCLUDED.tipo_tramite,
      folio = EXCLUDED.folio,
      fecha_solicitud = EXCLUDED.fecha_solicitud,
      ppu = EXCLUDED.ppu,
      marca = EXCLUDED.marca,
      modelo = EXCLUDED.modelo,
      anio = EXCLUDED.anio,
      nombre_adquirente = EXCLUDED.nombre_adquirente,
      rut_adquirente = EXCLUDED.rut_adquirente,
      nombre_dealer = EXCLUDED.nombre_dealer,
      rut_dealer = EXCLUDED.rut_dealer,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      updated_at = now()
    RETURNING id, tenant_id, file_id, source_filename, vin, numero_solicitud, status, created_at, updated_at;
  `;

  return rows[0] || null;
}
