import test from "node:test";
import assert from "node:assert/strict";
import { buildBonusOperationClosure } from "../lib/build_bonus_operation_closure.js";
import { loadBonusOperationDocuments } from "../lib/load_bonus_operation_documents.js";
import { persistConsolidatedBonusRequest } from "../lib/persist_consolidated_bonus_request.js";
import { persistOperationClosure } from "../lib/persist_operation_closure.js";
import { resolveFcEvidence } from "../lib/reconstruct_fc_from_inventory.js";
import { syncBonusRequestDocuments } from "../lib/sync_bonus_request_documents.js";
import { getBonusRequestForReview } from "../lib/approval_workflow.js";

const VIN = "LGJE5EE08TM442158";

function completeInventory(overrides = {}) {
  return {
    vin_chasis: VIN,
    marca: "DFM                           ",
    modelo: "AEOLUS HUGE E2",
    desc_abrev: "HUGE 1.5T",
    ano: "2026",
    factura: "FVE",
    numero_factura: "53520",
    fecha_factura: "10/31/25 0:00",
    importe_total_con_iva: "18390800",
    nota_de_venta: "35235",
    cliente: "COMERCIAL COLON LIMITADA",
    dealer_nombre: null,
    dealer_venta: "COMERCIAL COLON LIMITADA",
    es_dealer: true,
    ...overrides,
  };
}

function operationSql({ documentaryFc = null, inventoryRows = [] } = {}) {
  const queries = [];
  const sql = async (strings) => {
    const text = strings.join("?");
    queries.push(text);
    if (text.includes("bonus_fv_extractions")) return [{ vin: VIN, nombre_dealer: "COMERCIAL COLON LIMITADA", status: "OK" }];
    if (text.includes("bonus_fc_extractions")) return documentaryFc ? [documentaryFc] : [];
    if (text.includes("from vehiculos_raw")) return inventoryRows;
    return [];
  };
  return { sql, queries };
}

test("FC documental conserva prioridad y comportamiento actual", () => {
  const documentaryFc = { id: 7, file_id: "fc.jpg", vin: VIN, status: "OK" };
  const resolved = resolveFcEvidence({
    documentaryFc,
    inventoryRows: [completeInventory()],
    vin: VIN,
    expectedDealer: "COMERCIAL COLON LIMITADA",
  });
  assert.strictEqual(resolved, documentaryFc);
});

test("loader no consulta inventario cuando existe FC documental", async () => {
  const documentaryFc = { id: 7, file_id: "fc.jpg", vin: VIN, status: "OK" };
  const { sql, queries } = operationSql({ documentaryFc, inventoryRows: [completeInventory()] });
  const documents = await loadBonusOperationDocuments({ sql, tenantId: "dealer_demo", vin: VIN });
  assert.strictEqual(documents.fc, documentaryFc);
  assert.equal(queries.some((text) => text.includes("from vehiculos_raw")), false);
});

test("FC ausente con inventario completo se reconstruye y permite continuar", () => {
  const fc = resolveFcEvidence({
    documentaryFc: null,
    inventoryRows: [completeInventory()],
    vin: VIN,
    expectedDealer: "COMERCIAL COLON LIMITADA",
  });
  assert.equal(fc.status, "OK_RECONSTRUIDA");
  assert.equal(fc.documento_original, false);
  assert.equal(fc.fc_reconstruida, true);
  assert.equal(fc.source, "INVENTARIO");
  assert.equal(fc.file_id, null);

  const closure = buildBonusOperationClosure({
    vin: VIN,
    documents: {
      fc,
      fv: { status: "OK", vin: VIN, nombre_dealer: "COMERCIAL COLON LIMITADA", rut_cliente: "13.230.519-6" },
      ins: { status: "OK", documento_valido: true, vin: VIN, rut_adquirente: "13.230.519-6" },
      fin: null,
      repo: null,
    },
    isFinal: true,
  });
  assert.equal(closure.cierre_estado, "VERDE");
  assert.equal(closure.document_statuses.fc, "OK");
  assert.deepEqual(closure.documentos_faltantes, []);
  assert.deepEqual(closure.informational_signals, [
    "FC_NO_APORTADA_POR_DEALER",
    "FC_RECONSTRUIDA_DESDE_INVENTARIO",
  ]);
});

test("loader aplica el fallback de inventario sólo cuando FC documental falta", async () => {
  const { sql, queries } = operationSql({ inventoryRows: [completeInventory()] });
  const documents = await loadBonusOperationDocuments({ sql, tenantId: "dealer_demo", vin: VIN });
  assert.equal(documents.fc.fc_reconstruida, true);
  assert.equal(queries.some((text) => text.includes("from vehiculos_raw")), true);
});

