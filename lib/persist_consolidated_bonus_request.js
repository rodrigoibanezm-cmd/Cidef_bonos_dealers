function documentacionEstado(closure) {
  if (closure.cierre_estado === "VERDE") return "COMPLETA";
  if (closure.documentos_faltantes.length) return "INCOMPLETA";
  return "REQUIERE_CORRECCION";
}

function firstText(...values) {
  return values.find((value) => String(value || "").trim()) ?? null;
}

export async function persistConsolidatedBonusRequest({ sql, tenantId, vin, documents, closure }) {
  const { fv, fc, ins, fin, repo } = documents;
  const values = {
    sourceFilename: fv?.source_filename ?? null,
    dealerNombre: fv?.nombre_dealer ?? null,
    rutDealer: fv?.rut_dealer ?? null,
    nombreCliente: closure.nombre_cliente,
    rutCliente: closure.rut_cliente,
    fechaCompra: fc?.fecha_factura_compra ?? null,
    montoCompra: fc?.precio_compra_total ?? null,
    fechaVenta: fv?.fecha_factura_venta ?? null,
    montoVenta: fv?.precio_venta_total ?? null,
    marca: firstText(ins?.marca, fc?.marca, fv?.marca, fin?.marca),
    modelo: firstText(ins?.modelo, fc?.modelo, fv?.modelo, fin?.modelo),
    ppu: ins?.ppu ?? null,
    anio: ins?.anio ?? fc?.anio ?? null,
    financiamiento: fin?.financiera ?? fv?.financiamiento ?? null,
    montoFinanciado: fin?.monto_financiado ?? null,
    numeroOperacion: fin?.numero_operacion ?? null,
    fechaAprobacion: fin?.fecha_aprobacion ?? null,
    vinReposicion: repo?.vin_nuevo ?? null,
    fechaReposicion: repo?.fecha ?? null,
  };
  const statuses = closure.document_statuses;
  const complete = closure.cierre_estado === "VERDE";
  const documentation = documentacionEstado(closure);
  const existing = await sql`
    select id from bonus_requests where tenant_id=${tenantId} and upper(vin)=${vin}
    order by created_at asc limit 1
  `;

  if (existing[0]) {
    const rows = await sql`
      update bonus_requests set
        source_filename=${values.sourceFilename}, dealer_nombre=${values.dealerNombre}, rut_dealer=${values.rutDealer},
        nombre_cliente=${values.nombreCliente}, rut_cliente=${values.rutCliente},
        fecha_compra=${values.fechaCompra}, monto_compra=${values.montoCompra},
        fecha_venta=${values.fechaVenta}, monto_venta=${values.montoVenta},
        marca=${values.marca}, modelo=${values.modelo}, ppu=${values.ppu}, anio=${values.anio},
        financiamiento=${values.financiamiento}, monto_financiado=${values.montoFinanciado},
        numero_operacion_financiamiento=${values.numeroOperacion}, fecha_aprobacion_financiamiento=${values.fechaAprobacion},
        vin_reposicion=${values.vinReposicion}, fecha_reposicion=${values.fechaReposicion},
        fv_status=${statuses.fv}, fc_status=${statuses.fc}, inscripcion_status=${statuses.ins},
        financiamiento_status=${statuses.fin}, reposicion_status=${statuses.repo},
        documentacion_estado=${documentation}, documentos_completos=${complete},
        documentos_faltantes=${JSON.stringify(closure.documentos_faltantes)}::jsonb,
        tiene_inconsistencias=${closure.inconsistencias.length > 0},
        inconsistencias=${JSON.stringify(closure.inconsistencias)}::jsonb,
        cierre_estado=${closure.cierre_estado}, requiere_revision_humana=${closure.requiere_revision_humana},
        audit_status=${closure.audit_status},
        updated_at=now()
      where id=${existing[0].id}
      returning *
    `;
    return rows[0];
  }

  const rows = await sql`
    insert into bonus_requests (
      tenant_id, vin, estado, source_filename, dealer_nombre, rut_dealer,
      nombre_cliente, rut_cliente, fecha_compra, monto_compra, fecha_venta, monto_venta, marca, modelo, ppu, anio,
      financiamiento, monto_financiado, numero_operacion_financiamiento, fecha_aprobacion_financiamiento,
      vin_reposicion, fecha_reposicion, fv_status, fc_status, inscripcion_status, financiamiento_status,
      reposicion_status, documentacion_estado, documentos_completos, documentos_faltantes,
      tiene_inconsistencias, inconsistencias, cierre_estado, requiere_revision_humana, audit_status
    ) values (
      ${tenantId}, ${vin}, 'PENDIENTE', ${values.sourceFilename}, ${values.dealerNombre}, ${values.rutDealer},
      ${values.nombreCliente}, ${values.rutCliente}, ${values.fechaCompra}, ${values.montoCompra},
      ${values.fechaVenta}, ${values.montoVenta}, ${values.marca}, ${values.modelo}, ${values.ppu}, ${values.anio},
      ${values.financiamiento}, ${values.montoFinanciado}, ${values.numeroOperacion}, ${values.fechaAprobacion},
      ${values.vinReposicion}, ${values.fechaReposicion}, ${statuses.fv}, ${statuses.fc}, ${statuses.ins}, ${statuses.fin},
      ${statuses.repo}, ${documentation}, ${complete}, ${JSON.stringify(closure.documentos_faltantes)}::jsonb,
      ${closure.inconsistencias.length > 0}, ${JSON.stringify(closure.inconsistencias)}::jsonb,
      ${closure.cierre_estado}, ${closure.requiere_revision_humana}, ${closure.audit_status}
    ) returning *
  `;
  return rows[0];
}
