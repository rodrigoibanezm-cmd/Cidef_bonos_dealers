import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { persistReposicionExtraction } from "../../../lib/persist_reposicion_extraction.js";
import { findVehicleOperationByVin } from "../../../lib/find_vehicle_operation_by_vin.js";
import { extractReposicion } from "../../../motors/extract_reposicion.js";
import { validateFcVin } from "../../../motors/extract_fc.js";

export const runtime = "nodejs";
export const maxDuration = 60;

function tenantFromKey(key) {
  return String(key || "").split("/")[0] || "unknown";
}

function sourceFilenameFromKey(key) {
  const leaf = String(key || "").split("/").pop() || "";
  const match = leaf.match(/_src-([A-Za-z0-9_-]+?)_\d{3}\.jpg$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

function vinFromSourceFilename(sourceFilename) {
  const matches = String(sourceFilename || "").toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g);
  return matches?.[0] || null;
}

function sourceSuggestsReposicion(sourceFilename) {
  return /\bREPO(?:S|SICION)?\b/i.test(String(sourceFilename || ""));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });

    const result = await classifyDocumentFromR2(key);
    const sourceFilename = sourceFilenameFromKey(key);
    console.log(`[DOC_ROUTER] archivo=${key} source=${sourceFilename ?? "null"} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    if (result.document_type !== "FC" && result.document_type !== "REPOSICION") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=${result.document_type} motivo=ONLY_CIDEF_INVOICE_ENABLED`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null });
    }

    const object = await getR2Object(key);
    const file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
    const sourceVin = vinFromSourceFilename(sourceFilename);
    const repoHint = sourceSuggestsReposicion(sourceFilename);

    let finalType = "REPOSICION";
    let vinCheck = null;
    let recoveredOperation = null;

    if (sourceVin) {
      vinCheck = await validateFcVin({ tenantId: tenantFromKey(key), fileId: key, expectedVin: sourceVin, file });
      finalType = vinCheck.vin_match ? "FC" : "REPOSICION";

      // Malformed source case: file explicitly says REPO/REPOS but carries the same VIN
      // as the invoice. Recover the owning dealer/operation from central inventory.
      if (vinCheck.vin_match && repoHint) {
        recoveredOperation = await findVehicleOperationByVin(sourceVin);
        if (recoveredOperation?.dealer_nombre) finalType = "REPOSICION";
      }
    }

    console.log(`[CIDEF_INVOICE_ROUTE] archivo=${key} source=${sourceFilename ?? "null"} source_vin=${sourceVin ?? "null"} doc_vin=${vinCheck?.vin_documento ?? "null"} repo_hint=${repoHint} tipo=${finalType}`);

    if (finalType === "FC") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=FC motivo=ONLY_REPOSICION_ENABLED`);
      return NextResponse.json({ ok: true, key, ...result, document_type: "FC", extraction: null });
    }

    const extraction = await extractReposicion({ tenantId: tenantFromKey(key), fileId: key, file });
    extraction.source_filename = sourceFilename;
    extraction.vin_original = extraction.vin_original || sourceVin;

    if (recoveredOperation) {
      extraction.vin_original = sourceVin;
      extraction.nombre_dealer = recoveredOperation.dealer_nombre || extraction.nombre_dealer;
      extraction.rut_dealer = recoveredOperation.dealer_rut || extraction.rut_dealer;
      extraction.documento_valido = true;
      extraction.status = "OK_RECOVERED_FROM_INVENTORY";
      console.log(`[REPOSICION_OPERATION_RECOVERED] archivo=${key} vin=${sourceVin} dealer=${extraction.nombre_dealer ?? "null"} nota_venta=${recoveredOperation.nota_de_venta ?? "null"} factura=${recoveredOperation.numero_factura ?? "null"}`);
    }

    const persisted = await persistReposicionExtraction(extraction);
    console.log(`[REPOSICION_EXTRACT] archivo=${key} source=${sourceFilename ?? "null"} resultado=${JSON.stringify(extraction)}`);
    console.log(`[REPOSICION_DB] archivo=${key} id=${persisted?.id ?? "null"} status=${persisted?.status ?? "null"}`);

    return NextResponse.json({ ok: true, key, ...result, document_type: "REPOSICION", extraction, persisted, recovered_operation: recoveredOperation });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
