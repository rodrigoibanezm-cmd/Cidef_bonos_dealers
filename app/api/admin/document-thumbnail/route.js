import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";
import { getDriveThumbnail } from "../../../../lib/google_drive.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    const documentType = String(url.searchParams.get("document_type") || "").trim().toUpperCase();
    if (!requestId || !documentType) return NextResponse.json({ ok: false, error: "Missing document" }, { status: 400 });

    const sql = db();
    const rows = await sql`select file_id from bonus_request_documents where request_id=${requestId} and document_type=${documentType} limit 1`;
    const file = rows[0];
    if (!file?.file_id) return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });

    const image = await getDriveThumbnail(file.file_id);
    return new NextResponse(image, { headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
    }});
  } catch (error) {
    console.error("Document thumbnail failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document thumbnail failed" }, { status: 500 });
  }
}
