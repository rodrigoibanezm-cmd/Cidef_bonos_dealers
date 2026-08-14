import { NextResponse } from "next/server";
import { uploadToDrive } from "../../../lib/google_drive.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const vin = String(formData.get("vin") || "").trim().toUpperCase();
    const documentType = String(formData.get("document_type") || "TEST").trim().toUpperCase();

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const safeVin = vin || "SIN_VIN";
    const safeName = `${safeVin}_${documentType}_${file.name}`;

    const uploaded = await uploadToDrive({
      buffer: bytes,
      name: safeName,
      mimeType: file.type,
    });

    return NextResponse.json({ ok: true, file: uploaded });
  } catch (error) {
    console.error("Drive upload failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Drive upload failed" },
      { status: 500 }
    );
  }
}
