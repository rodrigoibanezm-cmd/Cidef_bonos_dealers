import { runDocumentExtraction } from "./run_document_extraction.js";
import { FC_VIN_PROMPT_V1 } from "../prompts/fc_vin.js";

const CHASSIS_SCHEMA = {
  type: "object",
  properties: {
    vin_documento: { type: "string", nullable: true },
    readable: { type: "boolean" },
  },
  required: ["vin_documento", "readable"],
};

export function normalizeChassis(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function readChassis(file) {
  const result = await runDocumentExtraction({
    prompt: FC_VIN_PROMPT_V1,
    schema: CHASSIS_SCHEMA,
    file,
  });

  return {
    vin: normalizeChassis(result.vin_documento) || null,
    readable: result.readable === true,
    parse_error: result._parse_error === true,
  };
}

export async function extractFcChassis({ file, comparisonVin = null }) {
  if (!file?.base64 || !file?.mimeType) throw new Error("file is required");

  const comparison = normalizeChassis(comparisonVin) || null;
  const first = await readChassis(file);
  const needsRetry = !first.vin || first.parse_error || (comparison && first.vin !== comparison);

  if (!needsRetry) {
    return { ...first, retried: false, first_vin: first.vin };
  }

  const second = await readChassis(file);
  return {
    ...second,
    retried: true,
    first_vin: first.vin,
    retry_consistent: Boolean(first.vin && second.vin && first.vin === second.vin),
  };
}
