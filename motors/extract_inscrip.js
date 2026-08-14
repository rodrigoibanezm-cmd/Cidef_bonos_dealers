import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { INSCRIP_PROMPT_V1 } from "../prompts/inscrip.js";

const CONTRACT_VERSION = "1";

const INSCRIP_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin_documento: { type: "string", nullable: true },
  },
  required: ["vin_documento"],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function extractInscrip({ tenantId, fileId, expectedVin, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!expectedVin) throw new Error("expectedVin is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({
    prompt: INSCRIP_PROMPT_V1,
    schema: INSCRIP_SCHEMA_V1,
    file,
  });

  const vinDocumento = normalizeVin(extracted.vin_documento);
  const vinEsperado = normalizeVin(expectedVin);
  const vinMatch = Boolean(vinDocumento && vinEsperado && vinDocumento === vinEsperado);

  return {
    tenant_id: tenantId,
    document_type: "INSCRIP",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: vinEsperado,
    vin_documento: vinDocumento || null,
    vin_match: vinMatch,
    parse_error: extracted._parse_error === true,
    status: vinMatch ? "OK" : vinDocumento ? "VIN_MISMATCH" : "VIN_UNREADABLE",
  };
}
