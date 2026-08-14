import { callGemini } from "./gemini_client.js";

function parseJson(raw) {
  return JSON.parse(String(raw || "").trim());
}

export async function runDocumentExtraction({ prompt, file, schema, model }) {
  const raw = await callGemini({ prompt, file, schema, model });
  try {
    return parseJson(raw);
  } catch {
    return { _parse_error: true, readable: false };
  }
}
