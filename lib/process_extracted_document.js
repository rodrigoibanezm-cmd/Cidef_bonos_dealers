import { extractFc } from "../motors/extract_fc.js";
import { extractFv } from "../motors/extract_fv.js";
import { extractInscrip } from "../motors/extract_inscrip.js";
import { extractFinanciamiento } from "../motors/extract_financiamiento.js";
import { extractReposicion } from "../motors/extract_reposicion.js";
import { persistFcExtraction } from "./persist_fc_extraction.js";
import { persistFvExtraction } from "./persist_fv_extraction.js";
import { persistInscripcionExtraction } from "./persist_inscripcion_extraction.js";
import { persistFinanciamientoExtraction } from "./persist_financiamiento_extraction.js";
import { persistReposicionExtraction } from "./persist_reposicion_extraction.js";

const HANDLERS = {
  FC: {
    extract: (input) => extractFc(input),
    persist: persistFcExtraction,
  },
  FV: {
    extract: (input) => extractFv(input),
    persist: persistFvExtraction,
  },
  INSCRIPCION: {
    extract: (input) => extractInscrip(input),
    persist: persistInscripcionExtraction,
  },
  FINANCIAMIENTO: {
    extract: (input) => extractFinanciamiento(input),
    persist: persistFinanciamientoExtraction,
  },
  REPOSICION: {
    extract: (input) => extractReposicion(input),
    persist: persistReposicionExtraction,
  },
};

export async function processExtractedDocument({
  documentType,
  tenantId,
  fileId,
  sourceFilename,
  sourceVin = null,
  file,
  mode = "full",
  fields = null,
  context = null,
  reason = null,
  attempt = null,
}) {
  const handler = HANDLERS[documentType];
  if (!handler) return { extraction: null, persisted: null, skipped: true };

  const extraction = await handler.extract({
    tenantId,
    fileId,
    expectedVin: sourceVin,
    file,
    mode,
    fields,
    context,
    reason,
    attempt,
  });

  if (mode === "targeted") return { extraction, persisted: null, skipped: false };

  extraction.source_filename = sourceFilename;
  extraction.operation_vin = sourceVin;
  if (documentType === "REPOSICION" && sourceVin && !extraction.vin_original) {
    extraction.vin_original = sourceVin;
  }

  const persisted = await handler.persist(extraction);
  return { extraction, persisted, skipped: false };
}
