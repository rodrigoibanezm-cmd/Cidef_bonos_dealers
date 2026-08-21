function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[^0-9-]/g, "");
  if (!normalized || normalized === "-") return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function extractPriceBonuses(row) {
  const raw = row?.raw_payload || {};
  const bonoCidef = parseMoney(row?.bono_cidef ?? raw.bono_cidef);
  const bonoFin = parseMoney(row?.bono_forum ?? raw.bono_forum ?? raw.bono_financiamiento);
  const bonoCierre = parseMoney(row?.bono_mes);

  return {
    bono_cidef: bonoCidef,
    bono_fin_venta: bonoFin,
    bono_promocional: bonoCierre,
    bono_cierre_lista: bonoCierre,
    bono_cierre_venta: bonoCierre,
    componentes_cierre: bonoCierre ? { bono_mes: bonoCierre } : {},
  };
}

export function priceListValue(row) {
  return row?.precio_lista ?? row?.precio_neto ?? null;
}
