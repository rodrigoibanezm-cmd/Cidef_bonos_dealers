import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { extractFcChassis, normalizeChassis } from "../lib/extract_fc_chassis.js";
import { FC_PROMPT_V1 } from "../prompts/fc.js";

const CONTRACT_VERSION = "5";

const FC_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin: { type: "string", nullable: true },
    folio_factura_compra: { type: "integer", nullable: true },
    fecha_factura_compra: { type: "string", nullable: true },
    precio_compra_neto: { type: "integer", nullable: true },
    precio_compra_total: { type: "integer", nullable: true },
    nota_venta: { type: "integer", nullable: true },
    nombre_destinatario: { type: "string", nullable: true },
    rut_destinatario: { type: "string", nullable: true },
    marca: { type: "string", nullable: true },
    modelo: { type: "string", nullable: true },
    anio: { type: "integer", nullable: true },
  },
  required: [
    "vin", "folio_factura_compra", "fecha_factura_compra", "precio_compra_neto",
    "precio_compra_total", "nota_venta", "nombre_destinatario", "rut_destinatario",
    "marca", "modelo", "anio"
  ],
};

function chassisStatus({ chassis, expectedVin, fullExtractionVin }) {
  if (!chassis.vin || !chassis.readable || chassis.parse_error) return "VIN_UNREADABLE";

  const expected = normalizeChassis(expectedVin) || null;
  const fullMatchesChassis = Boolean(fullExtractionVin && fullExtractionVin === chassis.vin);

  if (chassis.retried && chassis.retry_consistent === false && !fullMatchesChassis) {
    return "VIN_ERROR";
  }

  if (fullExtractionVin && !fullMatchesChassis) return "VIN_INCONSISTENT";
  if (expected && chassis.vin !== expected) return "VIN_MISMATCH";
  return "OK";
}

function validationStatus({ chassis, expectedVin }) {
  if (!chassis.vin || !chassis.readable || chassis.parse_error) return "VIN_UNREADABLE";
  if (chassis.retried && chassis.retry_consistent === false) return "VIN_ERROR";

  const expected = normalizeChassis(expectedVin) || null;
  if (expected && chassis.vin !== expected) return "VIN_MISMATCH";
  return "OK";
}

export async function validateFcVin({ tenantId, fileId, expectedVin = null, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const chassis = await extractFcChassis({ file, comparisonVin: expectedVin });
  const expected = normalizeChassis(expectedVin) || null;

  return {
    tenant_id: tenantId,
    document_type: "FC",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: expected,
    vin_documento: chassis.vin,
    vin_match: expected ? Boolean(chassis.vin && chassis.vin === expected) : null,
    readable: chassis.readable,
    chassis_retried: chassis.retried,
    chassis_first_read: chassis.first_vin,
    chassis_retry_read: chassis.retry_vin,
    chassis_retry_consistent: chassis.retry_consistent,
    parse_error: chassis.parse_error,
    status: validationStatus({ chassis, expectedVin: expected }),
  };
}

export async function extractFc({ tenantId, fileId, expectedVin = null, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const chassis = await extractFcChassis({ file, comparisonVin: expectedVin });
  const expected = normalizeChassis(expectedVin) || null;

  if (!chassis.vin || !chassis.readable || chassis.parse_error) {
    return {
      tenant_id: tenantId,
      document_type: "FC",
      contract_version: CONTRACT_VERSION,
      file_id: fileId,
      expected_vin: expected,
      vin: chassis.vin,
      vin_documento: chassis.vin,
      vin_match: expected ? Boolean(chassis.vin && chassis.vin === expected) : null,
      readable: chassis.readable,
      chassis_retried: chassis.retried,
      chassis_first_read: chassis.first_vin,
      chassis_retry_read: chassis.retry_vin,
      chassis_retry_consistent: chassis.retry_consistent,
      parse_error: chassis.parse_error,
      status: "VIN_UNREADABLE",
    };
  }

  const extracted = await runDocumentExtraction({ prompt: FC_PROMPT_V1, schema: FC_SCHEMA_V1, file });
  const fullExtractionVin = normalizeChassis(extracted.vin) || null;
  const vinMatch = expected ? chassis.vin === expected : null;
  const status = extracted._parse_error === true
    ? "EXTRACTION_ERROR"
    : chassisStatus({ chassis, expectedVin: expected, fullExtractionVin });

  return {
    tenant_id: tenantId,
    document_type: "FC",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: expected,
    vin: chassis.vin,
    vin_documento: chassis.vin,
    vin_match: vinMatch,
    readable: chassis.readable,
    chassis_retried: chassis.retried,
    chassis_first_read: chassis.first_vin,
    chassis_retry_read: chassis.retry_vin,
    chassis_retry_consistent: chassis.retry_consistent,
    full_extraction_vin: fullExtractionVin,
    extraction_vin_match: fullExtractionVin ? fullExtractionVin === chassis.vin : null,
    folio_factura_compra: extracted.folio_factura_compra ?? null,
    fecha_factura_compra: extracted.fecha_factura_compra ?? null,
    precio_compra_neto: extracted.precio_compra_neto ?? null,
    precio_compra_total: extracted.precio_compra_total ?? null,
    nota_venta: extracted.nota_venta ?? null,
    nombre_destinatario: extracted.nombre_destinatario ?? null,
    rut_destinatario: extracted.rut_destinatario ?? null,
    marca: extracted.marca ?? null,
    modelo: extracted.modelo ?? null,
    anio: extracted.anio ?? null,
    parse_error: extracted._parse_error === true,
    status,
  };
}
