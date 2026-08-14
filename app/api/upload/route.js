import { NextResponse } from "next/server";
import { uploadToDrive } from "../../../lib/google_drive.js";
import { extractFc } from "../../../motors/extract_fc.js";
import { extractFv } from "../../../motors/extract_fv.js";
import { extractInscrip } from "../../../motors/extract_inscrip.js";
import { extractCarta } from "../../../motors/extract_carta.js";

export const runtime = "nodejs";

const ALLOWED_DOCUMENT_TYPES = new Set(["FV", "FC", "INSCRIP", "CARTA", "REPOS"]);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const vin = String(formData.get("vin") || "").trim().toUpperCase();
    const documentType = String(formData.get("document_type") || "").trim().toUpperCase();
    const expectedRut = String(formData.get("expected_rut") || "").trim();

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!vin) {
      return NextResponse.json({ ok: false, error: "vin is required" }, { status: 400 });
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json({ ok: false, error: "invalid document_type" }, { status: 400 });
    }
    if (documentType === "CARTA" && !expectedRut) {
      return NextResponse.json({ ok: false, error: "expected_rut is required for CARTA" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = file.type === "application/pdf" ? "pdf" : "bin";
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const generatedName = `${vin}_${documentType}_${timestamp}.${extension}`;

    const uploaded = await uploadToDrive({ buffer: bytes, name: generatedName, mimeType: file.type });
    const input = {
      tenantId: "dealer_demo",
      fileId: uploaded.id,
      expectedVin: vin,
      file: { base64: bytes.toString("base64"), mimeType: file.type },
    };

    let extraction = null;
    if (documentType === "FC") extraction = await extractFc(input);
    if (documentType === "FV") extraction = await extractFv(input);
    if (documentType === "INSCRIP") extraction = await extractInscrip(input);
    if (documentType === "CARTA") extraction = await extractCarta({ ...input, expectedRut });

    return NextResponse.json({ ok: true, document_type: documentType, vin, file: uploaded, extraction });
  } catch (error) {
    console.error("Upload/extraction failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Upload/extraction failed" },
      { status: 500 }
    );
  }
}
