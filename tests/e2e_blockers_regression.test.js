import test from "node:test";
import assert from "node:assert/strict";
import { buildBonusOperationClosure } from "../lib/build_bonus_operation_closure.js";
import {
  buildCurrentCalculationClosure,
  persistCurrentCalculationClosure,
} from "../lib/calculation_closure_status.js";
import { resolveFvRoutingConflict } from "../lib/document_routing_guard.js";
import { resolveFcVinStatus } from "../motors/extract_fc.js";
import { auditRouter } from "../motors/audit_router.js";

const VIN = "LVAV2MAB1TU475796";

function validDocuments() {
  return {
    fv: {
      id: 22,
      file_id: "dealer_demo/batches/current/pages/fv_002.jpg",
      status: "OK",
      parse_error: false,
      vin: VIN,
      rut_cliente: "76.000.000-1",
      nombre_cliente: "JOHNSON SOLAR",
    },
    fc: {
      id: 21,
      file_id: "dealer_demo/batches/current/pages/fc_001.jpg",
      status: "OK",
      parse_error: false,
      vin: VIN,
    },
    ins: {
      id: 23,
      file_id: "dealer_demo/batches/current/pages/ins_001.jpg",
      status: "OK",
      parse_error: false,
      documento_valido: true,
      vin: VIN,
      rut_adquirente: "76.000.000-1",
      nombre_adquirente: "JOHNSON SOLAR",
    },
    fin: null,
    repo: null,
  };
}

test("FV multipage conflict is resolved by page content and never staged as REPOSICION", () => {
  const firstPage = resolveFvRoutingConflict({
    sourceHint: "FV",
    classifiedType: "REPOSICION",
    operationVin: VIN,
    extraction: {
      document_type: "FV",
      parse_error: false,
      vin: VIN,
      nombre_dealer: "KLASSIK CAR S.A.",
      rut_dealer: "76.123.456-7",
      nombre_facturado: "ZENIT SEGUROS GENERALES S.A.",
      folio_factura_venta: 113160,
      fecha_factura_venta: "2026-06-30",
      precio_venta_total: 16_725_807,
    },
  });
  const confirmingPageType = "FV";

  assert.equal(firstPage.allowed, true);
  assert.equal(firstPage.documentType, "FV");
  assert.notEqual(firstPage.documentType, "REPOSICION");
  assert.deepEqual([firstPage.documentType, confirmingPageType], ["FV", "FV"]);

  const ambiguousPage = resolveFvRoutingConflict({
    sourceHint: "FV",
    classifiedType: "REPOSICION",
    operationVin: VIN,
    extraction: { parse_error: false, nombre_dealer: "KLASSIK CAR S.A." },
  });
  assert.equal(ambiguousPage.allowed, false);
  assert.equal(ambiguousPage.documentType, null);
});

test("FC uses stable targeted chassis evidence when broad extraction transposes the VIN", () => {
  const status = resolveFcVinStatus({
    expectedVin: VIN,
    fullExtractionVin: "LVAV2MAB1TU457596",
    chassis: {
      vin: VIN,
      readable: true,
      parse_error: false,
      retried: false,
      retry_consistent: null,
    },
  });
  assert.equal(status, "OK");
});

test("FC remains VIN_INCONSISTENT when two incompatible VIN reads have no resolver", () => {
  const status = resolveFcVinStatus({
    expectedVin: null,
    fullExtractionVin: "LVAV2MAB1TU457596",
    chassis: {
      vin: VIN,
      readable: true,
      parse_error: false,
      retried: false,
      retry_consistent: null,
    },
  });
  assert.equal(status, "VIN_INCONSISTENT");
});

test("targeted correction from an older file is not inherited by a new run", async () => {
  const documents = validDocuments();
  documents.fc.status = "VIN_INCONSISTENT";
  documents.fc.full_extraction_vin = "LVAV2MAB1TU457596";
  const initial = buildBonusOperationClosure({ vin: VIN, documents });
  assert.equal(initial.cierre_estado, "AMARILLO");

  let targetedCalls = 0;
  const targeted = await auditRouter({
    tenantId: "dealer_demo",
    vin: VIN,
    initialClosure: initial,
    documents,
    sql: null,
    loadAudits: async () => [{
      id: 5,
      file_id: "dealer_demo/batches/older/pages/fc_001.jpg",
      extraction_id: 18,
      document_type: "FC",
      targeted_values: { vin: VIN },
      resolution_status: "RESOLVED",
      attempt: 1,
    }],
    runTargetedExtraction: async () => {
      targetedCalls += 1;
      return { parse_error: true, status: "PARSE_ERROR", values: {} };
    },
    persistAudit: async ({ audit }) => ({ ...audit, id: 100 + audit.attempt }),
  });

  assert.equal(targetedCalls, 2);
  assert.equal(targeted.documents.fc.status, "VIN_INCONSISTENT");
  assert.deepEqual(targeted.exhaustedIssues, ["FC:VIN_INCONSISTENT"]);
  const final = buildBonusOperationClosure({
    vin: VIN,
    documents: targeted.documents,
    exhaustedIssues: targeted.exhaustedIssues,
    isFinal: true,
  });
  assert.notEqual(final.cierre_estado, "VERDE");
  assert.equal(final.requiere_revision_humana, true);
});

test("incomplete current calculation invalidates VERDE while preserving closure history", async () => {
  const request = {
    id: "request-1",
    tenant_id: "dealer_demo",
    vin: VIN,
    cierre_estado: "VERDE",
    audit_status: "RESUELTO_AUTOMATICAMENTE",
    inconsistencias: [],
    documentos_faltantes: [],
    fv_status: "OK",
    fc_status: "OK",
    inscripcion_status: "OK",
    financiamiento_status: "NO_APLICA",
    reposicion_status: "NO_APLICA",
  };
  const calculation = {
    calculation_status: "PENDIENTE",
    pdv_ok: "",
    total_devolver: null,
    price_lookup_status: "ok",
    reason: "DESCUENTO_DEALER_EVIDENCE_REQUIRED",
  };

  const projected = buildCurrentCalculationClosure({ request, calculation });
  assert.equal(projected.cierre_estado, "AMARILLO");
  assert.equal(projected.requiere_revision_humana, true);
  assert.ok(projected.inconsistencias.includes("PDV_PENDING"));
  assert.ok(projected.inconsistencias.includes("TOTAL_DEVOLVER_PENDING"));

  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({ text: strings.join("?"), values });
    return [];
  };
  const history = [{ cierre_estado: "VERDE", audit_status: "RESUELTO_AUTOMATICAMENTE" }];
  await persistCurrentCalculationClosure({
    request,
    calculation,
    sql,
    persistClosure: async ({ closure }) => {
      history.push(closure);
      return closure;
    },
  });

  assert.equal(statements.length, 1);
  assert.match(statements[0].text, /update bonus_requests set/);
  assert.ok(statements[0].values.includes("AMARILLO"));
  assert.equal(history.length, 2);
  assert.equal(history[0].cierre_estado, "VERDE");
  assert.equal(history[1].cierre_estado, "AMARILLO");
});
