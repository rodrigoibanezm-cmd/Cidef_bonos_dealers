import { NextResponse } from "next/server";
import { approveBonusDocument } from "../../../../../lib/approval_workflow.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const actorUserId = process.env.SUPERVISOR_USER_ID;
    const actorTenantId = process.env.SUPERVISOR_TENANT_ID;
    if (!actorUserId || !actorTenantId) {
      return NextResponse.json({ ok: false, error: "Supervisor identity is not configured" }, { status: 503 });
    }

    const body = await request.json();
    const requestId = String(body?.request_id || "").trim();
    const documentType = String(body?.document_type || "").trim().toUpperCase();
    if (!requestId || !documentType) {
      return NextResponse.json({ ok: false, error: "request_id and document_type are required" }, { status: 400 });
    }

    const result = await approveBonusDocument({
      requestId,
      documentType,
      actorUserId,
      actorTenantId,
      reviewedExtraction: body?.reviewed_extraction || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Approve document failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Approve document failed" }, { status: 500 });
  }
}
