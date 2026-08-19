import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { persistReposicionExtraction } from "../../../lib/persist_reposicion_extraction.js";
import { extractReposicion } from "../../../motors/extract_reposicion.js";

export const runtime = "nodejs";
export const maxDuration = 60;

function tenantFromKey(key) {
  return String(key || "").split("/")[0] || "unknown";
}

function sourceFilenameFromKey(key) {
  const leaf = String(key || "").split("/").pop() || "";
  const match = leaf.match(/_src-([A-Za-z0-9_-]+)(?:_\d{3})?\.jpg$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });

    const result = await classifyDocumentFromR2(key);
    console.log(`[DOC_ROUTER] archivo=${key} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    if (result.document_type !== "REPOSICION") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=${result.document_type} motivo=ONLY_REPOSICION_ENABLED`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null });
    }

    const object = await getR2Object(key);
    const extraction = await extractReposicion({
      tenantId: tenantFromKey(key),
      fileId: key,
      file: { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" },
    });
    extraction.source_filename = sourceFilenameFromKey(key);

    const persisted = await persistReposicionExtraction(extraction);
    console.log(`[REPOSICION_EXTRACT] archivo=${key} source=${extraction.source_filename ?? "null"} resultado=${JSON.stringify(extraction)}`);
    console.log(`[REPOSICION_DB] archivo=${key} id=${persisted?.id ?? "null"} status=${persisted?.status ?? "null"}`);

    return NextResponse.json({ ok: true, key, ...result, extraction, persisted });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
