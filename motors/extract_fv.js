import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { FV_PROMPT_V1 } from "../prompts/fv.js";
import { FV_VIN_PROMPT_V1 } from "../prompts/fv_vin.js";

const CONTRACT_VERSION = "4";

const FV_VIN_SCHEMA_V1 = {
  type: "object",
  properties: { vin_documento: { type: "string", nullable: true } },
  required: ["vin_documento"],
};

const FV_SCHEMA_V1 = {
  type: "object",
  properties: {
    vin: { type: "string", nullable: true },
    nombre_cliente: { type: "string", nullable: true },
    rut_cliente: { type: "string", nullable: true },
    nombre_facturado: { type: "string", nullable: true },
    rut_facturado: { type: "string", nullable: true },
    nombre_compra_para: { type: "string", nullable: true },
    rut_compra_para: { type: "string", nullable: true },
    nombre_dealer: { type: "string", nullable: true },
    rut_dealer: { type: "string", nullable: true },
    folio_factura_venta: { type: "integer", nullable: true },
    fecha_factura_venta: { type: "string", nullable: true },
    precio_venta_total: { type: "integer", nullable: true },
    financiamiento: { type: "string", nullable: true },
  },
  required: [
    "vin", "nombre_cliente", "rut_cliente", "nombre_facturado", "rut_facturado",
    "nombre_compra_para", "rut_compra_para", "nombre_dealer", "rut_dealer",
    "folio_factura_venta", "fecha_factura_venta", "precio_venta_total", "financiamiento",
  ],
};

function normalizeVin(value) {
  const cleaned = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || null;
}

function normalizeRut(value) {
  const cleaned = String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (cleaned.length < 2) return null;
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

function normalizeText(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export async function validateFvVin({ tenantId, fileId, expectedVin, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!expectedVin) throw new Error("expectedVin is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const vinCheck = await runDocumentExtraction({ prompt: FV_VIN_PROMPT_V1, schema: FV_VIN_SCHEMA_V1, file });
  const vinDocumento = normalizeVin(vinCheck.vin_documento);
  const vinEsperado = normalizeVin(expectedVin);
  const vinMatch = Boolean(vinDocumento && vinEsperado && vinDocumento === vinEsperado);

  return {
    tenant_id: tenantId, document_type: "FV", contract_version: CONTRACT_VERSION,
    file_id: fileId, expected_vin: vinEsperado, vin_documento: vinDocumento,
    vin_match: vinMatch, parse_error: vinCheck._parse_error === true,
    status: vinMatch ? "OK" : vinDocumento ? "VIN_MISMATCH" : "VIN_UNREADABLE",
  };
}

export async function extractFv({ tenantId, fileId, expectedVin = null, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({ prompt: FV_PROMPT_V1, schema: FV_SCHEMA_V1, file });
  const vinDocumento = normalizeVin(extracted.vin);
  const vinEsperado = normalizeVin(expectedVin);
  const vinMatch = vinEsperado ? Boolean(vinDocumento && vinDocumento === vinEsperado) : null;

  return {
    tenant_id: tenantId,
    document_type: "FV",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    expected_vin: vinEsperado,
    vin: vinDocumento,
    vin_documento: vinDocumento,
    vin_match: vinMatch,
    nombre_cliente: normalizeText(extracted.nombre_cliente),
    rut_cliente: normalizeRut(extracted.rut_cliente),
    nombre_facturado: normalizeText(extracted.nombre_facturado),
    rut_facturado: normalizeRut(extracted.rut_facturado),
    nombre_compra_para: normalizeText(extracted.nombre_compra_para),
    rut_compra_para: normalizeRut(extracted.rut_compra_para),
    nombre_dealer: normalizeText(extracted.nombre_dealer),
    rut_dealer: normalizeRut(extracted.rut_dealer),
    folio_factura_venta: extracted.folio_factura_venta ?? null,
    fecha_factura_venta: extracted.fecha_factura_venta ?? null,
    precio_venta_total: extracted.precio_venta_total ?? null,
    financiamiento: normalizeText(extracted.financiamiento)?.toUpperCase() ?? null,
    parse_error: extracted._parse_error === true,
    status: extracted._parse_error === true
      ? "PARSE_ERROR"
      : vinEsperado && !vinMatch
        ? vinDocumento ? "VIN_MISMATCH" : "VIN_UNREADABLE"
        : "OK",
  };
}
