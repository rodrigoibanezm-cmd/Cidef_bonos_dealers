import { NextResponse } from "next/server";
import { consolidateBonusOperations } from "../../../motors/consolidate_bonus_operations.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = body?.tenant_id ? String(body.tenant_id) : null;
    const result = await consolidateBonusOperations({ tenantId });
    console.log(`[BONUS_CONSOLIDATE] tenant=${tenantId ?? "ALL"} processed=${result.processed}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[BONUS_CONSOLIDATE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Consolidation failed" }, { status: 500 });
  }
}
