import { NextResponse } from "next/server";
import { approveBonusDocument } from "../../../../../lib/approval_workflow.js";
import { getBonusAuditor } from "../../../../../lib/auditors.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.request_id || "").trim();
    const documentType = String(body?.document_type || "").trim().toUpperCase();
    const auditorId = String(body?.auditor_id || "").trim();
    if (!requestId || !documentType || !auditorId) {
      return NextResponse.json({ ok: false, error: "request_id, document_type and auditor_id are required" }, { status: 400 });
    }

    const auditor = await getBonusAuditor(auditorId);
    if (!auditor) {
      return NextResponse.json({ ok: false, error: "Auditor is not active or does not exist" }, { status: 403 });
    }

    const result = await approveBonusDocument({
      requestId,
      documentType,
      actorUserId: auditor.id,
      actorTenantId: auditor.tenant_id,
      reviewedExtraction: body?.reviewed_extraction || null,
    });

    return NextResponse.json({ ...result, signed_by: auditor.name });
  } catch (error) {
    console.error("Approve document failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Approve document failed" }, { status: 500 });
  }
}
