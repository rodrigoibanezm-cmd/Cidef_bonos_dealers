import { NextResponse } from "next/server";
import { uploadToDrive } from "../../../lib/google_drive.js";
import { createBonusRequest, saveBonusDocument, updateRequestFromExtraction } from "../../../lib/bonus_requests.js";
import { extractFc } from "../../../motors/extract_fc.js";
import { extractFv } from "../../../motors/extract_fv.js";
import { extractInscrip } from "../../../motors/extract_inscrip.js";
import { extractCarta } from "../../../motors/extract_carta.js";

export const runtime = "nodejs";

const ALLOWED_DOCUMENT_TYPES = new Set(["FV", "FC", "INSCRIP", "CARTA", "REPOS"]);

function extractionIsValid(documentType, extraction) {
  if (!extraction) return false;
  if (documentType === "CARTA") return extraction.status === "OK";
  if (documentType === "REPOS") return true;
  return extraction.status === "OK" && extraction.vin_match === true;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const vin = String(formData.get("vin") || "").trim().toUpperCase();
    const documentType = String(formData.get("document_type") || "").trim().toUpperCase();
    const expectedRut = String(formData.get("expected_rut") || "").trim();
    const incomingRequestId = String(formData.get("request_id") || "").trim();
    const tenantId = process.env.DEFAULT_TENANT_ID || "dealer_demo";

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
      tenantId,
      fileId: uploaded.id,
      expectedVin: vin,
      file: { base64: bytes.toString("base64"), mimeType: file.type },
    };

    let extraction = null;
    if (documentType === "FC") extraction = await extractFc(input);
    if (documentType === "FV") extraction = await extractFv(input);
    if (documentType === "INSCRIP") extraction = await extractInscrip(input);
    if (documentType === "CARTA") extraction = await extractCarta({ ...input, expectedRut });

    let requestId = incomingRequestId || null;
    const valid = extractionIsValid(documentType, extraction);

    if (valid && documentType !== "REPOS") {
      if (!requestId) {
        if (documentType !== "FC") {
          return NextResponse.json({ ok: false, error: "request_id is required after FC" }, { status: 400 });
        }
        const created = await createBonusRequest({ tenantId, vin });
        requestId = created.id;
      }

      await saveBonusDocument({ requestId, tenantId, documentType, uploaded, extraction });
      await updateRequestFromExtraction({ requestId, documentType, extraction });
    }

    return NextResponse.json({
      ok: true,
      document_type: documentType,
      vin,
      request_id: requestId,
      persisted: valid && documentType !== "REPOS",
      file: uploaded,
      extraction,
    });
  } catch (error) {
    console.error("Upload/extraction failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Upload/extraction failed" },
      { status: 500 }
    );
  }
}
