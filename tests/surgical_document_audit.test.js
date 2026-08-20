import test from "node:test";
import assert from "node:assert/strict";
import { buildBonusOperationClosure } from "../lib/build_bonus_operation_closure.js";
import { normalizeOperationIdentity } from "../lib/normalize_operation_identity.js";
import { auditRouter, planAuditAction } from "../motors/audit_router.js";
import { targetedContract } from "../lib/targeted_document_extraction.js";
import { extractFv } from "../motors/extract_fv.js";
import { extractFc } from "../motors/extract_fc.js";
import { extractInscrip } from "../motors/extract_inscrip.js";
import { extractFinanciamiento } from "../motors/extract_financiamiento.js";
import { extractReposicion } from "../motors/extract_reposicion.js";

const VIN = "LVAV2MAB1TU475796";

function regressionDocuments() {
  return {
    fv: {
      id: 11,
      file_id: "dealer_demo/regression-fv.jpg",
      status: "OK",
      parse_error: false,
      vin: VIN,
      nombre_cliente: "ZENIT SEGUROS GENERALES S.A.",
      rut_cliente: "99.999.999-9",
      nombre_facturado: "ZENIT SEGUROS GENERALES S.A.",
      rut_facturado: "99.999.999-9",
      nombre_compra_para: "JOHNSON SOLAR COMPANY LIMITADA",
      rut_compra_para: "76.000.000-1",
      financiamiento: null,
    },
    fc: { status: "OK", parse_error: false, vin: VIN },
    ins: {
      id: 31,
      status: "OK",
      parse_error: false,
      documento_valido: true,
      vin: VIN,
      nombre_adquirente: "JOHNSON SOLAR COMPANY LIMITADA",
      rut_adquirente: "76.000.000-1",
    },
    fin: null,
    repo: null,
  };
}

test("regression LVAV2MAB1TU475796 detects, targets and resolves COMPRA_PARA", async () => {
  const documents = regressionDocuments();
  const initial = buildBonusOperationClosure({ vin: VIN, documents });
  assert.equal(initial.cierre_estado, "ROJO");
  assert.ok(initial.inconsistencias.includes("INS_RUT_CLIENTE_MISMATCH"));

  const mismatch = initial.issues.find((entry) => entry.code === "INS_RUT_CLIENTE_MISMATCH");
  const action = planAuditAction(mismatch, documents);
  assert.deepEqual(action.fields, ["nombre_facturado", "rut_facturado", "nombre_compra_para", "rut_compra_para"]);

  const targeted = await auditRouter({
    tenantId: "dealer_demo",
    vin: VIN,
    initialClosure: initial,
    documents,
    sql: null,
    loadAudits: async () => [],
    runTargetedExtraction: async ({ action: targetedAction, attempt }) => ({
      contract_version: "4",
      status: "OK",
      parse_error: false,
      attempt,
      values: Object.fromEntries(targetedAction.fields.map((field) => [field, documents.fv[field]])),
    }),
    persistAudit: async ({ audit }) => ({ ...audit, id: 1 }),
  });
  assert.equal(targeted.auditResults.length, 1);
  assert.equal(targeted.auditResults[0].resolutionStatus, "RESOLVED");
  assert.deepEqual(targeted.exhaustedIssues, []);

  const identity = normalizeOperationIdentity({ fv: targeted.documents.fv, ins: targeted.documents.ins });
  assert.equal(identity.status, "RESOLVED");
  assert.equal(identity.role, "COMPRA_PARA");
  assert.equal(identity.nombre_cliente, "JOHNSON SOLAR COMPANY LIMITADA");

  const final = buildBonusOperationClosure({ vin: VIN, documents: targeted.documents, identityResolution: identity, isFinal: true });
  assert.equal(final.cierre_estado, "VERDE");
  assert.equal(final.nombre_cliente, "JOHNSON SOLAR COMPANY LIMITADA");
  assert.equal(final.inconsistencias.includes("INS_RUT_CLIENTE_MISMATCH"), false);
  assert.equal(final.audit_status, "RESUELTO_AUTOMATICAMENTE");
});

test("targeted contract rejects undeclared fields and attempts over two", () => {
  const schema = { properties: { vin: { type: "string" }, rut: { type: "string" } } };
  const contract = targetedContract({
    mode: "targeted",
    fields: ["vin"],
    context: { expected_vin: VIN },
    reason: "VIN_UNREADABLE",
    attempt: 2,
    schema,
  });
  assert.deepEqual(contract.fields, ["vin"]);
  assert.throws(() => targetedContract({ mode: "targeted", fields: ["nombre"], context: {}, reason: "x", attempt: 1, schema }));
  assert.throws(() => targetedContract({ mode: "targeted", fields: ["vin"], context: {}, reason: "x", attempt: 3, schema }));
});

test("all document extractors expose the targeted contract", async () => {
  const input = {
    tenantId: "dealer_demo",
    fileId: "fixture.jpg",
    file: { base64: "AA==", mimeType: "image/jpeg" },
    mode: "targeted",
    fields: ["__unsupported__"],
    context: {},
    reason: "CONTRACT_TEST",
    attempt: 1,
  };
  for (const extractor of [extractFv, extractFc, extractInscrip, extractFinanciamiento, extractReposicion]) {
    await assert.rejects(() => extractor(input), /unsupported targeted fields/);
  }
});
