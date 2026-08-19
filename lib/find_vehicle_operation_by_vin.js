import { db } from "./db.js";

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function findVehicleOperationByVin(vin) {
  const normalizedVin = normalizeVin(vin);
  if (!normalizedVin) return null;

  const sql = db();
  const rows = await sql`
    SELECT
      vin_chasis,
      nota_de_venta,
      numero_factura,
      fecha_factura,
      dealer_nombre,
      dealer_rut,
      cliente,
      rut
    FROM public.inventario_vehiculos_global_raw
    WHERE upper(regexp_replace(coalesce(vin_chasis, ''), '[^A-Za-z0-9]', '', 'g')) = ${normalizedVin}
    LIMIT 1
  `;

  return rows[0] || null;
}
