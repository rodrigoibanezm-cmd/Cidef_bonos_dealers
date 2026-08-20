import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { getR2Object } from "../../../lib/r2.js";
import { processExtractedDocument } from "../../../lib/process_extracted_document.js";
import { resolveFcOrReposicion } from "../../../lib/resolve_fc_reposicion.js";
import { finalizeBonusOperation } from "../../../lib/finalize_bonus_operation.js";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const key = String(body?.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });

    const result = await classifyDocumentFromR2(key);
    const sourceFilename = sourceFilenameFromKey(key);
    console.log(`[DOC_ROUTER] archivo=${key} source=${sourceFilename ?? "null"} tipo=${result.document_type} confidence=${result.confidence.toFixed(3)}`);

    if (result.document_type === "BASURA") {
      console.log(`[DOC_EXTRACT_SKIP] archivo=${key} tipo=BASURA`);
      return NextResponse.json({ ok: true, key, ...result, extraction: null, persisted: null });
    }

    const object = await getR2Object(key);
    const file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
    const tenantId = tenantFromKey(key);
    const sourceVin = vinFromSourceFilename(sourceFilename);

    const resolved = await resolveFcOrReposicion({
      documentType: result.document_type,
      sourceVin,
      file,
    });
    const documentType = resolved.documentType;

    if (resolved.overridden) {
      console.log(`[DOC_ROUTE_OVERRIDE] archivo=${key} source=${sourceFilename ?? "null"} from=${result.document_type} to=${documentType} operation_vin=${sourceVin ?? "null"} document_vin=${resolved.chassis?.vin ?? "null"} reason=${resolved.reason}`);
    }

    const processed = await processExtractedDocument({
      documentType,
      tenantId,
      fileId: key,
      sourceFilename,
      sourceVin,
      file,
    });

    console.log(`[DOC_EXTRACT] archivo=${key} tipo=${documentType} source=${sourceFilename ?? "null"} status=${processed.extraction?.status ?? "null"}`);
    console.log(`[DOC_DB] archivo=${key} tipo=${documentType} id=${processed.persisted?.id ?? "null"} status=${processed.persisted?.status ?? "null"}`);

    let finalization = null;
    const operationVin = sourceVin || processed.extraction?.vin || processed.extraction?.vin_original || null;
    if (operationVin) {
      try {
        finalization = await finalizeBonusOperation({ tenantId, vin: operationVin });
        console.log(`[BONUS_FINALIZE] tenant=${tenantId} vin=${operationVin} operations=${finalization.consolidated?.processed ?? 0} calculations=${finalization.calculated?.length ?? 0}`);
      } catch (finalizeError) {
        console.error(`[BONUS_FINALIZE_ERROR] tenant=${tenantId} vin=${operationVin}`, finalizeError);
      }
    }

    return NextResponse.json({
      ok: true,
      key,
      ...result,
      resolved_document_type: documentType,
      route_override: resolved.overridden,
      route_reason: resolved.reason || null,
      extraction: processed.extraction,
      persisted: processed.persisted,
      finalization,
    });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
