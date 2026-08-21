import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.requestId || "").trim();
    const deleteAll = body?.deleteAll === true;

    if (!requestId && !deleteAll) {
      return NextResponse.json({ ok: false, error: "requestId or deleteAll required" }, { status: 400 });
    }

    const sql = db();
    const targets = deleteAll
      ? await sql`select id from bonus_requests`
      : await sql`select id from bonus_requests where id::text = ${requestId}`;

    if (!targets.length) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const ids = targets.map((row) => String(row.id));

    await sql.begin(async (tx) => {
      await tx`delete from bonus_request_events where request_id::text = any(${ids})`;
      await tx`delete from bonus_request_documents where request_id::text = any(${ids})`;
      await tx`delete from bonus_requests where id::text = any(${ids})`;
    });

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    console.error("[ADMIN_TEST_CLEANUP]", error);
    return NextResponse.json({ ok: false, error: error?.message || "cleanup failed" }, { status: 500 });
  }
}
