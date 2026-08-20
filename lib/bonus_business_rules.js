function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function allOk(...values) {
  return values.every((value) => value === "OK");
}

export function calculateBonusBusinessRules(input) {
  const precioVenta = money(input.precio_venta);
  const precioLista = money(input.precio_lista_venta);
  const bonoCidef = money(input.bono_cidef) ?? 0;
  const bonoFinVenta = money(input.bono_fin_venta) ?? 0;
  const bonoCierreVenta = money(input.bono_cierre_venta) ?? 0;
  const descuentosDealer = money(input.descuentos_dealer) ?? 0;

  const pdvOk = precioLista === null
    ? ""
    : (precioVenta === precioLista - bonoFinVenta - bonoCierreVenta - descuentosDealer - bonoCidef ? "OK" : "");

  let diasStock = null;
  if (input.fecha_compra && input.fecha_venta) {
    const compra = new Date(`${input.fecha_compra}T00:00:00Z`);
    const venta = new Date(`${input.fecha_venta}T00:00:00Z`);
    if (!Number.isNaN(compra.getTime()) && !Number.isNaN(venta.getTime())) {
      diasStock = Math.round((venta - compra) / 86400000);
    }
  }

  const docsBaseOk = allOk(
    input.fac_compra_ok,
    input.fac_venta_ok,
    pdvOk,
    input.inscripcion_venta_ok,
    input.fac_reposicion_ok,
  );
  const stockOk = diasStock !== null && diasStock < 91 && diasStock > 1;

  let bonoDif = null;
  let bonoCierre = null;
  if (docsBaseOk && stockOk) {
    bonoCierre = bonoCierreVenta;
    bonoDif = precioVenta === null || precioLista === null
      ? null
      : Math.max(0, precioVenta - ((precioLista - bonoCidef) * 0.92));
  }

  const bonoFin = allOk(
    input.fac_compra_ok,
    input.fac_venta_ok,
    pdvOk,
    input.inscripcion_venta_ok,
    input.carta_credito_ok,
  ) ? bonoFinVenta / 3 : null;

  return {
    pdv_ok: pdvOk,
    dias_stock_dealer: diasStock,
    bono_dif: bonoDif,
    bono_cierre: bonoCierre,
    bono_fin: bonoFin,
  };
}
