import { NextResponse } from "next/server";
import { getR2Object, putR2Object, deleteR2Object } from "../../../../lib/r2.js";
import { normalizeDocumentToJpegs } from "../../../../lib/normalize_document_images.js";

export const runtime = "nodejs";
export const maxDuration = 300;

function pageBaseName(key) {
  const filename = key.split("/").pop() || "document";
  return filename.replace(/\.[^.]+$/, "");
}

function pagesPrefix(key) {
  if (key.includes("/original/")) return key.replace(/\/original\/[^/]+$/, "/pages");
  return `${key.replace(/\/[^/]+$/, "")}/pages`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "");
    const contentType = String(body?.content_type || "application/octet-stream");

    if (!key) {
      return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
    }

    const original = await getR2Object(key);
    const pages = await normalizeDocumentToJpegs({
      buffer: original.buffer,
      mimeType: contentType || original.contentType,
    });

    const prefix = pagesPrefix(key);
    const base = pageBaseName(key);
    const created = [];

    for (const page of pages) {
      const suffix = String(page.pageNumber).padStart(3, "0");
      const pageKey = `${prefix}/${base}_${suffix}.jpg`;
      await putR2Object({ key: pageKey, buffer: page.buffer, contentType: "image/jpeg" });
      created.push({ page: page.pageNumber, key: pageKey });
    }

    if (created.length !== pages.length || created.length === 0) {
      throw new Error("No se pudieron confirmar todas las páginas JPG");
    }

    await deleteR2Object(key);

    return NextResponse.json({
      ok: true,
      source_deleted: true,
      pages_created: created.length,
      pages: created,
    });
  } catch (error) {
    console.error("R2 normalization failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "R2 normalization failed" }, { status: 500 });
  }
}
