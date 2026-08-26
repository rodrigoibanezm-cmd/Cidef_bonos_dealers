import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { REPOSICION_PROMPT_V1 } from "../prompts/reposicion.js";
import {
  EXTRACTION_MODE,
  runTargetedDocumentExtraction,
  targetedContract,
} from "../lib/targeted_document_extraction.js";

const CONTRACT_VERSION = "2";

const REPOSICION_SCHEMA_V1 = {
  type: "object",
  properties: {
    documento_valido: { type: "boolean" },
    fecha: { type: "string", nullable: true },
    vin_nuevo: { type: "string", nullable: true },
    vin_original: { type: "string", nullable: true },
    nombre_dealer: { type: "string", nullable: true },
    rut_dealer: { type: "string", nullable: true },
    marca: { type: "string", nullable: true },
    modelo: { type: "string", nullable: true },
    version: { type: "string", nullable: true },
  },
  required: [
    "documento_valido",
    "fecha",
    "vin_nuevo",
    "vin_original",
    "nombre_dealer",
    "rut_dealer",
    "marca",
    "modelo",
    "version",
  ],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function extractReposicion({
  tenantId,
  fileId,
  file,
  mode = EXTRACTION_MODE.FULL,
  fields = null,
  context = null,
  reason = null,
  attempt = null,
}) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const contract = targetedContract({ mode, fields, context, reason, attempt, schema: REPOSICION_SCHEMA_V1 });
  if (contract) {
    const extracted = await runTargetedDocumentExtraction({
      documentType: "REPOSICION", prompt: REPOSICION_PROMPT_V1, schema: REPOSICION_SCHEMA_V1, file, contract,
    });
    const values = Object.fromEntries(contract.fields.map((field) => [field, extracted[field] ?? null]));
    if (Object.hasOwn(values, "vin_nuevo")) values.vin_nuevo = normalizeVin(values.vin_nuevo) || null;
    if (Object.hasOwn(values, "vin_original")) values.vin_original = normalizeVin(values.vin_original) || null;
    return {
      tenant_id: tenantId,
      document_type: "REPOSICION",
      contract_version: CONTRACT_VERSION,
      file_id: fileId,
      mode: EXTRACTION_MODE.TARGETED,
      fields: contract.fields,
      context: contract.context,
      reason: contract.reason,
      attempt: contract.attempt,
      values,
      parse_error: extracted._parse_error === true,
      status: extracted._parse_error === true ? "PARSE_ERROR" : "OK",
    };
  }

  const extracted = await runDocumentExtraction({
    prompt: REPOSICION_PROMPT_V1,
    schema: REPOSICION_SCHEMA_V1,
    file,
  });

  const documentoValido = extracted.documento_valido === true;
  const vinNuevo = normalizeVin(extracted.vin_nuevo);
  const vinOriginal = normalizeVin(extracted.vin_original);

  return {
    tenant_id: tenantId,
    document_type: "REPOSICION",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    documento_valido: documentoValido,
    fecha: extracted.fecha || null,
    vin_nuevo: vinNuevo || null,
    vin_original: vinOriginal || null,
    nombre_dealer: extracted.nombre_dealer || null,
    rut_dealer: extracted.rut_dealer || null,
    marca: extracted.marca || null,
    modelo: extracted.modelo || null,
    version: extracted.version || null,
    parse_error: extracted._parse_error === true,
    status: !documentoValido ? "INVALID_DOCUMENT" : vinNuevo ? "OK" : "VIN_UNREADABLE",
  };
}