test("FC ausente con inventario incompleto sigue como faltante", () => {
  const fc = resolveFcEvidence({
    documentaryFc: null,
    inventoryRows: [completeInventory({ numero_factura: null })],
    vin: VIN,
    expectedDealer: "COMERCIAL COLON LIMITADA",
  });
  assert.equal(fc, null);
  const closure = buildBonusOperationClosure({
    vin: VIN,
    documents: {
      fc,
      fv: { status: "OK", vin: VIN },
      ins: { status: "OK", documento_valido: true, vin: VIN },
      fin: null,
      repo: null,
    },
    isFinal: true,
  });
  assert.equal(closure.document_statuses.fc, "FALTA");
  assert.ok(closure.documentos_faltantes.includes("FC"));
});

test("caso real LGJE5EE08TM442158 reconstruye sólo valores observados", () => {
  const fc = resolveFcEvidence({
    documentaryFc: null,
    inventoryRows: [completeInventory()],
    vin: VIN,
    expectedDealer: "COMERCIAL COLON LIMITADA",
  });
  assert.deepEqual({
    source: fc.source,
    documento_original: fc.documento_original,
    fc_reconstruida: fc.fc_reconstruida,
    vin: fc.vin,
    factura: fc.folio_factura_compra,
    fecha: fc.fecha_factura_compra,
    monto: fc.precio_compra_total,
    nota_venta: fc.nota_venta,
    dealer: fc.dealer,
    marca: fc.marca,
    modelo: fc.modelo,
  }, {
    source: "INVENTARIO",
    documento_original: false,
    fc_reconstruida: true,
    vin: VIN,
    factura: "53520",
    fecha: "2025-10-31",
    monto: 18_390_800,
    nota_venta: "35235",
    dealer: "COMERCIAL COLON LIMITADA",
    marca: "DFM",
    modelo: "AEOLUS HUGE E2",
  });
  assert.equal(fc.modelo_source, "INVENTARIO_VIN");
});

test("FC reconstruida alimenta los campos canónicos y conserva evidencia append-only", async () => {
  const fc = resolveFcEvidence({ documentaryFc: null, inventoryRows: [completeInventory()], vin: VIN });
  const documents = {
    fc,
    fv: { status: "OK", vin: VIN, nombre_dealer: "COMERCIAL COLON LIMITADA", fecha_factura_venta: "2026-03-11", precio_venta_total: 17_990_000 },
    ins: { status: "OK", documento_valido: true, vin: VIN, marca: "DFM", modelo: "HUGE 1.5 AUT" },
    fin: null,
    repo: null,
  };
  const closure = buildBonusOperationClosure({ vin: VIN, documents, isFinal: true });
  const statements = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    statements.push({ text, values });
    if (text.includes("select id from bonus_requests")) return [{ id: "request-1" }];
    if (text.includes("update bonus_requests set")) return [{ id: "request-1" }];
    return [];
  };

  await persistOperationClosure({ tenantId: "dealer_demo", vin: VIN, phase: "FINAL", closure, sql });
  await persistConsolidatedBonusRequest({ sql, tenantId: "dealer_demo", vin: VIN, documents, closure });

  const auditInsert = statements.find((entry) => entry.text.includes("bonus_operation_closure_audits"));
  assert.ok(auditInsert.values.some((value) => String(value).includes("FC_RECONSTRUIDA_DESDE_INVENTARIO")));
  const canonicalUpdate = statements.find((entry) => entry.text.includes("update bonus_requests set"));
  assert.ok(canonicalUpdate.values.includes("2025-10-31"));
  assert.ok(canonicalUpdate.values.includes(18_390_800));
});

test("FC reconstruida no se materializa como documento falso", async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({ text: strings.join("?"), values });
    return [];
  };
  const fc = resolveFcEvidence({ documentaryFc: null, inventoryRows: [completeInventory()], vin: VIN });
  await syncBonusRequestDocuments({
    sql,
    requestId: "request-1",
    tenantId: "dealer_demo",
    documents: { fc, fv: null, ins: null, fin: null, repo: null },
  });
  assert.equal(statements.length, 0);
});

test("revisión conserva FC reconstruida aunque exista un cierre económico posterior", async () => {
  const reconstruction = {
    source: "INVENTARIO",
    documento_original: false,
    fc_reconstruida: true,
    vin: VIN,
  };
  const sql = async (strings) => {
    const text = strings.join("?");
    if (text.includes("select * from bonus_requests")) {
      return [{ id: "request-1", tenant_id: "dealer_demo", vin: VIN }];
    }
    if (text.includes("bonus_request_documents")) {
      return [
        { document_type: "FV", review_status: "APROBADO" },
        { document_type: "INSCRIPCION", review_status: "APROBADO" },
      ];
    }
    if (text.includes("bonus_operation_closure_audits")) {
      assert.match(text, /phase='FINAL'[\s\S]*evidence \? 'fc_reconstruction'/);
      return [{ fc_reconstruction: reconstruction }];
    }
    return [];
  };

  const review = await getBonusRequestForReview("request-1", { sql });
  assert.deepEqual(review.fc_reconstruction, reconstruction);
  assert.equal(review.review_complete, true);
  assert.deepEqual(review.sequence, ["FV", "INSCRIPCION"]);
});
