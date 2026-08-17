import { NextResponse } from "next/server";
import { seedDealerSucursales } from "../../../../../motors/seed_dealer_sucursales.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await seedDealerSucursales();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Dealer sucursales seed failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Dealer sucursales seed failed" },
      { status: 500 }
    );
  }
}
