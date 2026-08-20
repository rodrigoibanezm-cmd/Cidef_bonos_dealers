const DOCUMENTS = [
  ["FC", "fc"],
  ["FV", "fv"],
  ["INSCRIPCION", "ins"],
  ["FINANCIAMIENTO", "fin"],
  ["REPOSICION", "repo"],
];

function extractionPayload(row) {
  if (!row) return {};
  const payload = { ...row };
  delete payload.created_at;
  delete payload.updated_at;
  return payload;
}

export async function syncBonusRequestDocuments({ sql, requestId, tenantId, documents }) {
  for (const [documentType, key] of DOCUMENTS) {
    const row = documents?.[key];
    if (!row?.file_id) continue;

    const extraction = extractionPayload(row);
    await sql`
      insert into bonus_request_documents (
        request_id, tenant_id, document_type, file_id, file_name,
        contract_version, extraction, validation_status, review_status
      ) values (
        ${requestId}, ${tenantId}, ${documentType}, ${row.file_id}, ${row.source_filename ?? null},
        ${row.contract_version ?? null}, ${JSON.stringify(extraction)}::jsonb,
        ${row.status ?? null}, 'PENDIENTE'
      )
      on conflict (request_id, document_type) do update set
        tenant_id = excluded.tenant_id,
        file_name = excluded.file_name,
        contract_version = excluded.contract_version,
        extraction = excluded.extraction,
        validation_status = excluded.validation_status,
        review_status = case
          when bonus_request_documents.file_id = excluded.file_id then bonus_request_documents.review_status
          else 'PENDIENTE'
        end,
        reviewed_by_user_id = case
          when bonus_request_documents.file_id = excluded.file_id then bonus_request_documents.reviewed_by_user_id
          else null
        end,
        reviewed_by_tenant_id = case
          when bonus_request_documents.file_id = excluded.file_id then bonus_request_documents.reviewed_by_tenant_id
          else null
        end,
        reviewed_at = case
          when bonus_request_documents.file_id = excluded.file_id then bonus_request_documents.reviewed_at
          else null
        end,
        reviewed_extraction = case
          when bonus_request_documents.file_id = excluded.file_id then bonus_request_documents.reviewed_extraction
          else null
        end,
        file_id = excluded.file_id,
        updated_at = now()
    `;
  }
}
