export const XLS_COLUMN_MAP = Object.freeze({
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

function ok(value) {
  return value === "OK" ? "OK" : "";
}

export function buildBonusBusinessRuleInput({
  request,
  precioLista,
  bonuses,
  descuentosDealerEvidence = null,
  bonoCierreOverride = null,
  bonoCierreHistorico = null,
  ruleVersion = null,
}) {
  const financiamientoAplica = request?.financiamiento_status === "OK";

  return {
    monto_compra: request?.monto_compra ?? null,
    precio_venta: request?.monto_venta ?? null,
    precio_lista_venta: precioLista ?? null,
    descuentos_dealer: descuentosDealerEvidence,
    bono_fin_venta_disponible: bonuses?.bono_fin_venta ?? 0,
    bono_fin_venta: financiamientoAplica ? (bonuses?.bono_fin_venta ?? 0) : 0,
    bono_cierre_venta: bonuses?.bono_cierre_venta ?? 0,
    bono_cidef: bonuses?.bono_cidef ?? 0,
    bono_cierre_override: bonoCierreOverride,
    bono_cierre_historico: bonoCierreHistorico,
    revision_pendiente: request?.requiere_revision_humana === true,
    rule_version: ruleVersion,
    fecha_compra: request?.fecha_compra ?? null,
    fecha_venta: request?.fecha_venta ?? null,
    fac_compra_ok: ok(request?.fc_status),
    fac_venta_ok: ok(request?.fv_status),
    inscripcion_venta_ok: ok(request?.inscripcion_status),
    fac_reposicion_ok: ok(request?.reposicion_status),
    carta_credito_ok: ok(request?.financiamiento_status),
    financiamiento_aplica: financiamientoAplica,
  };
}
