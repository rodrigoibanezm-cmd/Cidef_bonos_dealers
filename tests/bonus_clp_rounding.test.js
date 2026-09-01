import test from "node:test";
import assert from "node:assert/strict";
import { calculateBonusBusinessRules, calculateBonusDifferenceAmount } from "../lib/bonus_business_rules.js";

test("bono financiamiento rounds one third to integer CLP", () => {
  const result = calculateBonusBusinessRules({
    monto_compra: 10_000_000,
    precio_venta: 8_000_000,
    precio_lista_venta: 10_000_000,
    descuentos_dealer: 0,
    bono_fin_venta: 1_000_000,
    bono_cierre_venta: 500_000,
    bono_cidef: 500_000,
    fecha_compra: "2026-01-01",
    fecha_venta: "2026-01-10",
    fac_compra_ok: "OK",
    fac_venta_ok: "OK",
    inscripcion_venta_ok: "OK",
    fac_reposicion_ok: "OK",
    carta_credito_ok: "OK",
  });

  assert.equal(result.pdv_ok, "OK");
  assert.equal(result.bono_fin, 333_333);
  assert.equal(Number.isInteger(result.total_deterministico), true);
});

test("bonus difference is returned in integer CLP", () => {
  const amount = calculateBonusDifferenceAmount({
    monto_compra: 100,
    precio_lista_venta: 101,
    bono_cidef: 0,
    fecha_venta: "2026-01-10",
  });

  assert.equal(amount, 7);
  assert.equal(Number.isInteger(amount), true);
});
