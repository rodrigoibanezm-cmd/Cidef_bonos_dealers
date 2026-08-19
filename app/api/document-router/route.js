import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();

    if (!key) {
      return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
    }

    const result = await classifyDocumentFromR2(key);
    console.log(`[DOC_ROUTER] archivo=${key} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    return NextResponse.json({ ok: true, key, ...result });
  } catch (error) {
    console.error("[DOC_ROUTER_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document router failed" }, { status: 500 });
  }
}
