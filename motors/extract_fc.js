import { runDocumentExtraction } from "../lib/run_document_extraction.js";
import { FC_PROMPT_V1 } from "../prompts/fc.js";

const CONTRACT_VERSION = "1";

export async function extractFc({ tenantId, fileId, file }) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!fileId) throw new Error("fileId is required");
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const extracted = await runDocumentExtraction({
    prompt: FC_PROMPT_V1,
    file,
  });

  return {
    tenant_id: tenantId,
    document_type: "FC",
    contract_version: CONTRACT_VERSION,
    file_id: fileId,
    vin: extracted.vin ?? null,
    folio_factura_compra: extracted.folio_factura_compra ?? null,
    fecha_factura_compra: extracted.fecha_factura_compra ?? null,
    precio_compra_total: extracted.precio_compra_total ?? null,
    nota_venta: extracted.nota_venta ?? null,
    readable: extracted.readable === true,
    parse_error: extracted._parse_error === true,
  };
}
