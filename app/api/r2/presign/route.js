import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createPresignedUpload } from "../../../../lib/r2.js";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeSegment(value, fallback = "file") {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
  return clean || fallback;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    const tenantId = process.env.DEFAULT_TENANT_ID || "dealer_demo";
    const batchId = safeSegment(body?.batch_id || randomUUID(), randomUUID());
    const targetVin = body?.target_vin ? safeSegment(String(body.target_vin).toUpperCase(), "") : "";
    const targetDocumentType = body?.target_document_type ? safeSegment(String(body.target_document_type).toUpperCase(), "") : "";

    if (!files.length) {
      return NextResponse.json({ ok: false, error: "files are required" }, { status: 400 });
    }

    if (files.length > 500) {
      return NextResponse.json({ ok: false, error: "Máximo 500 archivos por lote" }, { status: 400 });
    }

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const uploads = [];
    const basePath = targetVin && targetDocumentType
      ? [safeSegment(tenantId, "tenant"), year, month, "corrections", targetVin, targetDocumentType, batchId]
      : [safeSegment(tenantId, "tenant"), year, month, "batches", batchId, "original"];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index] || {};
      const contentType = String(file.type || "application/octet-stream");
      if (!ALLOWED_MIME_TYPES.has(contentType)) {
        uploads.push({ index, ok: false, error: `Formato no soportado: ${contentType}`, name: file.name || null });
        continue;
      }

      const originalName = safeSegment(file.name, `archivo_${index + 1}`);
      const uniqueName = `${String(index + 1).padStart(4, "0")}_${randomUUID()}_${originalName}`;
      const key = [...basePath, uniqueName].join("/");
      const signed = await createPresignedUpload({ key, contentType });

      uploads.push({
        index,
        ok: true,
        name: file.name || originalName,
        size: Number(file.size || 0),
        content_type: contentType,
        key: signed.key,
        upload_url: signed.url,
      });
    }

    return NextResponse.json({
      ok: uploads.some((item) => item.ok),
      tenant_id: tenantId,
      batch_id: batchId,
      target_vin: targetVin || null,
      target_document_type: targetDocumentType || null,
      uploads,
    });
  } catch (error) {
    console.error("R2 presign failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "R2 presign failed" }, { status: 500 });
  }
}
