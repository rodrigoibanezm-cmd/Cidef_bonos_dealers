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
