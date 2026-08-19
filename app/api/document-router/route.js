import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { persistInscripcionExtraction } from "../../../lib/persist_inscripcion_extraction.js";
import { extractInscrip } from "../../../motors/extract_inscrip.js";

export const runtime = "nodejs";
export const maxDuration = 60;

function tenantFromKey(key) {
  return String(key || "").split("/")[0] || "unknown";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();

    if (!key) {
      return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
    }

    const result = await classifyDocumentFromR2(key);
    console.log(`[DOC_ROUTER] archivo=${key} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    if (result.document_type !== "INSCRIPCION") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=${result.document_type} motivo=ONLY_INSCRIPCION_ENABLED`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null });
    }

    const object = await getR2Object(key);
    const extraction = await extractInscrip({
      tenantId: tenantFromKey(key),
      fileId: key,
      file: {
        base64: object.buffer.toString("base64"),
        mimeType: object.contentType || "image/jpeg",
      },
    });

    console.log(`[INSCRIP_EXTRACT] archivo=${key} resultado=${JSON.stringify(extraction)}`);

    const persisted = await persistInscripcionExtraction(extraction);
    console.log(`[INSCRIP_DB] archivo=${key} id=${persisted?.id ?? "null"} vin=${persisted?.vin ?? "null"} solicitud=${persisted?.numero_solicitud ?? "null"} status=${persisted?.status ?? "null"}`);

    return NextResponse.json({ ok: true, key, ...result, extraction, persisted });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
