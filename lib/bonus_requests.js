import { db } from "./db.js";

export async function createBonusRequest({ tenantId, vin }) {
  const sql = db();
  const rows = await sql`
    insert into bonus_requests (tenant_id, vin, estado)
    values (${tenantId}, ${vin}, 'BORRADOR')
    returning id
  `;
  return rows[0];
}

export async function findDraftRequestByVin({ tenantId, vin }) {
  const sql = db();
  const rows = await sql`
    select id
    from bonus_requests
    where tenant_id = ${tenantId}
      and vin = ${vin}
      and estado = 'BORRADOR'
    order by created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function saveBonusDocument({ requestId, tenantId, documentType, uploaded, extraction }) {
  const sql = db();
  await sql`
    insert into bonus_request_documents (
      request_id, tenant_id, document_type, file_id, file_name, file_url,
      contract_version, extraction, validation_status, updated_at
    ) values (
      ${requestId}, ${tenantId}, ${documentType}, ${uploaded.id}, ${uploaded.name || null},
      ${uploaded.webViewLink || null}, ${extraction?.contract_version || null},
      ${JSON.stringify(extraction || {})}::jsonb, ${extraction?.status || null}, now()
    )
    on conflict (request_id, document_type) do update set
      file_id = excluded.file_id,
      file_name = excluded.file_name,
      file_url = excluded.file_url,
      contract_version = excluded.contract_version,
      extraction = excluded.extraction,
      validation_status = excluded.validation_status,
      updated_at = now()
  `;
}

export async function updateRequestFromExtraction({ requestId, documentType, extraction }) {
  const sql = db();

  if (documentType === "FC") {
    await sql`
      update bonus_requests set
        fecha_compra = ${extraction.fecha_factura_compra || null},
        monto_compra = ${extraction.precio_compra_total ?? null},
        updated_at = now()
      where id = ${requestId}
    `;
  }

  if (documentType === "FV") {
    await sql`
      update bonus_requests set
        financiado_forum = ${extraction.financiado_forum ?? null},
        rut_cliente = ${extraction.rut_cliente || null},
        fecha_venta = ${extraction.fecha_factura_venta || null},
        monto_venta = ${extraction.precio_venta_total ?? null},
        dias_stock_dealer = case
          when fecha_compra is not null and ${extraction.fecha_factura_venta || null}::date is not null
          then (${extraction.fecha_factura_venta || null}::date - fecha_compra)
          else dias_stock_dealer
        end,
        updated_at = now()
      where id = ${requestId}
    `;
  }
}

export async function submitBonusRequest(requestId) {
  const sql = db();
  const rows = await sql`
    update bonus_requests
    set estado = 'INGRESADA', submitted_at = now(), updated_at = now()
    where id = ${requestId} and estado = 'BORRADOR'
    returning id, estado, submitted_at
  `;
  return rows[0] || null;
}
