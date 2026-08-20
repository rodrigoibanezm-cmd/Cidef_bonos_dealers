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
    extract: ({ tenantId, fileId, expectedVin, file }) => extractFc({ tenantId, fileId, expectedVin, file }),
    persist: persistFcExtraction,
  },
  FV: {
    extract: ({ tenantId, fileId, expectedVin, file }) => extractFv({ tenantId, fileId, expectedVin, file }),
    persist: persistFvExtraction,
  },
  INSCRIPCION: {
    extract: ({ tenantId, fileId, file }) => extractInscrip({ tenantId, fileId, file }),
    persist: persistInscripcionExtraction,
  },
  FINANCIAMIENTO: {
    extract: ({ tenantId, fileId, file }) => extractFinanciamiento({ tenantId, fileId, file }),
    persist: persistFinanciamientoExtraction,
  },
  REPOSICION: {
    extract: ({ tenantId, fileId, file }) => extractReposicion({ tenantId, fileId, file }),
    persist: persistReposicionExtraction,
  },
};

export async function processExtractedDocument({ documentType, tenantId, fileId, sourceFilename, sourceVin = null, file }) {
  const handler = HANDLERS[documentType];
  if (!handler) return { extraction: null, persisted: null, skipped: true };

  const extraction = await handler.extract({
    tenantId,
    fileId,
    expectedVin: sourceVin,
    file,
  });

  extraction.source_filename = sourceFilename;
  const persisted = await handler.persist(extraction);
  return { extraction, persisted, skipped: false };
}
