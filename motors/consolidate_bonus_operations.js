import { db } from "../lib/db.js";

function normRut(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
}

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function docStatus(row, { required = true } = {}) {
  if (!row) return required ? "FALTA" : "NO_APLICA";
  if (row.parse_error === true) return "ERROR";
  if (row.documento_valido === false) return "ERROR";
  if (row.status && !String(row.status).startsWith("OK")) return "ERROR";
  return "OK";
}

async function findFinanciamiento(sql, fv) {
  if (!fv?.rut_cliente) return null;
  const rut = normRut(fv.rut_cliente);
  const rows = await sql`
    select *
    from bonus_financiamiento_extractions
    where tenant_id = ${fv.tenant_id}
      and regexp_replace(upper(coalesce(rut_cliente,'')), '[^0-9K]', '', 'g') = ${rut}
    order by
      case when source_filename = ${fv.source_filename ?? null} then 0 else 1 end,
      updated_at desc
    limit 2
  `;
  return rows.length === 1 ? rows[0] : rows[0] || null;
}

async function consolidateOne(sql, fv) {
  const vin = normVin(fv.vin);
  if (!vin) return null;

  const insRows = await sql`
    select * from bonus_inscripcion_extractions
    where tenant_id = ${fv.tenant_id} and upper(vin) = ${vin}
    order by updated_at desc limit 1
  `;
  const ins = insRows[0] || null;

  const repoRows = await sql`
    select * from bonus_reposicion_extractions
    where tenant_id = ${fv.tenant_id} and upper(vin_original) = ${vin}
    order by updated_at desc limit 1
  `;
  const repo = repoRows[0] || null;
  const fin = await findFinanciamiento(sql, fv);

  // FC standalone persistence is not active yet. Keep it explicitly pending.
  const fc = null;

  const inconsistencias = [];
  if (ins?.vin && normVin(ins.vin) !== vin) inconsistencias.push("INS_VIN_MISMATCH");
  if (ins?.rut_adquirente && fv.rut_cliente && normRut(ins.rut_adquirente) !== normRut(fv.rut_cliente)) inconsistencias.push("INS_RUT_CLIENTE_MISMATCH");
  if (fin?.rut_cliente && fv.rut_cliente && normRut(fin.rut_cliente) !== normRut(fv.rut_cliente)) inconsistencias.push("FIN_RUT_CLIENTE_MISMATCH");
  if (repo?.vin_original && normVin(repo.vin_original) !== vin) inconsistencias.push("REPO_VIN_ORIGINAL_MISMATCH");
  if (repo?.vin_nuevo && normVin(repo.vin_nuevo) === vin) inconsistencias.push("REPO_VIN_NUEVO_EQUALS_ORIGINAL");

  const fvStatus = docStatus(fv);
  const fcStatus = docStatus(fc);
  const insStatus = docStatus(ins);
  const finRequired = Boolean(fv.financiamiento);
  const finStatus = docStatus(fin, { required: finRequired });
  const repoStatus = docStatus(repo, { required: false });

  const faltantes = [];
  if (fvStatus === "FALTA") faltantes.push("FV");
  if (fcStatus === "FALTA") faltantes.push("FC");
  if (insStatus === "FALTA") faltantes.push("INSCRIPCION");
  if (finStatus === "FALTA") faltantes.push("FINANCIAMIENTO");

  const statuses = [fvStatus, fcStatus, insStatus, finStatus, repoStatus];
  const tieneErrores = statuses.includes("ERROR") || inconsistencias.length > 0;
  const completa = faltantes.length === 0 && !tieneErrores;
  const documentacionEstado = tieneErrores ? "ERROR" : completa ? "COMPLETA" : "INCOMPLETA";

  const existing = await sql`
    select id from bonus_requests
    where tenant_id = ${fv.tenant_id} and upper(vin) = ${vin}
    order by created_at asc limit 1
  `;

  if (existing[0]) {
    const rows = await sql`
      update bonus_requests set
        source_filename = ${fv.source_filename ?? null},
        dealer_nombre = ${fv.nombre_dealer ?? null},
        rut_dealer = ${fv.rut_dealer ?? null},
        nombre_cliente = ${fv.nombre_cliente ?? null},
        rut_cliente = ${fv.rut_cliente ?? null},
        fecha_venta = ${fv.fecha_factura_venta ?? null},
        monto_venta = ${fv.precio_venta_total ?? null},
        marca = ${ins?.marca ?? null},
        modelo = ${ins?.modelo ?? null},
        ppu = ${ins?.ppu ?? null},
        anio = ${ins?.anio ?? null},
        financiamiento = ${fin?.financiera ?? fv.financiamiento ?? null},
        monto_financiado = ${fin?.monto_financiado ?? null},
        numero_operacion_financiamiento = ${fin?.numero_operacion ?? null},
        fecha_aprobacion_financiamiento = ${fin?.fecha_aprobacion ?? null},
        vin_reposicion = ${repo?.vin_nuevo ?? null},
        fecha_reposicion = ${repo?.fecha ?? null},
        fv_status = ${fvStatus}, fc_status = ${fcStatus}, inscripcion_status = ${insStatus},
        financiamiento_status = ${finStatus}, reposicion_status = ${repoStatus},
        documentacion_estado = ${documentacionEstado}, documentos_completos = ${completa},
        documentos_faltantes = ${JSON.stringify(faltantes)}::jsonb,
        tiene_inconsistencias = ${tieneErrores}, inconsistencias = ${JSON.stringify(inconsistencias)}::jsonb,
        updated_at = now()
      where id = ${existing[0].id}
      returning *
    `;
    return rows[0];
  }

  const rows = await sql`
    insert into bonus_requests (
      tenant_id, vin, estado, source_filename, dealer_nombre, rut_dealer,
      nombre_cliente, rut_cliente, fecha_venta, monto_venta, marca, modelo, ppu, anio,
      financiamiento, monto_financiado, numero_operacion_financiamiento,
      fecha_aprobacion_financiamiento, vin_reposicion, fecha_reposicion,
      fv_status, fc_status, inscripcion_status, financiamiento_status, reposicion_status,
      documentacion_estado, documentos_completos, documentos_faltantes,
      tiene_inconsistencias, inconsistencias
    ) values (
      ${fv.tenant_id}, ${vin}, 'PENDIENTE', ${fv.source_filename ?? null}, ${fv.nombre_dealer ?? null}, ${fv.rut_dealer ?? null},
      ${fv.nombre_cliente ?? null}, ${fv.rut_cliente ?? null}, ${fv.fecha_factura_venta ?? null}, ${fv.precio_venta_total ?? null},
      ${ins?.marca ?? null}, ${ins?.modelo ?? null}, ${ins?.ppu ?? null}, ${ins?.anio ?? null},
      ${fin?.financiera ?? fv.financiamiento ?? null}, ${fin?.monto_financiado ?? null}, ${fin?.numero_operacion ?? null},
      ${fin?.fecha_aprobacion ?? null}, ${repo?.vin_nuevo ?? null}, ${repo?.fecha ?? null},
      ${fvStatus}, ${fcStatus}, ${insStatus}, ${finStatus}, ${repoStatus},
      ${documentacionEstado}, ${completa}, ${JSON.stringify(faltantes)}::jsonb,
      ${tieneErrores}, ${JSON.stringify(inconsistencias)}::jsonb
    ) returning *
  `;
  return rows[0];
}

export async function consolidateBonusOperations({ tenantId = null } = {}) {
  const sql = db();
  const fvs = tenantId
    ? await sql`select * from bonus_fv_extractions where tenant_id = ${tenantId} and vin is not null order by updated_at asc`
    : await sql`select * from bonus_fv_extractions where vin is not null order by updated_at asc`;

  const results = [];
  for (const fv of fvs) {
    results.push(await consolidateOne(sql, fv));
  }
  return { processed: fvs.length, operations: results.filter(Boolean) };
}
