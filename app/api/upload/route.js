import { NextResponse } from "next/server";
import { uploadToDrive } from "../../../lib/google_drive.js";
import { validateFcVin } from "../../../motors/extract_fc.js";

export const runtime = "nodejs";

const ALLOWED_DOCUMENT_TYPES = new Set(["FV", "FC", "INSCRIP", "CARTA", "REPOS"]);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const vin = String(formData.get("vin") || "").trim().toUpperCase();
    const documentType = String(formData.get("document_type") || "").trim().toUpperCase();

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!vin) {
      return NextResponse.json({ ok: false, error: "vin is required" }, { status: 400 });
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json({ ok: false, error: "invalid document_type" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = file.type === "application/pdf" ? "pdf" : "bin";
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const generatedName = `${vin}_${documentType}_${timestamp}.${extension}`;

    const uploaded = await uploadToDrive({ buffer: bytes, name: generatedName, mimeType: file.type });

    let validation = null;
    if (documentType === "FC") {
      validation = await validateFcVin({
        tenantId: "dealer_demo",
        fileId: uploaded.id,
        expectedVin: vin,
        file: { base64: bytes.toString("base64"), mimeType: file.type },
      });
    }

    return NextResponse.json({ ok: true, document_type: documentType, vin, file: uploaded, validation });
  } catch (error) {
    console.error("Upload/validation failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Upload/validation failed" },
      { status: 500 }
    );
  }
}
