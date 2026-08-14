import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { FV_PROMPT_V1 } from "../prompts/fv.js";
import { FV_VIN_PROMPT_V1 } from "../prompts/fv_vin.js";

const CONTRACT_VERSION = "1";

const FV_VIN_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin_documento: { type: "string", nullable: true },
  },
  required: ["vin_documento"],
};

const FV_SCHEMA_V1 = {
  type: "object",
  properties: {
    folio_factura_venta: { type: "integer", nullable: true },
    fecha_factura_venta: { type: "string", nullable: true },
    precio_venta_total: { type: "integer", nullable: true },
    financiado_forum: { type: "boolean", nullable: true },
  },
  required: ["folio_factura_venta", "fecha_factura_venta", "precio_venta_total", "financiado_forum"],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function validateFvVin({ tenantId, fileId, expectedVin, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!expectedVin) throw new Error("expectedVin is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const vinCheck = await runDocumentExtraction({
    prompt: FV_VIN_PROMPT_V1,
    schema: FV_VIN_SCHEMA_V1,
    file,
  });

  const vinDocumento = normalizeVin(vinCheck.vin_documento);
  const vinEsperado = normalizeVin(expectedVin);
  const vinMatch = Boolean(vinDocumento && vinEsperado && vinDocumento === vinEsperado);

  return {
    tenant_id: tenantId,
    document_type: "FV",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: vinEsperado,
    vin_documento: vinDocumento || null,
    vin_match: vinMatch,
    parse_error: vinCheck._parse_error === true,
    status: vinMatch ? "OK" : vinDocumento ? "VIN_MISMATCH" : "VIN_UNREADABLE",
  };
}

export async function extractFv({ tenantId, fileId, expectedVin, file }) {
  const vinValidation = await validateFvVin({ tenantId, fileId, expectedVin, file });
  if (!vinValidation.vin_match) return vinValidation;

  const extracted = await runDocumentExtraction({
    prompt: FV_PROMPT_V1,
    schema: FV_SCHEMA_V1,
    file,
  });

  return {
    ...vinValidation,
    folio_factura_venta: extracted.folio_factura_venta ?? null,
    fecha_factura_venta: extracted.fecha_factura_venta ?? null,
    precio_venta_total: extracted.precio_venta_total ?? null,
    financiado_forum: extracted.financiado_forum ?? null,
    parse_error: extracted._parse_error === true,
    status: "OK",
  };
}
