import { NextResponse } from "next/server";
import { uploadToDrive } from "../../../lib/google_drive.js";
import { normalizeDocumentToJpegs } from "../../../lib/normalize_document_images.js";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeBaseName(name) {
  const raw = String(name || "document").replace(/\.[^.]+$/, "");
  return raw.replace(/[\\/:*?"<>|]/g, "_").trim() || "document";
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((file) => file && typeof file !== "string");

    if (!files.length) {
      const single = formData.get("file");
      if (single && typeof single !== "string") files.push(single);
    }

    if (!files.length) {
      return NextResponse.json({ ok: false, error: "files are required" }, { status: 400 });
    }

    const results = [];
    let totalPages = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];

      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        results.push({
          source_index: fileIndex,
          source_name: file.name || null,
          ok: false,
          error: `Formato no soportado: ${file.type || "desconocido"}`,
        });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pages = await normalizeDocumentToJpegs({ buffer, mimeType: file.type });
        const baseName = safeBaseName(file.name);
        const uploadedPages = [];

        for (const page of pages) {
          const suffix = String(page.pageNumber).padStart(3, "0");
          const pageName = `${baseName}_p${suffix}.jpg`;
          const uploaded = await uploadToDrive({
            buffer: page.buffer,
            name: pageName,
            mimeType: "image/jpeg",
          });

          uploadedPages.push({
            page: page.pageNumber,
            file_id: uploaded.id,
            file_name: uploaded.name,
            file_url: uploaded.webViewLink || null,
            mime_type: "image/jpeg",
          });
        }

        totalPages += uploadedPages.length;
        results.push({
          source_index: fileIndex,
          source_name: file.name || null,
          source_mime_type: file.type,
          ok: true,
          pages: uploadedPages,
        });
      } catch (error) {
        results.push({
          source_index: fileIndex,
          source_name: file.name || null,
          ok: false,
          error: error?.message || "Normalization failed",
        });
      }
    }

    const filesOk = results.filter((item) => item.ok).length;
    const filesError = results.length - filesOk;

    return NextResponse.json({
      ok: filesError === 0,
      files_received: files.length,
      files_ok: filesOk,
      files_error: filesError,
      jpg_pages_created: totalPages,
      results,
    });
  } catch (error) {
    console.error("Document normalization failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Document normalization failed" },
      { status: 500 },
    );
  }
}
