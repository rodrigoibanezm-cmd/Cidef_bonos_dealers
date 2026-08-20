import { db } from "../lib/db.js";
import { calculateBonusBusinessRules } from "../lib/bonus_business_rules.js";
import { extractPriceBonuses, priceListValue } from "../lib/price_bonus_payload.js";
import { rankPriceVersions } from "../lib/price_version_match.js";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function jsonb(value) {
  return JSON.stringify(value ?? null);
}

async function lookupPrice(sql, vin, fecha) {
  const inventoryRows = await sql`
    SELECT vin_chasis, marca, desc_abrev, tipo_motor, norma
    FROM inventario_vehiculos_global_raw
    WHERE UPPER(TRIM(vin_chasis)) = ${normalize(vin)}
    LIMIT 1
  `;
  const inventory = inventoryRows[0];
  if (!inventory) return { status: "not_found", reason: "VIN_NOT_IN_INVENTORY" };

  const candidates = await sql`
    SELECT pv.*, ph.price_history_id, ph.vigencia_desde, ph.precio_neto, ph.precio_lista,
           ph.precio_con_iva, ph.bono_cidef, ph.bono_forum, ph.bono_mes, ph.raw_payload,
           ph.source_file, ph.source_sheet, ph.source_row
    FROM price_versions pv
    JOIN LATERAL (
      SELECT * FROM price_history ph
      WHERE ph.price_version_id = pv.price_version_id AND ph.vigencia_desde <= ${fecha}
      ORDER BY ph.vigencia_desde DESC, ph.created_at DESC LIMIT 1
    ) ph ON true
    WHERE UPPER(TRIM(pv.marca)) = ${normalize(inventory.marca)} AND pv.activo = true
  `;

  const ranked = rankPriceVersions(inventory, candidates);
  if (!ranked.length || ranked[0].score <= 0) return { status: "not_found", inventory };

  if (ranked[1] && ranked[1].score === ranked[0].score && ranked[1].row.price_version_id !== ranked[0].row.price_version_id) {
    return {
      status: "ambiguous",
      inventory,
      candidates: ranked.slice(0, 5).map(({ row, score, reasons }) => ({
        price_version_id: row.price_version_id,
        modelo: row.modelo,
        version: row.version,
        score,
        reasons,
      })),
    };
  }

  return {
    status: "ok",
    inventory,
    row: ranked[0].row,
    score: ranked[0].score,
    match_reasons: ranked[0].reasons,
  };
}

export async function calculateBonusRequest({ requestId }) {
  if (!requestId) throw new Error("requestId is required");
  const sql = db();
  const requests = await sql`SELECT * FROM bonus_requests WHERE id = ${requestId} LIMIT 1`;
  const request = requests[0];
  if (!request) throw new Error("bonus request not found");
  if (!request.fecha_venta) return { status: "pending", reason: "FECHA_VENTA_REQUIRED" };

  const lookup = await lookupPrice(sql, request.vin, request.fecha_venta);
  if (lookup.status !== "ok") {
    await sql`
      UPDATE bonus_requests
      SET price_lookup_status=${lookup.status}, price_lookup_evidence=${jsonb(lookup)}::jsonb, updated_at=now()
      WHERE id=${requestId}
    `;
    return lookup;
  }

  const row = lookup.row;
  const bonuses = extractPriceBonuses(row);
  const precioLista = priceListValue(row);
  const descuentosDealer = request.monto_venta === null || precioLista === null
    ? null
    : precioLista - bonuses.bono_fin_venta - bonuses.bono_cierre_venta - bonuses.bono_cidef - Number(request.monto_venta);

  const flags = {
    fac_compra_ok: request.fc_status === "OK" ? "OK" : "",
    fac_venta_ok: request.fv_status === "OK" ? "OK" : "",
    inscripcion_venta_ok: request.inscripcion_status === "OK" ? "OK" : "",
    fac_reposicion_ok: request.reposicion_status === "OK" ? "OK" : "",
    carta_credito_ok: request.financiamiento_status === "OK" ? "OK" : "",
  };

  const calculated = calculateBonusBusinessRules({
    precio_venta: request.monto_venta,
    precio_lista_venta: precioLista,
    bono_cidef: bonuses.bono_cidef,
    bono_fin_venta: bonuses.bono_fin_venta,
    bono_cierre_venta: bonuses.bono_cierre_venta,
    descuentos_dealer: descuentosDealer,
    fecha_compra: request.fecha_compra,
    fecha_venta: request.fecha_venta,
    ...flags,
  });

  const evidence = {
    inventory: {
      vin: lookup.inventory.vin_chasis,
      desc_abrev: lookup.inventory.desc_abrev,
      tipo_motor: lookup.inventory.tipo_motor,
      norma: lookup.inventory.norma,
    },
    price_version_id: row.price_version_id,
    modelo: row.modelo,
    version: row.version,
    vigencia_desde: row.vigencia_desde,
    source_file: row.source_file,
    source_sheet: row.source_sheet,
    source_row: row.source_row,
    match_score: lookup.score,
    match_reasons: lookup.match_reasons,
    componentes_cierre: bonuses.componentes_cierre,
  };

  await sql`
    UPDATE bonus_requests SET
      marca=${row.marca}, modelo=${row.modelo}, price_version_id=${row.price_version_id},
      lista_precio_utilizada=${row.source_file}, precio_lista_venta=${precioLista},
      bono_cidef=${bonuses.bono_cidef}, bono_fin_venta=${bonuses.bono_fin_venta},
      bono_cierre_venta=${bonuses.bono_cierre_venta}, descuentos_dealer=${descuentosDealer},
      fac_compra_ok=${flags.fac_compra_ok}, fac_venta_ok=${flags.fac_venta_ok},
      inscripcion_venta_ok=${flags.inscripcion_venta_ok}, fac_reposicion_ok=${flags.fac_reposicion_ok},
      carta_credito_ok=${flags.carta_credito_ok}, pdv_ok=${calculated.pdv_ok},
      dias_stock_dealer=${calculated.dias_stock_dealer}, bono_dif=${calculated.bono_dif},
      bono_cierre=${calculated.bono_cierre}, bono_fin=${calculated.bono_fin},
      diferencia_precio=${calculated.bono_dif}, bono_financiamiento=${calculated.bono_fin},
      otro_bono=${calculated.bono_cierre},
      total_devolver=${(calculated.bono_dif ?? 0) + (calculated.bono_cierre ?? 0) + (calculated.bono_fin ?? 0)},
      price_lookup_status='ok', price_lookup_evidence=${jsonb(evidence)}::jsonb, updated_at=now()
    WHERE id=${requestId}
  `;

  return { status: "ok", request_id: requestId, ...bonuses, ...flags, ...calculated, evidence };
}
