import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { persistFcExtraction } from "../../../lib/persist_fc_extraction.js";
import { extractFc, validateFcVin } from "../../../motors/extract_fc.js";

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

    if (result.document_type !== "FC") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=${result.document_type} motivo=ONLY_FC_ENABLED`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null });
    }

    const object = await getR2Object(key);
    const file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
    const tenantId = tenantFromKey(key);
    const sourceVin = vinFromSourceFilename(sourceFilename);

    if (!sourceVin) {
      console.log(`[FC_EXTRACT_SKIP] archivo=${key} source=${sourceFilename ?? "null"} motivo=SOURCE_VIN_REQUIRED`);
      return NextResponse.json({ ok: true, key, ...result, document_type: "FC", extraction: null, warning: "SOURCE_VIN_REQUIRED" });
    }

    const vinCheck = await validateFcVin({ tenantId, fileId: key, expectedVin: sourceVin, file });
    console.log(`[FC_ROUTE] archivo=${key} source=${sourceFilename ?? "null"} source_vin=${sourceVin} doc_vin=${vinCheck?.vin_documento ?? "null"} vin_match=${vinCheck.vin_match}`);

    if (!vinCheck.vin_match) {
      console.log(`[FC_EXTRACT_SKIP] archivo=${key} motivo=VIN_MISMATCH_OR_UNREADABLE`);
      return NextResponse.json({ ok: true, key, ...result, document_type: "FC", extraction: vinCheck, persisted: null });
    }

    const extraction = await extractFc({ tenantId, fileId: key, expectedVin: sourceVin, file });
    extraction.source_filename = sourceFilename;
    const persisted = await persistFcExtraction(extraction);

    console.log(`[FC_EXTRACT] archivo=${key} source=${sourceFilename ?? "null"} resultado=${JSON.stringify(extraction)}`);
    console.log(`[FC_DB] archivo=${key} id=${persisted?.id ?? "null"} status=${persisted?.status ?? "null"}`);

    return NextResponse.json({ ok: true, key, ...result, document_type: "FC", extraction, persisted });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
