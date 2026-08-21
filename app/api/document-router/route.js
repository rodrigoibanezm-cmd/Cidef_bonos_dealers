import { NextResponse } from "next/server";
import { classifyDocumentFromR2 } from "../../../lib/document_router.js";
import { guardDocumentRouting, resolveFvRoutingConflict } from "../../../lib/document_routing_guard.js";
import { getR2Object } from "../../../lib/r2.js";
import { extractDocument, processExtractedDocument } from "../../../lib/process_extracted_document.js";
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

    const tenantId = tenantFromKey(key);
    const sourceVin = vinFromSourceFilename(sourceFilename);
    let object = null;
    let file = null;
    let preExtracted = null;
    let documentType = result.document_type;
    let routeReason = null;
    let routeOverride = false;

    const routingGuard = guardDocumentRouting({
      sourceFilename,
      classifiedType: result.document_type,
    });
    if (!routingGuard.allowed) {
      object = await getR2Object(key);
      file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
      if (routingGuard.sourceHint === "FV") {
        preExtracted = await extractDocument({
          documentType: "FV", tenantId, fileId: key, sourceVin, file,
        });
      }
      const contentResolution = resolveFvRoutingConflict({
        sourceHint: routingGuard.sourceHint,
        classifiedType: result.document_type,
        extraction: preExtracted,
        operationVin: sourceVin,
      });
      if (!contentResolution.allowed) {
        console.warn(`[DOC_ROUTE_UNCERTAIN] archivo=${key} source=${sourceFilename ?? "null"} hint=${routingGuard.sourceHint ?? "null"} classified=${result.document_type} reason=${contentResolution.reason || routingGuard.reason}`);
        return NextResponse.json({
          ok: true,
          key,
          ...result,
          resolved_document_type: "ROUTING_UNCERTAIN",
          route_override: false,
          route_reason: contentResolution.reason || routingGuard.reason,
          extraction: null,
          persisted: null,
          finalization: null,
        });
      }
      documentType = contentResolution.documentType;
      routeReason = contentResolution.reason;
      routeOverride = true;
      console.log(`[DOC_ROUTE_CONTENT_RESOLVED] archivo=${key} source=${sourceFilename ?? "null"} from=${result.document_type} to=${documentType} reason=${routeReason}`);
    }

    if (!file) {
      object = await getR2Object(key);
      file = { base64: object.buffer.toString("base64"), mimeType: object.contentType || "image/jpeg" };
    }

    const resolved = await resolveFcOrReposicion({
      documentType,
      sourceVin,
      file,
    });
    documentType = resolved.documentType;

    if (resolved.overridden) {
      console.log(`[DOC_ROUTE_OVERRIDE] archivo=${key} source=${sourceFilename ?? "null"} from=${result.document_type} to=${documentType} operation_vin=${sourceVin ?? "null"} document_vin=${resolved.chassis?.vin ?? "null"} reason=${resolved.reason}`);
      routeOverride = true;
      routeReason = resolved.reason;
    }

    const processed = await processExtractedDocument({
      documentType,
      tenantId,
      fileId: key,
      sourceFilename,
      sourceVin,
      file,
      preExtracted,
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
      route_override: routeOverride,
      route_reason: routeReason || routingGuard.reason || null,
      extraction: processed.extraction,
      persisted: processed.persisted,
      finalization,
    });
  } catch (error) {
    console.error("[DOC_PIPELINE_ERROR]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Document pipeline failed" }, { status: 500 });
  }
}
