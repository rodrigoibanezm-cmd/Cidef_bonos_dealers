ALTER TABLE public.bonus_document_extraction_audits
  DROP CONSTRAINT IF EXISTS bonus_document_extraction_audits_tenant_id_vin_issue_code_attempt_key,
  DROP CONSTRAINT IF EXISTS bonus_document_extraction_aud_tenant_id_vin_issue_code_atte_key;

CREATE UNIQUE INDEX IF NOT EXISTS bonus_document_extraction_audits_evidence_attempt_key
  ON public.bonus_document_extraction_audits (tenant_id, vin, issue_code, file_id, attempt);
