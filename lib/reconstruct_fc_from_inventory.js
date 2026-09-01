import { INVENTORY_MODEL_SOURCE } from "./enrich_operation_model_from_inventory.js";

export const INVENTORY_FC_SIGNALS = Object.freeze([
  "FC_NO_APORTADA_POR_DEALER",
  "FC_RECONSTRUIDA_DESDE_INVENTARIO",
]);

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeName(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function requiredText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function inventoryAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  const parsed = Number(String(value || "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function inventoryDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  const raw = String(value || "").trim().split(/\s+/)[0];
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const first = Number(match[1]);
    const second = Number(match[2]);
    const [month, day] = match[3].length === 2 ? [first, second] : [second, first];
    return isoDate(year, month, day);
  }

  match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

export function reconstructFcFromInventoryRow({ row, vin, expectedDealer = null }) {
  if (!row || normalizeVin(row.vin_chasis) !== normalizeVin(vin)) return null;
  if (row.es_dealer !== true) return null;

  const dealer = requiredText(row.dealer_venta) || requiredText(row.dealer_nombre) || requiredText(row.cliente);
  if (expectedDealer && normalizeName(dealer) !== normalizeName(expectedDealer)) return null;

  const factura = requiredText(row.factura);
  const folio = requiredText(row.numero_factura);
  const fecha = inventoryDate(row.fecha_factura);
  const monto = inventoryAmount(row.importe_total_con_iva);
  const notaVenta = requiredText(row.nota_de_venta);
  const marca = requiredText(row.marca);
  const inventoryModel = requiredText(row.modelo);
  const modelo = inventoryModel || requiredText(row.desc_abrev);
  if (!dealer || !/^FV[A-Z0-9]*$/i.test(factura) || !folio || !fecha || !monto || !notaVenta || !marca || !modelo) return null;

  return {
    source: "INVENTARIO",
    source_table: "vehiculos_raw+ventas_raw",
    documento_original: false,
    fc_reconstruida: true,
    informational_signals: [...INVENTORY_FC_SIGNALS],
    operation_vin: normalizeVin(vin),
    vin: normalizeVin(row.vin_chasis),
    tipo_factura_compra: factura,
    folio_factura_compra: folio,
    fecha_factura_compra: fecha,
    precio_compra_total: monto,
    nota_venta: notaVenta,
    dealer,
    nombre_destinatario: dealer,
    marca,
    modelo,
    modelo_source: inventoryModel ? INVENTORY_MODEL_SOURCE : null,
    anio: requiredText(row.ano),
    status: "OK_RECONSTRUIDA",
    parse_error: false,
    documento_valido: true,
    file_id: null,
    source_filename: null,
  };
}

export function resolveFcEvidence({ documentaryFc, inventoryRows = [], vin, expectedDealer = null }) {
  if (documentaryFc) return documentaryFc;
  if (inventoryRows.length !== 1) return null;
  return reconstructFcFromInventoryRow({ row: inventoryRows[0], vin, expectedDealer });
}
