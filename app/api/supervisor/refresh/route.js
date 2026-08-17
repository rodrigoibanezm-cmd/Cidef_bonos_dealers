import { NextResponse } from "next/server";
import { refreshSupervisorDealerAnalytics } from "../../../../motors/refresh_supervisor_dealer_analytics.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await refreshSupervisorDealerAnalytics();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Supervisor analytics refresh failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Supervisor analytics refresh failed" },
      { status: 500 }
    );
  }
}
