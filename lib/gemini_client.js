import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const status = error?.status || error?.code;
  return status === 429 || status === 500 || status === 503;
}

export async function callGemini({ prompt, file, schema, model, retries = 3 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const client = new GoogleGenAI({ apiKey });
  const selectedModel = model || process.env.GEMINI_EXTRACT_MODEL || DEFAULT_MODEL;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: selectedModel,
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: file.mimeType, data: file.base64 } },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: "MINIMAL" },
        },
      });
      return response.text || "";
    } catch (error) {
      if (!isRetryable(error) || attempt === retries) throw error;
      await sleep(attempt * 3000);
    }
  }

  throw new Error("Gemini failed without response");
}
