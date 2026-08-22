import { db } from "./db.js";

export const INVENTORY_MODEL_SOURCE = "INVENTARIO_VIN";

function text(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function canonicalVin(extraction) {
  return text(extraction?.operation_vin ?? extraction?.vin ?? extraction?.vin_original)
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || null;
}

export function enrichOperationModelFromInventoryRows(extraction, inventoryRows = []) {
  if (!extraction || text(extraction.modelo) || inventoryRows.length !== 1) return extraction;
  const modelo = text(inventoryRows[0]?.modelo);
  if (!modelo) return extraction;
  return { ...extraction, modelo, modelo_source: INVENTORY_MODEL_SOURCE };
}

export async function enrichOperationModelFromInventory(extraction, { sql = db() } = {}) {
  if (!extraction || text(extraction.modelo)) return extraction;
  const vin = canonicalVin(extraction);
  if (!vin) return extraction;

  const rows = await sql`
    SELECT modelo
    FROM inventario_vehiculos_global_raw
    WHERE UPPER(TRIM(vin_chasis)) = ${vin}
  `;
  return enrichOperationModelFromInventoryRows(extraction, rows);
}
