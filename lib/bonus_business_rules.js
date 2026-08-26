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
  const bonoCidef = money(input.bono_cidef) ?? 0;
  const bonoFinVenta = money(input.bono_fin_venta) ?? 0;
  const bonoCierre = money(input.bono_cierre_venta) ?? 0;

  if (precioVenta === null || precioLista === null) return null;
  return precioLista - bonoFinVenta - bonoCierre - bonoCidef - precioVenta;
}

function calculateClosureResidual(input) {
  const precioVenta = money(input.precio_venta);
  const precioLista = money(input.precio_lista_venta);
  const bonoCidef = money(input.bono_cidef) ?? 0;
  const bonoFinVenta = money(input.bono_fin_venta) ?? 0;
  const descuentosDealer = money(input.descuentos_dealer);

  if (precioVenta === null || precioLista === null || descuentosDealer === null) return null;
  return precioLista - bonoCidef - bonoFinVenta - descuentosDealer - precioVenta;
}

function manualOverrideReview(override, bonoCierreEfectivo) {
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
    requiresReview: !complete || amount !== bonoCierreEfectivo,
  };
}

function historicalClosureReview(value, bonoCierreEfectivo) {
  const amount = money(value);
  return {
    amount,
    requiresReview: amount !== null && bonoCierreEfectivo !== null && amount !== bonoCierreEfectivo,
  };
}

export function calculateBonusBusinessRules(input) {
  const precioVenta = money(input.precio_venta);
  const precioLista = money(input.precio_lista_venta);
  const bonoCidef = money(input.bono_cidef) ?? 0;
  const bonoFinVenta = money(input.bono_fin_venta) ?? 0;
  const bonoCierreLista = money(input.bono_cierre_venta) ?? 0;

  const descuentoManual = money(input.descuentos_dealer);
  const descuentoPropuestoRaw = descuentoManual === null && input.auto_seed_descuento_dealer === true
    ? calculateDealerDiscountResidual(input)
    : null;
  const descuentoPropuesto = descuentoPropuestoRaw !== null && descuentoPropuestoRaw >= 0
    ? descuentoPropuestoRaw
    : null;
  const descuentosDealer = descuentoManual ?? descuentoPropuesto;
  const descuentoSource = descuentoManual !== null
    ? "MANUAL"
    : (descuentoPropuesto !== null ? "PROPUESTO_DESDE_BONO_CIERRE_LISTA" : null);

  // K is always recalculated from the current L. On the initial proposal, L is
  // seeded so K reproduces the applicable list closing bonus. If L is edited,
  // K and the payable total change immediately.
  const bonoCierreResidual = calculateClosureResidual({ ...input, descuentos_dealer: descuentosDealer });
  const cierreResidualNegativo = bonoCierreResidual !== null && bonoCierreResidual < 0;
  const bonoCierreEfectivo = bonoCierreResidual !== null && !cierreResidualNegativo
    ? bonoCierreResidual
    : null;
  const cierreSource = bonoCierreEfectivo !== null ? "RESIDUAL_PDV" : null;

  const descuentoResidual = calculateDealerDiscountResidual(input);
  const ruleVersion = input.rule_version ?? bonusRuleVersionForDate(input.fecha_venta);
  const override = manualOverrideReview(input.bono_cierre_override, bonoCierreEfectivo);
  const historical = historicalClosureReview(input.bono_cierre_historico, bonoCierreEfectivo);
  const reviewReasons = [];
  if (override.requiresReview) reviewReasons.push("BONO_CIERRE_OVERRIDE_REQUIERE_REVISION");
  if (historical.requiresReview) reviewReasons.push("BONO_CIERRE_HISTORICO_DIFIERE_DE_LISTA");
  if (input.revision_pendiente === true) reviewReasons.push("REVISION_HUMANA_PENDIENTE");
  if (descuentoPropuestoRaw !== null && descuentoPropuestoRaw < 0) {
    reviewReasons.push("DESCUENTO_DEALER_PROPUESTO_NEGATIVO");
  }
  if (cierreResidualNegativo) reviewReasons.push("BONO_CIERRE_RESIDUAL_NEGATIVO");

  const pdvOk = precioVenta === null || precioLista === null || descuentosDealer === null || bonoCierreEfectivo === null
    ? ""
    : (precioVenta === precioLista - bonoFinVenta - bonoCierreEfectivo - descuentosDealer - bonoCidef ? "OK" : "");

  let diasStock = null;
  const compra = toDate(input.fecha_compra);
  const venta = toDate(input.fecha_venta);
  if (compra && venta) {
    diasStock = Math.round((venta - compra) / 86400000);
  }
  if (diasStock !== null && diasStock > 90) reviewReasons.push("DIAS_STOCK_MAYOR_90");

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
    bonoCierre = bonoCierreEfectivo;
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
  const calculationStatus = reviewReasons.length
    ? "REQUIERE_REVISION"
    : (pdvOk === "OK" ? "OK" : "PENDIENTE");
  const totalDevolver = calculationStatus === "OK" ? totalDeterministico : null;

  return {
    rule_version: ruleVersion,
    pdv_ok: pdvOk,
    dias_stock_dealer: diasStock,
    bono_cierre_lista: bonoCierreLista,
    bono_cierre_residual: bonoCierreResidual,
    bono_cierre_source: cierreSource,
    bono_cierre_override: override.amount,
    bono_cierre_override_completo: override.complete,
    bono_cierre_historico: historical.amount,
    bono_cierre_efectivo: bonoCierreEfectivo,
    descuento_dealer_residual: descuentoResidual,
    descuento_dealer_propuesto: descuentoPropuesto,
    descuento_dealer_aprobado: descuentosDealer,
    descuento_dealer_source: descuentoSource,
    bono_dif_matematico: bonoDifMatematico,
    bono_dif: bonoDif,
    bono_cierre: bonoCierre,
    bono_fin: bonoFin,
    total_deterministico: totalDeterministico,
    total_devolver: totalDevolver,
    calculation_status: calculationStatus,
    review_reasons: reviewReasons,
  };
}
