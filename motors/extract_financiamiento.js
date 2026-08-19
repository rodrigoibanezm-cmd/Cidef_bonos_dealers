import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { FINANCIAMIENTO_PROMPT_V1 } from "../prompts/financiamiento.js";

const CONTRACT_VERSION = "1";

const FINANCIAMIENTO_SCHEMA_V1 = {
  type: "object",
  properties: {
    documento_valido: { type: "boolean" },
    vin: { type: "string", nullable: true },
    financiera: { type: "string", nullable: true },
    nombre_cliente: { type: "string", nullable: true },
    rut_cliente: { type: "string", nullable: true },
    nombre_dealer: { type: "string", nullable: true },
    rut_dealer: { type: "string", nullable: true },
    monto_financiado: { type: "integer", nullable: true },
    numero_operacion: { type: "string", nullable: true },
    fecha_aprobacion: { type: "string", nullable: true },
    estado_aprobacion: { type: "string", nullable: true },
  },
  required: [
    "documento_valido",
    "vin",
    "financiera",
    "nombre_cliente",
    "rut_cliente",
    "nombre_dealer",
    "rut_dealer",
    "monto_financiado",
    "numero_operacion",
    "fecha_aprobacion",
    "estado_aprobacion",
  ],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function extractFinanciamiento({ tenantId, fileId, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({
    prompt: FINANCIAMIENTO_PROMPT_V1,
    schema: FINANCIAMIENTO_SCHEMA_V1,
    file,
  });

  const documentoValido = extracted.documento_valido === true;
  const vin = normalizeVin(extracted.vin);

  return {
    tenant_id: tenantId,
    document_type: "FINANCIAMIENTO",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    documento_valido: documentoValido,
    vin: vin || null,
    financiera: extracted.financiera || null,
    nombre_cliente: extracted.nombre_cliente || null,
    rut_cliente: extracted.rut_cliente || null,
    nombre_dealer: extracted.nombre_dealer || null,
    rut_dealer: extracted.rut_dealer || null,
    monto_financiado: extracted.monto_financiado ?? null,
    numero_operacion: extracted.numero_operacion || null,
    fecha_aprobacion: extracted.fecha_aprobacion || null,
    estado_aprobacion: extracted.estado_aprobacion || null,
    parse_error: extracted._parse_error === true,
    status: !documentoValido ? "INVALID_DOCUMENT" : "OK",
  };
}
