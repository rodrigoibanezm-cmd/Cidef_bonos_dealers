const IVA_FACTOR = 1.19;

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[^0-9-]/g, "");
  if (!normalized || normalized === "-") return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function usesNetAmounts(row) {
  return row?.precio_lista == null && row?.precio_neto != null;
}

function grossAmount(value, row) {
  const amount = parseMoney(value);
  return usesNetAmounts(row) ? Math.round(amount * IVA_FACTOR) : amount;
}

export function extractPriceBonuses(row) {
  const raw = row?.raw_payload || {};
  const bonoCidef = grossAmount(row?.bono_cidef ?? raw.bono_cidef, row);
  const bonoFin = grossAmount(
    row?.bono_forum ?? raw.bono_forum ?? raw.bono_financiamiento,
    row,
  );
  const bonoCierre = grossAmount(row?.bono_mes ?? raw.bono_marzo, row);

  return {
    bono_cidef: bonoCidef,
    bono_fin_venta: bonoFin,
    bono_promocional: bonoCierre,
    bono_cierre_lista: bonoCierre,
    bono_cierre_venta: bonoCierre,
    componentes_cierre: bonoCierre ? { bono_mes: bonoCierre } : {},
    montos_origen: usesNetAmounts(row) ? "NETO_CONVERTIDO_IVA" : "IVA_INCLUIDO",
  };
}

export function priceListValue(row) {
  if (row?.precio_lista != null) return parseMoney(row.precio_lista);
  if (row?.precio_con_iva != null) return parseMoney(row.precio_con_iva);
  if (row?.precio_neto != null) return Math.round(parseMoney(row.precio_neto) * IVA_FACTOR);
  return null;
}
