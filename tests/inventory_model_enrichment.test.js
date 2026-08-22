import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichOperationModelFromInventory,
  enrichOperationModelFromInventoryRows,
  INVENTORY_MODEL_SOURCE,
} from "../lib/enrich_operation_model_from_inventory.js";
import { rankPriceVersions } from "../lib/price_version_match.js";

const VIN = "LGJE5EE08TM442158";
const INVENTORY_ROW = { vin_chasis: VIN, modelo: "AEOLUS HUGE E2" };

test("VIN + modelo vacío completa modelo desde una única fila de inventario", () => {
  const result = enrichOperationModelFromInventoryRows({ vin: VIN, modelo: null }, [INVENTORY_ROW]);
  assert.equal(result.modelo, "AEOLUS HUGE E2");
  assert.equal(result.modelo_source, INVENTORY_MODEL_SOURCE);
});

test("modelo ya informado no se sobrescribe", async () => {
  let queried = false;
  const result = await enrichOperationModelFromInventory(
    { vin: VIN, modelo: "MODELO DOCUMENTAL" },
    { sql: async () => { queried = true; return [INVENTORY_ROW]; } },
  );
  assert.equal(result.modelo, "MODELO DOCUMENTAL");
  assert.equal(result.modelo_source, undefined);
  assert.equal(queried, false);
});

test("VIN inexistente no falla ni completa", async () => {
  const result = await enrichOperationModelFromInventory(
    { vin: "VININEXISTENTE000" },
    { sql: async () => [] },
  );
  assert.equal(result.modelo, undefined);
  assert.equal(result.modelo_source, undefined);
});

test("múltiples filas no eligen modelo", () => {
  const result = enrichOperationModelFromInventoryRows(
    { vin: VIN, modelo: null },
    [INVENTORY_ROW, { ...INVENTORY_ROW }],
  );
  assert.equal(result.modelo, null);
  assert.equal(result.modelo_source, undefined);
});

test("modelo vacío en inventario no completa", () => {
  const result = enrichOperationModelFromInventoryRows({ vin: VIN }, [{ modelo: "  " }]);
  assert.equal(result.modelo, undefined);
  assert.equal(result.modelo_source, undefined);
});

test("orden documental distinto produce el mismo enriquecimiento", () => {
  const documents = [
    { document_type: "FV", operation_vin: VIN },
    { document_type: "FINANCIAMIENTO", operation_vin: VIN },
    { document_type: "INSCRIPCION", vin: VIN },
    { document_type: "FC", vin: VIN },
    { document_type: "REPOSICION", vin_original: VIN },
  ];
  const enrich = (rows) => rows.map((row) => enrichOperationModelFromInventoryRows(row, [INVENTORY_ROW]));
  const forward = enrich(documents);
  const reverse = enrich([...documents].reverse()).reverse();
  assert.deepEqual(reverse, forward);
  assert.ok(forward.every((row) => row.modelo === "AEOLUS HUGE E2"));
  assert.ok(forward.every((row) => row.modelo_source === INVENTORY_MODEL_SOURCE));
});

test("caso real usa AEOLUS HUGE E2 para desempatar E1 vs E2", () => {
  const inventory = { ...INVENTORY_ROW, desc_abrev: "HUGE 1.5T", tipo_motor: "Gasolina" };
  const ranked = rankPriceVersions(inventory, [
    { price_version_id: 62, modelo: "HUGE", version: "HUGE ICE E1 1.5T", cc: "1.5", combustible: "Gasolina" },
    { price_version_id: 63, modelo: "HUGE", version: "HUGE ICE E2 1.5T", cc: "1.5", combustible: "Gasolina" },
  ]);
  assert.equal(ranked[0].row.price_version_id, 63);
  assert.ok(ranked[0].reasons.includes("inventario_modelo:E2"));
  assert.ok(ranked[0].score > ranked[1].score);
});
