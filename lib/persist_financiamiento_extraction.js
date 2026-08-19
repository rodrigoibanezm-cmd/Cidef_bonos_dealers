import { db } from "./db.js";

export async function persistFinanciamientoExtraction(extraction) {
  if (!extraction?.tenant_id) throw new Error("tenant_id is required");
  if (!extraction?.file_id) throw new Error("file_id is required");

  const sql = db();
  const rows = await sql`
    INSERT INTO bonus_financiamiento_extractions (
      tenant_id, file_id, documento_valido, vin, marca, modelo, version, financiera,
      nombre_cliente, rut_cliente, nombre_dealer, rut_dealer,
      monto_financiado, numero_operacion, fecha_aprobacion,
      estado_aprobacion, status, parse_error, contract_version
    ) VALUES (
      ${extraction.tenant_id}, ${extraction.file_id}, ${extraction.documento_valido},
      ${extraction.vin ?? null}, ${extraction.marca ?? null}, ${extraction.modelo ?? null},
      ${extraction.version ?? null}, ${extraction.financiera ?? null},
      ${extraction.nombre_cliente ?? null}, ${extraction.rut_cliente ?? null},
      ${extraction.nombre_dealer ?? null}, ${extraction.rut_dealer ?? null},
      ${extraction.monto_financiado ?? null}, ${extraction.numero_operacion ?? null},
      ${extraction.fecha_aprobacion ?? null}, ${extraction.estado_aprobacion ?? null},
      ${extraction.status || "UNKNOWN"}, ${extraction.parse_error === true},
      ${extraction.contract_version || "unknown"}
    )
    ON CONFLICT (tenant_id, file_id)
    DO UPDATE SET
      documento_valido = EXCLUDED.documento_valido,
      vin = EXCLUDED.vin,
      marca = EXCLUDED.marca,
      modelo = EXCLUDED.modelo,
      version = EXCLUDED.version,
      financiera = EXCLUDED.financiera,
      nombre_cliente = EXCLUDED.nombre_cliente,
      rut_cliente = EXCLUDED.rut_cliente,
      nombre_dealer = EXCLUDED.nombre_dealer,
      rut_dealer = EXCLUDED.rut_dealer,
      monto_financiado = EXCLUDED.monto_financiado,
      numero_operacion = EXCLUDED.numero_operacion,
      fecha_aprobacion = EXCLUDED.fecha_aprobacion,
      estado_aprobacion = EXCLUDED.estado_aprobacion,
      status = EXCLUDED.status,
      parse_error = EXCLUDED.parse_error,
      contract_version = EXCLUDED.contract_version,
      updated_at = now()
    RETURNING id, tenant_id, file_id, vin, marca, modelo, version, financiera, status, created_at, updated_at;
  `;

  return rows[0] || null;
}
