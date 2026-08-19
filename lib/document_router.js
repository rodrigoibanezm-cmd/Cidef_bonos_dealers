import fs from "fs/promises";
import path from "path";
import { callGemini } from "./gemini_client.js";
import { getR2Object } from "./r2.js";

const ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || "gemini-3.5-flash-lite";

const ROUTER_SCHEMA = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: ["FC", "FV", "INSCRIPCION", "FINANCIAMIENTO", "REPOSICION", "BASURA"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
  required: ["document_type", "confidence"],
};

let promptCache = null;

async function getPrompt() {
  if (!promptCache) {
    promptCache = fs.readFile(path.join(process.cwd(), "prompts", "document_router.md"), "utf8");
  }
  return promptCache;
}

export async function classifyDocumentFromR2(key) {
  const object = await getR2Object(key);
  const prompt = await getPrompt();
  const raw = await callGemini({
    prompt,
    file: {
      mimeType: object.contentType || "image/jpeg",
      base64: object.buffer.toString("base64"),
    },
    schema: ROUTER_SCHEMA,
    model: ROUTER_MODEL,
    retries: 2,
  });

  const parsed = JSON.parse(raw);
  return {
    document_type: parsed.document_type,
    confidence: Number(parsed.confidence),
  };
}
