import { callGemini } from "./gemini_client.js";

function parseJson(raw) {
  const cleaned = String(raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function runDocumentExtraction({ prompt, file, model }) {
  const raw = await callGemini({ prompt, file, model });
  try {
    return parseJson(raw);
  } catch {
    return { _parse_error: true, readable: false };
  }
}
