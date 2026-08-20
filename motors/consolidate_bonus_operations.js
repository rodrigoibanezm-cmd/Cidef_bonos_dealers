import { db } from "../lib/db.js";
import {
  REVIEW_STATUS,
  documentReviewStatus,
  documentCorrectionReason,
} from "../lib/document_review_status.js";

function normRut(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
}

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
  return rows[0] || null;
}

async function findFc(sql, fv, vin) {
  const rows = await sql`
    select *
    from bonus_fc_extractions
    where tenant_id = ${fv.tenant_id}
      and upper(vin) = ${vin}
    order by updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

function addCorrectionIssue(issues, documentType, row, reviewStatus) {
  if (reviewStatus !== REVIEW_STATUS.REQUIERE_CORRECCION) return;
  const reason = documentCorrectionReason(row) || "REQUIERE_CORRECCION";
  issues.push(`${documentType}:${reason}`);
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
  const fc = await findFc(sql, fv, vin);

  const inconsistencias = [];
  if (fc?.vin && normVin(fc.vin) !== vin) inconsistencias.push("FC_VIN_MISMATCH");
  if (ins?.vin && normVin(ins.vin) !== vin) inconsistencias.push("INS_VIN_MISMATCH");
  if (ins?.rut_adquirente && fv.rut_cliente && normRut(ins.rut_adquirente) !== normRut(fv.rut_cliente)) inconsistencias.push("INS_RUT_CLIENTE_MISMATCH");
  if (fin?.rut_cliente && fv.rut_cliente && normRut(fin.rut_cliente) !== normRut(fv.rut_cliente)) inconsistencias.push("FIN_RUT_CLIENTE_MISMATCH");
  if (repo?.vin_original && normVin(repo.vin_original) !== vin) inconsistencias.push("REPO_VIN_ORIGINAL_MISMATCH");
  if (repo?.vin_nuevo && normVin(repo.vin_nuevo) === vin) inconsistencias.push("REPO_VIN_NUEVO_EQUALS_ORIGINAL");

  const fvStatus = documentReviewStatus(fv);
  const fcStatus = documentReviewStatus(fc);
  const insStatus = documentReviewStatus(ins);
  const finRequired = Boolean(fv.financiamiento);
  const finStatus = documentReviewStatus(fin, { required: finRequired });
  const repoStatus = documentReviewStatus(repo, { required: false });

  addCorrectionIssue(inconsistencias, "FV", fv, fvStatus);
  addCorrectionIssue(inconsistencias, "FC", fc, fcStatus);
  addCorrectionIssue(inconsistencias, "INSCRIPCION", ins, insStatus);
  addCorrectionIssue(inconsistencias, "FINANCIAMIENTO", fin, finStatus);
  addCorrectionIssue(inconsistencias, "REPOSICION", repo, repoStatus);

  const faltantes = [];
  if (fvStatus === REVIEW_STATUS.FALTA) faltantes.push("FV");
  if (fcStatus === REVIEW_STATUS.FALTA) faltantes.push("FC");
  if (insStatus === REVIEW_STATUS.FALTA) faltantes.push("INSCRIPCION");
  if (finStatus === REVIEW_STATUS.FALTA) faltantes.push("FINANCIAMIENTO");

  const statuses = [fvStatus, fcStatus, insStatus, finStatus, repoStatus];
  const requiereCorreccion = statuses.includes(REVIEW_STATUS.REQUIERE_CORRECCION) || inconsistencias.length > 0;
  const completa = faltantes.length === 0 && !requiereCorreccion;
  const documentacionEstado = requiereCorreccion
    ? REVIEW_STATUS.REQUIERE_CORRECCION
    : completa
      ? "COMPLETA"
      : "INCOMPLETA";

  const existing = await sql`
    select id from bonus_requests
    where tenant_id = ${fv.tenant_id} and upper(vin) = ${vin}
    order by created_at asc limit 1
  `;

  const values = {
    sourceFilename: fv.source_filename ?? null,
    dealerNombre: fv.nombre_dealer ?? null,
    rutDealer: fv.rut_dealer ?? null,
    nombreCliente: fv.nombre_cliente ?? null,
    rutCliente: fv.rut_cliente ?? null,
    fechaVenta: fv.fecha_factura_venta ?? null,
    montoVenta: fv.precio_venta_total ?? null,
    marca: ins?.marca ?? fc?.marca ?? null,
    modelo: ins?.modelo ?? fc?.modelo ?? null,
    ppu: ins?.ppu ?? null,
    anio: ins?.anio ?? fc?.anio ?? null,
    financiamiento: fin?.financiera ?? fv.financiamiento ?? null,
    montoFinanciado: fin?.monto_financiado ?? null,
    numeroOperacion: fin?.numero_operacion ?? null,
    fechaAprobacion: fin?.fecha_aprobacion ?? null,
    vinReposicion: repo?.vin_nuevo ?? null,
    fechaReposicion: repo?.fecha ?? null,
  };

  if (existing[0]) {
    const rows = await sql`
      update bonus_requests set
        source_filename = ${values.sourceFilename},
        dealer_nombre = ${values.dealerNombre},
        rut_dealer = ${values.rutDealer},
        nombre_cliente = ${values.nombreCliente},
        rut_cliente = ${values.rutCliente},
        fecha_venta = ${values.fechaVenta},
        monto_venta = ${values.montoVenta},
        marca = ${values.marca},
        modelo = ${values.modelo},
        ppu = ${values.ppu},
        anio = ${values.anio},
        financiamiento = ${values.financiamiento},
        monto_financiado = ${values.montoFinanciado},
        numero_operacion_financiamiento = ${values.numeroOperacion},
        fecha_aprobacion_financiamiento = ${values.fechaAprobacion},
        vin_reposicion = ${values.vinReposicion},
        fecha_reposicion = ${values.fechaReposicion},
        fv_status = ${fvStatus}, fc_status = ${fcStatus}, inscripcion_status = ${insStatus},
        financiamiento_status = ${finStatus}, reposicion_status = ${repoStatus},
        documentacion_estado = ${documentacionEstado}, documentos_completos = ${completa},
        documentos_faltantes = ${JSON.stringify(faltantes)}::jsonb,
        tiene_inconsistencias = ${requiereCorreccion}, inconsistencias = ${JSON.stringify(inconsistencias)}::jsonb,
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
      ${fv.tenant_id}, ${vin}, 'PENDIENTE', ${values.sourceFilename}, ${values.dealerNombre}, ${values.rutDealer},
      ${values.nombreCliente}, ${values.rutCliente}, ${values.fechaVenta}, ${values.montoVenta},
      ${values.marca}, ${values.modelo}, ${values.ppu}, ${values.anio},
      ${values.financiamiento}, ${values.montoFinanciado}, ${values.numeroOperacion},
      ${values.fechaAprobacion}, ${values.vinReposicion}, ${values.fechaReposicion},
      ${fvStatus}, ${fcStatus}, ${insStatus}, ${finStatus}, ${repoStatus},
      ${documentacionEstado}, ${completa}, ${JSON.stringify(faltantes)}::jsonb,
      ${requiereCorreccion}, ${JSON.stringify(inconsistencias)}::jsonb
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
