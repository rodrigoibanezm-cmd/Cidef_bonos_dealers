import { NextResponse } from "next/server";
import { submitBonusRequest } from "../../../../lib/bonus_requests.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const requestId = String(body?.request_id || "").trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, error: "request_id is required" }, { status: 400 });
    }

    const result = await submitBonusRequest(requestId);
    if (!result) {
      return NextResponse.json({ ok: false, error: "request not found or already submitted" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, request: result });
  } catch (error) {
    console.error("Submit request failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Submit request failed" }, { status: 500 });
  }
}
