import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db.js";
import { calculateBonusRequest } from "../../../../../motors/calculate_bonus_request.js";

export const runtime = "nodejs";

const CALCULATION_ISSUES = new Set([
  "CALCULATION_REQUIRES_REVIEW",
  "PDV_PENDING",
  "TOTAL_DEVOLVER_PENDING",
  "FECHA_VENTA_REQUIRED",
]);

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isCalculationIssue(code) {
  return CALCULATION_ISSUES.has(code) || String(code || "").startsWith("PRICE_LOOKUP_");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.request_id || "").trim();
    const rawDiscount = body?.descuento_dealer;
    const descuentoDealer = Number(rawDiscount);

    if (!requestId) {
      return NextResponse.json({ ok: false, error: "request_id is required" }, { status: 400 });
    }
    if (rawDiscount === null || rawDiscount === undefined || rawDiscount === "" || !Number.isFinite(descuentoDealer) || descuentoDealer < 0) {
      return NextResponse.json({ ok: false, error: "descuento_dealer must be a non-negative number" }, { status: 400 });
    }

    const sql = db();
    const rows = await sql`select * from bonus_requests where id=${requestId} limit 1`;
    const current = rows[0];
    if (!current) {
      return NextResponse.json({ ok: false, error: "bonus request not found" }, { status: 404 });
    }

    const issues = asList(current.inconsistencias);
    const nonCalculationIssues = issues.filter((code) => !isCalculationIssue(code));
    const missingDocuments = asList(current.documentos_faltantes);

    // A manual dealer discount can resolve a calculation-only amber state.
    // Never clear independent documentary/identity problems here.
    if (!nonCalculationIssues.length && !missingDocuments.length) {
      await sql`
        update bonus_requests set
          requiere_revision_humana=false,
          updated_at=now()
        where id=${requestId}
      `;
    }

    const result = await calculateBonusRequest({
      requestId,
      descuentosDealerEvidence: descuentoDealer,
    });

    await sql`
      insert into bonus_request_events(request_id, action, actor_user_id, actor_tenant_id, metadata)
      values(
        ${requestId},
        'CALCULO_MANUAL_RECALCULADO',
        'REVIEW_PENDING_SIGNATURE',
        'CIDEF',
        ${JSON.stringify({ descuento_dealer: descuentoDealer, calculation_status: result?.calculation_status ?? result?.status ?? null })}::jsonb
      )
    `;

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[BONUS_MANUAL_RECALCULATE]", error);
    return NextResponse.json({ ok: false, error: error?.message || "recalculation failed" }, { status: 500 });
  }
}
