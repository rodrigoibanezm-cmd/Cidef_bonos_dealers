import { NextResponse } from "next/server";
import { approveBonusRequest } from "../../../../../lib/approval_workflow.js";
import { getBonusAuditor } from "../../../../../lib/auditors.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.request_id || "").trim();
    const auditorId = String(body?.auditor_id || "").trim();
    if (!requestId || !auditorId) {
      return NextResponse.json({ ok: false, error: "request_id and auditor_id are required" }, { status: 400 });
    }
    const auditor = await getBonusAuditor(auditorId);
    if (!auditor) return NextResponse.json({ ok: false, error: "Auditor is not active or does not exist" }, { status: 403 });

    const result = await approveBonusRequest({
      requestId,
      actorUserId: auditor.id,
      actorTenantId: auditor.tenant_id,
    });
    return NextResponse.json({ ...result, signed_by: auditor.name });
  } catch (error) {
    console.error("Approve request failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Approve request failed" }, { status: 500 });
  }
}
