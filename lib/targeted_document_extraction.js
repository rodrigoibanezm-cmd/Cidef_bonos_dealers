import { runDocumentExtraction } from "./run_document_extraction.js";

export const EXTRACTION_MODE = Object.freeze({
  FULL: "full",
  TARGETED: "targeted",
});

export function targetedContract({ mode = EXTRACTION_MODE.FULL, fields, context, reason, attempt, schema }) {
  if (mode === EXTRACTION_MODE.FULL) return null;
  if (mode !== EXTRACTION_MODE.TARGETED) throw new Error(`unsupported extraction mode: ${mode}`);
  if (!Array.isArray(fields) || fields.length === 0) throw new Error("fields is required in targeted mode");
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("context is required in targeted mode");
  if (!String(reason || "").trim()) throw new Error("reason is required in targeted mode");
  if (![1, 2].includes(Number(attempt))) throw new Error("attempt must be 1 or 2 in targeted mode");

  const uniqueFields = [...new Set(fields.map((field) => String(field || "").trim()).filter(Boolean))];
  const unsupported = uniqueFields.filter((field) => !schema.properties?.[field]);
  if (unsupported.length) throw new Error(`unsupported targeted fields: ${unsupported.join(", ")}`);

  return { fields: uniqueFields, context, reason: String(reason), attempt: Number(attempt) };
}

export async function runTargetedDocumentExtraction({ documentType, prompt, schema, file, contract }) {
  const targetedSchema = {
    type: "object",
    properties: Object.fromEntries(contract.fields.map((field) => [field, schema.properties[field]])),
    required: contract.fields,
  };
  const targetedPrompt = `${prompt}\n\nMODO TARGETED DE AUDITORIA\nReextrae exclusivamente estos campos: ${contract.fields.join(", ")}.\nNo vuelvas a extraer ni devuelvas otros campos.\nMotivo: ${contract.reason}.\nIntento: ${contract.attempt} de 2.\nContexto de comparación (no es fuente y no autoriza completar datos): ${JSON.stringify(contract.context)}.`;
  const extracted = await runDocumentExtraction({ prompt: targetedPrompt, schema: targetedSchema, file });

  return {
    ...extracted,
    _targeted: {
      document_type: documentType,
      fields: contract.fields,
      context: contract.context,
      reason: contract.reason,
      attempt: contract.attempt,
    },
  };
}
