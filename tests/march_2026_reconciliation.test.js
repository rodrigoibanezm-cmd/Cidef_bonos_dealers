import test from "node:test";
import assert from "node:assert/strict";

import { calculateBonusBusinessRules } from "../lib/bonus_business_rules.js";
import { buildBonusBusinessRuleInput } from "../lib/bonus_business_rule_inputs.js";
import { extractPriceBonuses, priceListValue } from "../lib/price_bonus_payload.js";

test("FOTON net list amounts are converted to IVA-included values", () => {
  const row = {
    precio_lista: null,
    precio_neto: 10_980_000,
    bono_cidef: 200_000,
    bono_forum: 500_000,
    bono_mes: 0,
  };

  assert.equal(priceListValue(row), 13_066_200);
  const bonuses = extractPriceBonuses(row);
  assert.equal(bonuses.bono_cidef, 238_000);
  assert.equal(bonuses.bono_fin_venta, 595_000);
  assert.equal(bonuses.montos_origen, "NETO_CONVERTIDO_IVA");
});

test("Dongfeng IVA-included list amounts are not converted again", () => {
  const row = {
    precio_lista: 19_990_000,
    precio_neto: null,
    bono_cidef: 0,
    bono_forum: 600_000,
    bono_mes: 2_000_000,
  };

  assert.equal(priceListValue(row), 19_990_000);
  const bonuses = extractPriceBonuses(row);
  assert.equal(bonuses.bono_fin_venta, 600_000);
  assert.equal(bonuses.bono_cierre_venta, 2_000_000);
  assert.equal(bonuses.montos_origen, "IVA_INCLUIDO");
});

test("BONO FIN VTA is zero when the operation has no approved financing evidence", () => {
  const input = buildBonusBusinessRuleInput({
    request: {
      financiamiento_status: "NO_APLICA",
      fc_status: "OK",
      fv_status: "OK",
      inscripcion_status: "OK",
      reposicion_status: "OK",
    },
    precioLista: 19_990_000,
    bonuses: { bono_cidef: 0, bono_fin_venta: 600_000, bono_cierre_venta: 0 },
  });

  assert.equal(input.bono_fin_venta_disponible, 600_000);
  assert.equal(input.bono_fin_venta, 0);
  assert.equal(input.financiamiento_aplica, false);
});

test("BONO CIERRE VTA is reconstructed as the PDV residual when dealer discount is known", () => {
  const result = calculateBonusBusinessRules({
    monto_compra: 18_390_800,
    precio_venta: 17_990_000,
    precio_lista_venta: 19_990_000,
    bono_cidef: 0,
    bono_fin_venta: 0,
    bono_cierre_venta: 0,
    descuentos_dealer: 0,
    fecha_compra: "2026-03-01",
    fecha_venta: "2026-03-20",
    fac_compra_ok: "OK",
    fac_venta_ok: "OK",
    inscripcion_venta_ok: "OK",
    fac_reposicion_ok: "OK",
    carta_credito_ok: "",
  });

  assert.equal(result.bono_cierre_residual, 2_000_000);
  assert.equal(result.bono_cierre_efectivo, 2_000_000);
  assert.equal(result.bono_cierre_source, "RESIDUAL_PDV");
  assert.equal(result.pdv_ok, "OK");
  assert.equal(result.bono_cierre, 2_000_000);
});

test("more than 90 stock days always requires human review and leaves an audit reason", () => {
  const result = calculateBonusBusinessRules({
    monto_compra: 18_390_800,
    precio_venta: 17_990_000,
    precio_lista_venta: 19_990_000,
    bono_cidef: 0,
    bono_fin_venta: 0,
    bono_cierre_venta: 0,
    descuentos_dealer: 0,
    fecha_compra: "2025-10-31",
    fecha_venta: "2026-03-20",
    fac_compra_ok: "OK",
    fac_venta_ok: "OK",
    inscripcion_venta_ok: "OK",
    fac_reposicion_ok: "OK",
    carta_credito_ok: "",
  });

  assert.ok(result.dias_stock_dealer > 90);
  assert.equal(result.calculation_status, "REQUIERE_REVISION");
  assert.equal(result.total_devolver, null);
  assert.ok(result.review_reasons.includes("DIAS_STOCK_MAYOR_90"));
});
