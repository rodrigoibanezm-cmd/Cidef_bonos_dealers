import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { INSCRIP_PROMPT_V1 } from "../prompts/inscrip.js";

const CONTRACT_VERSION = "3";

const INSCRIP_SCHEMA_V1 = {
  type: "object",
  properties: {
    documento_valido: { type: "boolean" },
    tipo_tramite: { type: "string", nullable: true },
    folio: { type: "string", nullable: true },
    numero_solicitud: { type: "string", nullable: true },
    fecha_solicitud: { type: "string", nullable: true },
    vin_documento: { type: "string", nullable: true },
    ppu: { type: "string", nullable: true },
    marca: { type: "string", nullable: true },
    modelo: { type: "string", nullable: true },
    anio: { type: "integer", nullable: true },
    nombre_adquirente: { type: "string", nullable: true },
    rut_adquirente: { type: "string", nullable: true },
    nombre_dealer: { type: "string", nullable: true },
    rut_dealer: { type: "string", nullable: true },
  },
  required: ["documento_valido", "tipo_tramite", "folio", "numero_solicitud", "fecha_solicitud", "vin_documento", "ppu", "marca", "modelo", "anio", "nombre_adquirente", "rut_adquirente", "nombre_dealer", "rut_dealer"],
};

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function extractInscrip({ tenantId, fileId, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({
    prompt: INSCRIP_PROMPT_V1,
    schema: INSCRIP_SCHEMA_V1,
    file,
  });

  const documentoValido = extracted.documento_valido === true;
  const vinDocumento = normalizeVin(extracted.vin_documento);

  return {
    tenant_id: tenantId,
    document_type: "INSCRIPCION",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    documento_valido: documentoValido,
    tipo_tramite: extracted.tipo_tramite || null,
    folio: extracted.folio || null,
    numero_solicitud: extracted.numero_solicitud || null,
    fecha_solicitud: extracted.fecha_solicitud || null,
    vin: vinDocumento || null,
    vin_documento: vinDocumento || null,
    ppu: extracted.ppu || null,
    marca: extracted.marca || null,
    modelo: extracted.modelo || null,
    anio: extracted.anio ?? null,
    nombre_adquirente: extracted.nombre_adquirente || null,
    rut_adquirente: extracted.rut_adquirente || null,
    nombre_dealer: extracted.nombre_dealer || null,
    rut_dealer: extracted.rut_dealer || null,
    parse_error: extracted._parse_error === true,
    status: !documentoValido ? "INVALID_DOCUMENT" : vinDocumento ? "OK" : "VIN_UNREADABLE",
  };
}
