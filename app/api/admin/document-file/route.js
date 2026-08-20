import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";
import { getR2Object } from "../../../../lib/r2.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    const documentType = String(url.searchParams.get("document_type") || "").trim().toUpperCase();
    if (!requestId || !documentType) return NextResponse.json({ ok: false, error: "Missing document" }, { status: 400 });

    const sql = db();
    const rows = await sql`select file_id, file_name from bonus_request_documents where request_id=${requestId} and document_type=${documentType} limit 1`;
    const file = rows[0];
    if (!file?.file_id) return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });

    const object = await getR2Object(file.file_id);
    return new NextResponse(object.buffer, { headers: {
      "Content-Type": object.contentType || "image/jpeg",
      "Content-Disposition": `inline; filename="${file.file_name || "documento.jpg"}"`,
      "Cache-Control": "private, max-age=300",
    }});
  } catch (error) {
    console.error("Document preview failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document preview failed" }, { status: 500 });
  }
}
