import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { extractFcChassis, normalizeChassis } from "../lib/extract_fc_chassis.js";
import { FC_PROMPT_V1 } from "../prompts/fc.js";

const CONTRACT_VERSION = "4";

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

export async function validateFcVin({ tenantId, fileId, expectedVin, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const chassis = await extractFcChassis({ file, comparisonVin: expectedVin });
  const expected = normalizeChassis(expectedVin) || null;
  const vinMatch = Boolean(chassis.vin && expected && chassis.vin === expected);

  return {
    tenant_id: tenantId,
    document_type: "FC",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: expected,
    vin_documento: chassis.vin,
    vin_match: vinMatch,
    readable: chassis.readable,
    chassis_retried: chassis.retried,
    chassis_first_read: chassis.first_vin,
    parse_error: chassis.parse_error,
    status: !chassis.vin ? "VIN_UNREADABLE" : expected && !vinMatch ? "VIN_MISMATCH" : "OK",
  };
}

export async function extractFc({ tenantId, fileId, expectedVin = null, file }) {
  const vinValidation = await validateFcVin({ tenantId, fileId, expectedVin, file });
  if (!vinValidation.vin_documento) return vinValidation;

  const extracted = await runDocumentExtraction({ prompt: FC_PROMPT_V1, schema: FC_SCHEMA_V1, file });
  const fullExtractionVin = normalizeChassis(extracted.vin) || null;
  const chassisVin = vinValidation.vin_documento;
  const extractionVinMatch = !fullExtractionVin || fullExtractionVin === chassisVin;

  return {
    ...vinValidation,
    vin: chassisVin,
    full_extraction_vin: fullExtractionVin,
    extraction_vin_match: extractionVinMatch,
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
    status: extracted._parse_error === true ? "EXTRACTION_ERROR" : !extractionVinMatch ? "VIN_INCONSISTENT" : vinValidation.status,
  };
}
