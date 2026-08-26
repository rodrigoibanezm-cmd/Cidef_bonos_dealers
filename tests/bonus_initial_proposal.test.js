import test from "node:test";
import assert from "node:assert/strict";
import { buildBonusBusinessRuleInput } from "../lib/bonus_business_rule_inputs.js";
import { calculateBonusBusinessRules } from "../lib/bonus_business_rules.js";

const request = {
  monto_compra: 11_950_800,
  monto_venta: 10_890_000,
  fecha_compra: "2026-02-28",
  fecha_venta: "2026-03-10",
  fc_status: "OK",
  fv_status: "OK",
  inscripcion_status: "OK",
  reposicion_status: "OK",
  financiamiento_status: "OK",
  requiere_revision_humana: false,
};

const bonuses = {
  bono_cidef: 300_000,
  bono_fin_venta: 600_000,
  bono_cierre_venta: 500_000,
};

test("missing dealer discount gets an initial proposal instead of blocking total", () => {
  const input = buildBonusBusinessRuleInput({
    request,
    precioLista: 13_290_000,
    bonuses,
  });
  const result = calculateBonusBusinessRules(input);

  assert.equal(result.descuento_dealer_propuesto, 1_000_000);
  assert.equal(result.descuento_dealer_aprobado, 1_000_000);
  assert.equal(result.descuento_dealer_source, "PROPUESTO_DESDE_BONO_CIERRE_LISTA");
  assert.equal(result.bono_cierre_efectivo, 500_000);
  assert.equal(result.pdv_ok, "OK");
  assert.equal(result.total_devolver, 700_000);
});

test("editing dealer discount recalculates closure bonus and total", () => {
  const input = buildBonusBusinessRuleInput({
    request,
    precioLista: 13_290_000,
    bonuses,
    descuentosDealerEvidence: 1_200_000,
  });
  const result = calculateBonusBusinessRules(input);

  assert.equal(result.descuento_dealer_aprobado, 1_200_000);
  assert.equal(result.descuento_dealer_source, "MANUAL");
  assert.equal(result.bono_cierre_efectivo, 300_000);
  assert.equal(result.pdv_ok, "OK");
  assert.equal(result.total_devolver, 500_000);
});
