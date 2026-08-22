import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

async function deleteAllBonusTestData(sql) {
  // Test-only cleanup. Keep inventory, price lists and master tables intact.
  await sql`delete from bonus_request_reviews`;
  await sql`delete from bonus_request_events`;
  await sql`delete from bonus_request_documents`;
  await sql`delete from bonus_price_lookup_audits`;
  await sql`delete from bonus_operation_identity_audits`;
  await sql`delete from bonus_operation_closure_audits`;
  await sql`delete from bonus_document_extraction_audits`;
  await sql`delete from bonus_document_pages`;
  await sql`delete from bonus_reposicion_extractions`;
  await sql`delete from bonus_financiamiento_extractions`;
  await sql`delete from bonus_inscripcion_extractions`;
  await sql`delete from bonus_fc_extractions`;
  await sql`delete from bonus_fv_extractions`;
  await sql`delete from bonus_requests`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.requestId || "").trim();
    const deleteAll = body?.deleteAll === true;

    if (!requestId && !deleteAll) {
      return NextResponse.json({ ok: false, error: "requestId or deleteAll required" }, { status: 400 });
    }

    const sql = db();

    if (deleteAll) {
      await deleteAllBonusTestData(sql);
      return NextResponse.json({ ok: true, deletedAll: true });
    }

    const targets = await sql`select id from bonus_requests where id::text = ${requestId}`;
    if (!targets.length) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const ids = targets.map((row) => String(row.id));

    // Single-OT cleanup remains intentionally scoped to the operational request.
    await sql`delete from bonus_request_reviews where request_id::text = any(${ids})`;
    await sql`delete from bonus_request_events where request_id::text = any(${ids})`;
    await sql`delete from bonus_request_documents where request_id::text = any(${ids})`;
    await sql`delete from bonus_requests where id::text = any(${ids})`;

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    console.error("[ADMIN_TEST_CLEANUP]", error);
    return NextResponse.json({ ok: false, error: error?.message || "cleanup failed" }, { status: 500 });
  }
}
