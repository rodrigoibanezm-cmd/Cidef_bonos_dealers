function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[^0-9-]/g, "");
  if (!normalized || normalized === "-") return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const CLOSING_KEYS = [
  "bono_mes", "bono_abril", "bono_mayo", "bono_junio", "bono_julio", "bono_agosto",
  "bono_septiembre", "bono_octubre", "bono_noviembre", "bono_diciembre",
  "bono_mil_dolares_s_iva",
];

export function extractPriceBonuses(row) {
  const raw = row?.raw_payload || {};
  const bonoCidef = parseMoney(row?.bono_cidef ?? raw.bono_cidef);
  const bonoFin = parseMoney(row?.bono_forum ?? raw.bono_forum ?? raw.bono_financiamiento);
  const closing = new Map();

  if (row?.bono_mes) closing.set("bono_mes", parseMoney(row.bono_mes));
  for (const key of CLOSING_KEYS) {
    const amount = parseMoney(raw[key]);
    if (amount) closing.set(key, amount);
  }

  return {
    bono_cidef: bonoCidef,
    bono_fin_venta: bonoFin,
    bono_cierre_venta: [...closing.values()].reduce((sum, value) => sum + value, 0),
    componentes_cierre: Object.fromEntries(closing),
  };
}

export function priceListValue(row) {
  return row?.precio_lista ?? row?.precio_neto ?? null;
}
