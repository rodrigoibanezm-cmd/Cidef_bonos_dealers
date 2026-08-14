import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { FC_PROMPT_V1 } from "../prompts/fc.js";
import { FC_VIN_PROMPT_V1 } from "../prompts/fc_vin.js";

const CONTRACT_VERSION = "2";

const FC_VIN_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin_documento: { type: "string", nullable: true },
    readable: { type: "boolean" },
  },
  required: ["vin_documento", "readable"],
};

const FC_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin: { type: "string", nullable: true },
    folio_factura_compra: { type: "string", nullable: true },
    fecha_factura_compra: { type: "string", nullable: true },
    precio_compra_total: { type: "integer", nullable: true },
    nota_venta: { type: "string", nullable: true },
    readable: { type: "boolean" },
  },
  required: ["vin", "folio_factura_compra", "fecha_factura_compra", "precio_compra_total", "nota_venta", "readable"],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function validateFcVin({ tenantId, fileId, expectedVin, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!expectedVin) throw new Error("expectedVin is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const vinCheck = await runDocumentExtraction({ prompt: FC_VIN_PROMPT_V1, schema: FC_VIN_SCHEMA_V1, file });
  const vinDocumento = normalizeVin(vinCheck.vin_documento);
  const vinEsperado = normalizeVin(expectedVin);
  const vinMatch = Boolean(vinDocumento && vinEsperado && vinDocumento === vinEsperado);

  return {
    tenant_id: tenantId,
    document_type: "FC",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: vinEsperado,
    vin_documento: vinDocumento || null,
    vin_match: vinMatch,
    readable: vinCheck.readable === true,
    parse_error: vinCheck._parse_error === true,
    status: vinMatch ? "OK" : vinDocumento ? "VIN_MISMATCH" : "VIN_UNREADABLE",
  };
}

export async function extractFc({ tenantId, fileId, expectedVin, file }) {
  const vinValidation = await validateFcVin({ tenantId, fileId, expectedVin, file });
  if (!vinValidation.vin_match) return vinValidation;

  const extracted = await runDocumentExtraction({ prompt: FC_PROMPT_V1, schema: FC_SCHEMA_V1, file });

  return {
    ...vinValidation,
    folio_factura_compra: extracted.folio_factura_compra ?? null,
    fecha_factura_compra: extracted.fecha_factura_compra ?? null,
    precio_compra_total: extracted.precio_compra_total ?? null,
    nota_venta: extracted.nota_venta ?? null,
    readable: extracted.readable === true,
    parse_error: extracted._parse_error === true,
    status: "OK",
  };
}
