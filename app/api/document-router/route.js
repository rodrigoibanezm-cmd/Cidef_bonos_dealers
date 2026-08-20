import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { processExtractedDocument } from "../../../lib/process_extracted_document.js";

export const runtime = "nodejs";
export const maxDuration = 60;

function tenantFromKey(key) {
  return String(key || "").split("/")[0] || "unknown";
}

function sourceFilenameFromKey(key) {
  const leaf = String(key || "").split("/").pop() || "";
  const match = leaf.match(/_src-([A-Za-z0-9_-]+?)_\d{3}\.jpg$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

function vinFromSourceFilename(sourceFilename) {
  const matches = String(sourceFilename || "").toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g);
  return matches?.[0] || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });

    const result = await classifyDocumentFromR2(key);
    const sourceFilename = sourceFilenameFromKey(key);
    console.log(`[DOC_ROUTER] archivo=${key} source=${sourceFilename ?? "null"} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    if (result.document_type === "BASURA") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=BASURA`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null, persisted: null });
    }

    const object = await getR2Object(key);
    const file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
    const tenantId = tenantFromKey(key);
    const sourceVin = vinFromSourceFilename(sourceFilename);

    const processed = await processExtractedDocument({
      documentType: result.document_type,
      tenantId,
      fileId: key,
      sourceFilename,
      sourceVin,
      file,
    });

    console.log(`[DOC_EXTRACT] archivo=${key} tipo=${result.document_type} source=${sourceFilename ?? "null"} status=${processed.extraction?.status ?? "null"}`);
    console.log(`[DOC_DB] archivo=${key} tipo=${result.document_type} id=${processed.persisted?.id ?? "null"} status=${processed.persisted?.status ?? "null"}`);

    return NextResponse.json({
      ok: true,
      key,
      ...result,
      extraction: processed.extraction,
      persisted: processed.persisted,
    });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
