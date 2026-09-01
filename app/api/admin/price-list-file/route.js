import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";
import { getR2Object } from "../../../../lib/r2.js";

export const runtime = "nodejs";

function safeFilename(value) {
  const filename = String(value || "").trim();
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return "";
  return filename;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    if (!requestId) return NextResponse.json({ ok: false, error: "Missing request_id" }, { status: 400 });

    const sql = db();
    const rows = await sql`
      select
        br.lista_precio_utilizada,
        (
          select a.evidence->>'source_file'
          from bonus_price_lookup_audits a
          where a.request_id=br.id
            and a.status='ok'
            and coalesce(a.evidence->>'source_file','')<>''
          order by a.created_at desc
          limit 1
        ) as audit_source_file
      from bonus_requests br
      where br.id=${requestId}
      limit 1
    `;
    const filename = safeFilename(rows[0]?.lista_precio_utilizada || rows[0]?.audit_source_file);
    if (!filename) return NextResponse.json({ ok: false, error: "Price list not found" }, { status: 404 });

    const object = await getR2Object(`precios/${filename}`);
    return new NextResponse(object.buffer, { headers: {
      "Content-Type": object.contentType === "application/octet-stream"
        ? "application/vnd.ms-excel.sheet.binary.macroEnabled.12"
        : object.contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=300",
    }});
  } catch (error) {
    console.error("Price list preview failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Price list preview failed" }, { status: 500 });
  }
}
