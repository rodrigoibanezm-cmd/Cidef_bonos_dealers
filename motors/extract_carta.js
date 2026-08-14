import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { CARTA_PROMPT_V1 } from "../prompts/carta.js";

const CONTRACT_VERSION = "1";

const CARTA_SCHEMA_V1 = {
  type: "object",
  properties: {
    documento_valido: { type: "boolean" },
    rut_cliente: { type: "string", nullable: true },
  },
  required: ["documento_valido", "rut_cliente"],
};

function normalizeRut(value) {
  const raw = String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (raw.length < 2) return "";
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

export async function extractCarta({ tenantId, fileId, expectedRut, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!expectedRut) throw new Error("expectedRut is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({
    prompt: CARTA_PROMPT_V1,
    schema: CARTA_SCHEMA_V1,
    file,
  });

  const rutDocumento = normalizeRut(extracted.rut_cliente);
  const rutEsperado = normalizeRut(expectedRut);
  const documentoValido = extracted.documento_valido === true;
  const rutMatch = Boolean(rutDocumento && rutEsperado && rutDocumento === rutEsperado);

  let status = "OK";
  if (!documentoValido) status = "INVALID_DOCUMENT";
  else if (!rutDocumento) status = "RUT_UNREADABLE";
  else if (!rutMatch) status = "RUT_MISMATCH";

  return {
    tenant_id: tenantId,
    document_type: "CARTA",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    documento_valido: documentoValido,
    expected_rut: rutEsperado,
    rut_documento: rutDocumento || null,
    rut_match: rutMatch,
    parse_error: extracted._parse_error === true,
    status,
  };
}
