function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function allOk(...values) {
  return values.every((value) => value === "OK");
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const BONUS_RULE_VERSIONS = Object.freeze({
  MARCH_2026: "MARZO_2026",
  CURRENT_XLS: "XLS_ACTUAL",
});

export function bonusRuleVersionForDate(value) {
  const date = toDate(value);
  if (date && date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2) {
    return BONUS_RULE_VERSIONS.MARCH_2026;
  }
  return BONUS_RULE_VERSIONS.CURRENT_XLS;
}

export function calculateBonusDifferenceAmount(input) {
  const montoCompra = money(input.monto_compra);
  const precioLista = money(input.precio_lista_venta);
  const ruleVersion = input.rule_version ?? bonusRuleVersionForDate(input.fecha_venta);

  if (montoCompra === null || precioLista === null) return null;
  if (ruleVersion === BONUS_RULE_VERSIONS.MARCH_2026) {
    return Math.max(0, montoCompra - (precioLista * 0.92));
  }

  const bonoCidef = money(input.bono_cidef);
  if (bonoCidef === null) return null;
  return Math.max(0, montoCompra - ((precioLista - bonoCidef) * 0.92));
}

export function calculateDealerDiscountResidual(input) {
  const precioVenta = money(input.precio_venta);
  const precioLista = money(input.precio_lista_venta);
  const bonoCidef = money(input.bono_cidef);
  const bonoFinVenta = money(input.bono_fin_venta);
  const bonoCierreLista = money(input.bono_cierre_venta);

  if ([precioVenta, precioLista, bonoCidef, bonoFinVenta, bonoCierreLista].includes(null)) return null;
  return precioLista - bonoFinVenta - bonoCierreLista - bonoCidef - precioVenta;
}

function manualOverrideReview(override, bonoCierreLista) {
  if (!override) {
    return { amount: null, complete: false, requiresReview: false };
  }

  const amount = money(override.monto);
  const complete = amount !== null
    && Boolean(String(override.motivo || "").trim())
    && Boolean(String(override.fuente_autorizacion || "").trim())
    && Boolean(String(override.actor || "").trim())
    && Boolean(toDate(override.fecha));

  return {
    amount,
    complete,
    requiresReview: !complete || amount !== bonoCierreLista,
  };
}

export function calculateBonusBusinessRules(input) {
  const precioVenta = money(input.precio_venta);
  const precioLista = money(input.precio_lista_venta);
  const bonoCidef = money(input.bono_cidef) ?? 0;
  const bonoFinVenta = money(input.bono_fin_venta) ?? 0;
  const bonoCierreLista = money(input.bono_cierre_venta) ?? 0;
  const descuentosDealer = money(input.descuentos_dealer);
  const ruleVersion = input.rule_version ?? bonusRuleVersionForDate(input.fecha_venta);
  const override = manualOverrideReview(input.bono_cierre_override, bonoCierreLista);
  const reviewReasons = [];
  if (override.requiresReview) reviewReasons.push("BONO_CIERRE_OVERRIDE_REQUIERE_REVISION");

  // XLS R: F = H - J - K - L - I. L must be independent evidence;
  // it must never be solved from this same equality.
  const pdvOk = precioVenta === null || precioLista === null || descuentosDealer === null
    ? ""
    : (precioVenta === precioLista - bonoFinVenta - bonoCierreLista - descuentosDealer - bonoCidef ? "OK" : "");

  let diasStock = null;
  const compra = toDate(input.fecha_compra);
  const venta = toDate(input.fecha_venta);
  if (compra && venta) {
    diasStock = Math.round((venta - compra) / 86400000);
  }

  const docsBaseOk = allOk(
    input.fac_compra_ok,
    input.fac_venta_ok,
    pdvOk,
    input.inscripcion_venta_ok,
    input.fac_reposicion_ok,
  );
  const stockOk = diasStock !== null && diasStock < 91 && diasStock > 1;
  const bonoDifMatematico = calculateBonusDifferenceAmount(input);

  let bonoDif = null;
  let bonoCierre = null;
  if (docsBaseOk && stockOk) {
    bonoCierre = bonoCierreLista;
    bonoDif = bonoDifMatematico;
  }

  const bonoFin = allOk(
    input.fac_compra_ok,
    input.fac_venta_ok,
    pdvOk,
    input.inscripcion_venta_ok,
    input.carta_credito_ok,
  ) ? bonoFinVenta / 3 : null;
  const totalDeterministico = pdvOk === "OK"
    ? (bonoDif ?? 0) + (bonoCierre ?? 0) + (bonoFin ?? 0)
    : null;

  return {
    rule_version: ruleVersion,
    pdv_ok: pdvOk,
    dias_stock_dealer: diasStock,
    bono_cierre_lista: bonoCierreLista,
    bono_cierre_override: override.amount,
    bono_cierre_override_completo: override.complete,
    bono_cierre_efectivo: bonoCierreLista,
    descuento_dealer_residual: calculateDealerDiscountResidual(input),
    descuento_dealer_aprobado: descuentosDealer,
    bono_dif_matematico: bonoDifMatematico,
    bono_dif: bonoDif,
    bono_cierre: bonoCierre,
    bono_fin: bonoFin,
    total_deterministico: totalDeterministico,
    calculation_status: override.requiresReview ? "REQUIERE_REVISION" : (pdvOk === "OK" ? "OK" : "PENDIENTE"),
    review_reasons: reviewReasons,
  };
}
