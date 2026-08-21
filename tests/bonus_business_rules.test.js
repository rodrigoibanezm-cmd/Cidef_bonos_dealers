import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBonusBusinessRules,
  calculateBonusDifferenceAmount,
} from "../lib/bonus_business_rules.js";
import {
  XLS_COLUMN_MAP,
  buildBonusBusinessRuleInput,
} from "../lib/bonus_business_rule_inputs.js";

function validInput(overrides = {}) {
  return {
    monto_compra: 10_000_000,
    precio_venta: 8_400_000,
    precio_lista_venta: 10_000_000,
    descuentos_dealer: 1_000_000,
    bono_fin_venta: 300_000,
    bono_cierre_venta: 100_000,
    bono_cidef: 200_000,
    fecha_compra: "2026-01-01",
    fecha_venta: "2026-01-10",
    fac_compra_ok: "OK",
    fac_venta_ok: "OK",
    inscripcion_venta_ok: "OK",
    fac_reposicion_ok: "OK",
    carta_credito_ok: "OK",
    ...overrides,
  };
}

test("XLS columns map 1:1 to canonical calculation fields", () => {
  assert.deepEqual(XLS_COLUMN_MAP, {
    E: "monto_compra",
    F: "monto_venta",
    H: "precio_lista_venta",
    I: "bono_cidef",
    J: "bono_fin_venta",
    K: "bono_cierre_venta",
    L: "descuentos_dealer",
    M: "fecha_compra",
    N: "fecha_venta",
    P: "fac_compra_ok",
    Q: "fac_venta_ok",
    R: "pdv_ok",
    S: "inscripcion_venta_ok",
    T: "fac_reposicion_ok",
    U: "carta_credito_ok",
    V: "dias_stock_dealer",
  });
});

test("PDV_OK is OK only when independent XLS values satisfy F = H - J - K - L - I", () => {
  const result = calculateBonusBusinessRules(validInput());
  assert.equal(result.pdv_ok, "OK");
});

test("PDV_OK is empty when the independent values do not satisfy the XLS equality", () => {
  const result = calculateBonusBusinessRules(validInput({ precio_venta: 8_400_001 }));
  assert.equal(result.pdv_ok, "");
});

test("PDV_OK is empty when independent XLS column L evidence is missing", () => {
  const result = calculateBonusBusinessRules(validInput({ descuentos_dealer: null }));
  assert.equal(result.pdv_ok, "");
});

test("BONO_DIF returns zero when E - ((H - I) * 0.92) is negative", () => {
  const result = calculateBonusBusinessRules(validInput({ monto_compra: 8_000_000 }));
  assert.equal(result.bono_dif, 0);
});

test("BONO_DIF calculates exactly E - ((H - I) * 0.92)", () => {
  const input = validInput({
    monto_compra: 15_973_132,
    precio_lista_venta: 15_490_000,
    descuentos_dealer: 900_000,
    bono_fin_venta: 600_000,
    bono_cierre_venta: 100_000,
    bono_cidef: 900_000,
    precio_venta: 12_990_000,
  });
  const result = calculateBonusBusinessRules(input);
  assert.equal(result.pdv_ok, "OK");
  assert.equal(result.bono_dif, 2_550_332);
});

test("BONO_DIF mathematical amount depends on I=bono_cidef and not L=descuentos_dealer", () => {
  const base = validInput({
    monto_compra: 15_799_511,
    precio_lista_venta: 15_490_000,
    bono_cidef: 900_000,
  });

  assert.equal(calculateBonusDifferenceAmount({ ...base, descuentos_dealer: 0 }), 2_376_711);
  assert.equal(calculateBonusDifferenceAmount({ ...base, descuentos_dealer: 999_999 }), 2_376_711);
  assert.equal(calculateBonusDifferenceAmount({ ...base, bono_cidef: 800_000 }), 2_284_711);
});

test("BONO_CIERRE returns K only with P/Q/R/S/T OK and 1 < V < 91", () => {
  assert.equal(calculateBonusBusinessRules(validInput()).bono_cierre, 100_000);
  assert.equal(calculateBonusBusinessRules(validInput({ fac_reposicion_ok: "" })).bono_cierre, null);
  assert.equal(calculateBonusBusinessRules(validInput({ fecha_venta: "2026-01-02" })).bono_cierre, null);
  assert.equal(calculateBonusBusinessRules(validInput({ fecha_venta: "2026-04-02" })).bono_cierre, null);
});

test("BONO_FIN returns J/3 only with P/Q/R/S/U OK", () => {
  assert.equal(calculateBonusBusinessRules(validInput()).bono_fin, 100_000);
  assert.equal(calculateBonusBusinessRules(validInput({ carta_credito_ok: "" })).bono_fin, null);
});

test("stock days equal N - M in calendar days", () => {
  const result = calculateBonusBusinessRules(validInput({
    fecha_compra: "2026-06-22",
    fecha_venta: "2026-06-30",
  }));
  assert.equal(result.dias_stock_dealer, 8);
});

test("real fixture LVAV2MAB5TU475588 keeps mathematical BONO_DIF separate from payment eligibility", () => {
  const request = {
    vin: "LVAV2MAB5TU475588",
    monto_compra: 15_799_511,
    monto_venta: 15_000_000,
    fecha_compra: "2026-03-31",
    fecha_venta: "2026-06-11",
    fc_status: "OK",
    fv_status: "OK",
    inscripcion_status: "OK",
    reposicion_status: "OK",
    financiamiento_status: "OK",
    descuentos_dealer: -1_110_000,
  };
  const input = buildBonusBusinessRuleInput({
    request,
    precioLista: 15_490_000,
    bonuses: {
      bono_cidef: 900_000,
      bono_fin_venta: 600_000,
      bono_cierre_venta: 100_000,
    },
  });
  const result = calculateBonusBusinessRules(input);

  assert.equal(input.descuentos_dealer, null);
  assert.equal(result.pdv_ok, "");
  assert.equal(result.dias_stock_dealer, 72);
  assert.equal(result.bono_dif_matematico, 2_376_711);
  assert.notEqual(result.bono_dif_matematico, 1_577_200);
  assert.equal(result.bono_dif, null);
  assert.equal(result.bono_cierre, null);
  assert.equal(result.bono_fin, null);
});

test("mapping never derives L from the PDV equation or reuses a legacy derived value", () => {
  const request = {
    monto_compra: 15_799_511,
    monto_venta: 15_000_000,
    descuentos_dealer: -1_110_000,
    fc_status: "OK",
    fv_status: "OK",
    inscripcion_status: "OK",
    reposicion_status: "OK",
    financiamiento_status: "NO_APLICA",
  };
  const input = buildBonusBusinessRuleInput({
    request,
    precioLista: 15_490_000,
    bonuses: {
      bono_cidef: 900_000,
      bono_fin_venta: 600_000,
      bono_cierre_venta: 100_000,
    },
  });

  assert.equal(input.descuentos_dealer, null);
  assert.notEqual(calculateBonusBusinessRules(input).pdv_ok, "OK");
});
