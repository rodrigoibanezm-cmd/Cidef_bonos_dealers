import { db } from "../lib/db.js";
import { calculateBonusBusinessRules } from "../lib/bonus_business_rules.js";
import { buildBonusBusinessRuleInput } from "../lib/bonus_business_rule_inputs.js";
import { extractPriceBonuses, priceListValue } from "../lib/price_bonus_payload.js";
import { rankPriceVersions } from "../lib/price_version_match.js";
import { INVENTORY_MODEL_SOURCE } from "../lib/enrich_operation_model_from_inventory.js";
import { persistPriceLookupAudit } from "../lib/persist_price_lookup_audit.js";
import {
  closureBlocksCalculation,
  persistCurrentCalculationClosure,
} from "../lib/calculation_closure_status.js";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function canonicalPriceBrand(value) {
  const brand = normalize(value);
  if (brand === "DFLM" || brand === "DFM" || brand === "DONGFENG") return "DONGFENG";
  return brand;
}

function priceBrandAliases(value) {
  const brand = canonicalPriceBrand(value);
  if (brand === "DONGFENG") return ["DONGFENG", "DFM", "DFLM"];
  return [brand];
}

async function lookupPrice(sql, vin, fecha) {
  const inventoryRows = await sql`
    SELECT vin_chasis, marca, modelo, desc_abrev, tipo_motor, norma
    FROM inventario_vehiculos_global_raw
    WHERE UPPER(TRIM(vin_chasis)) = ${normalize(vin)}
    LIMIT 1
  `;
  const inventory = inventoryRows[0];
  if (!inventory) return { status: "not_found", reason: "VIN_NOT_IN_INVENTORY" };

  const brandAliases = priceBrandAliases(inventory.marca);
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
    WHERE UPPER(TRIM(pv.marca)) = ANY(${brandAliases}) AND pv.activo = true
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

export async function calculateBonusRequest({
  requestId,
  descuentosDealerEvidence = null,
  bonoCierreOverride = null,
}) {
  if (!requestId) throw new Error("requestId is required");
  const sql = db();
  const requests = await sql`SELECT * FROM bonus_requests WHERE id = ${requestId} LIMIT 1`;
  const request = requests[0];
  if (!request) throw new Error("bonus request not found");
  if (closureBlocksCalculation(request)) {
    return { status: "pending", reason: "DOCUMENTACION_NO_VERDE", cierre_estado: request.cierre_estado };
  }
  if (!request.fecha_venta) {
    const pending = {
      calculation_status: "PENDIENTE",
      pdv_ok: request.pdv_ok,
      total_devolver: null,
      reason: "FECHA_VENTA_REQUIRED",
    };
    await persistCurrentCalculationClosure({ request, calculation: pending, sql });
    return { status: "pending", reason: "FECHA_VENTA_REQUIRED" };
  }

  const lookup = await lookupPrice(sql, request.vin, request.fecha_venta);
  if (lookup.status !== "ok") {
    await persistPriceLookupAudit({
      requestId,
      tenantId: request.tenant_id,
      vin: request.vin,
      status: lookup.status,
      evidence: lookup,
      sql,
    });
    await sql`
      UPDATE bonus_requests
      SET price_lookup_status=${lookup.status}, price_lookup_evidence=null, updated_at=now()
      WHERE id=${requestId}
    `;
    await persistCurrentCalculationClosure({
      request,
      calculation: {
        calculation_status: "PENDIENTE",
        pdv_ok: request.pdv_ok,
        total_devolver: null,
        price_lookup_status: lookup.status,
        reason: lookup.reason ?? null,
      },
      sql,
    });
    return lookup;
  }

  const row = lookup.row;
  const bonuses = extractPriceBonuses(row);
  const precioLista = priceListValue(row);
  const ruleInput = buildBonusBusinessRuleInput({
    request,
    precioLista,
    bonuses,
    descuentosDealerEvidence,
    bonoCierreOverride,
    bonoCierreHistorico: request.bono_cierre_venta,
  });
  const calculated = calculateBonusBusinessRules(ruleInput);
  const flags = {
    fac_compra_ok: ruleInput.fac_compra_ok,
    fac_venta_ok: ruleInput.fac_venta_ok,
    inscripcion_venta_ok: ruleInput.inscripcion_venta_ok,
    fac_reposicion_ok: ruleInput.fac_reposicion_ok,
    carta_credito_ok: ruleInput.carta_credito_ok,
  };
  const totalDeterministico = calculated.total_deterministico;
  const totalDevolver = calculated.total_devolver;

  const evidence = {
    inventory: {
      vin: lookup.inventory.vin_chasis,
      marca: lookup.inventory.marca,
      marca_canonica: canonicalPriceBrand(lookup.inventory.marca),
      desc_abrev: lookup.inventory.desc_abrev,
      modelo: lookup.inventory.modelo,
      modelo_source: INVENTORY_MODEL_SOURCE,
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
    regla_calculo: calculated.rule_version,
    bono_cierre_lista: calculated.bono_cierre_lista,
    bono_cierre_override: calculated.bono_cierre_override,
    bono_cierre_historico: calculated.bono_cierre_historico,
    descuento_dealer_residual: calculated.descuento_dealer_residual,
    descuento_dealer_aprobado: calculated.descuento_dealer_aprobado,
    calculation_status: calculated.calculation_status,
    review_reasons: calculated.review_reasons,
  };

  await persistPriceLookupAudit({
    requestId,
    tenantId: request.tenant_id,
    vin: request.vin,
    status: "ok",
    evidence,
    sql,
  });

  await sql`
    UPDATE bonus_requests SET
      marca=${row.marca}, modelo=${row.modelo}, price_version_id=${row.price_version_id},
      lista_precio_utilizada=${row.source_file}, precio_lista_venta=${precioLista},
      bono_cidef=${bonuses.bono_cidef}, bono_fin_venta=${bonuses.bono_fin_venta},
      bono_cierre_venta=${bonuses.bono_cierre_venta}, descuentos_dealer=${ruleInput.descuentos_dealer},
      fac_compra_ok=${flags.fac_compra_ok}, fac_venta_ok=${flags.fac_venta_ok},
      inscripcion_venta_ok=${flags.inscripcion_venta_ok}, fac_reposicion_ok=${flags.fac_reposicion_ok},
      carta_credito_ok=${flags.carta_credito_ok}, pdv_ok=${calculated.pdv_ok},
      dias_stock_dealer=${calculated.dias_stock_dealer}, bono_dif=${calculated.bono_dif},
      bono_cierre=${calculated.bono_cierre}, bono_fin=${calculated.bono_fin},
      diferencia_precio=${calculated.bono_dif}, bono_financiamiento=${calculated.bono_fin},
      otro_bono=${calculated.bono_cierre},
      total_devolver=${totalDevolver},
      requiere_revision_humana=case
        when ${calculated.calculation_status}='REQUIERE_REVISION' then true
        else requiere_revision_humana
      end,
      price_lookup_status='ok', price_lookup_evidence=null, updated_at=now()
    WHERE id=${requestId}
  `;

  const currentClosure = await persistCurrentCalculationClosure({
    request,
    calculation: {
      calculation_status: calculated.calculation_status,
      pdv_ok: calculated.pdv_ok,
      total_devolver: totalDevolver,
      price_lookup_status: "ok",
      reason: calculated.calculation_status === "REQUIERE_REVISION"
        ? "BONO_CIERRE_OVERRIDE_REQUIERE_REVISION"
        : calculated.pdv_ok === "OK" ? null : "DESCUENTO_DEALER_EVIDENCE_REQUIRED",
    },
    sql,
  });

  return {
    status: calculated.calculation_status === "OK" ? "ok" : "pending",
    reason: calculated.calculation_status === "REQUIERE_REVISION"
      ? "BONO_CIERRE_OVERRIDE_REQUIERE_REVISION"
      : calculated.pdv_ok === "OK" ? null : "DESCUENTO_DEALER_EVIDENCE_REQUIRED",
    request_id: requestId,
    ...bonuses,
    ...flags,
    ...calculated,
    total_deterministico: totalDeterministico,
    total_devolver: totalDevolver,
    cierre_estado: currentClosure.cierre_estado,
    evidence,
  };
}
