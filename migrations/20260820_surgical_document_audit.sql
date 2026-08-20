ALTER TABLE public.bonus_fv_extractions ADD COLUMN IF NOT EXISTS operation_vin text;
ALTER TABLE public.bonus_fc_extractions ADD COLUMN IF NOT EXISTS operation_vin text;
ALTER TABLE public.bonus_inscripcion_extractions ADD COLUMN IF NOT EXISTS operation_vin text;
ALTER TABLE public.bonus_financiamiento_extractions ADD COLUMN IF NOT EXISTS operation_vin text;
ALTER TABLE public.bonus_reposicion_extractions ADD COLUMN IF NOT EXISTS operation_vin text;

ALTER TABLE public.bonus_requests
  ADD COLUMN IF NOT EXISTS cierre_estado text,
  ADD COLUMN IF NOT EXISTS requiere_revision_humana boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_status text;

ALTER TABLE public.bonus_operation_identity_audits
  DROP CONSTRAINT IF EXISTS bonus_operation_identity_audits_tenant_id_vin_key;

ALTER TABLE public.bonus_operation_identity_audits
  ADD COLUMN IF NOT EXISTS audit_phase text NOT NULL DEFAULT 'GLOBAL_FINAL',
  ADD COLUMN IF NOT EXISTS issue_code text;

CREATE TABLE IF NOT EXISTS public.bonus_document_extraction_audits (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  vin text NOT NULL,
  issue_code text NOT NULL,
  document_type text NOT NULL,
  extraction_id text,
  file_id text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 2),
  original_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  targeted_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_status text NOT NULL,
  resolution_status text NOT NULL,
  error text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vin, issue_code, attempt)
);

CREATE INDEX IF NOT EXISTS bonus_document_extraction_audits_operation_idx
  ON public.bonus_document_extraction_audits (tenant_id, vin, issue_code, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bonus_operation_closure_audits (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  vin text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('INICIAL', 'FINAL')),
  cierre_estado text NOT NULL CHECK (cierre_estado IN ('VERDE', 'AMARILLO', 'ROJO')),
  requiere_revision_humana boolean NOT NULL DEFAULT false,
  audit_status text NOT NULL,
  document_statuses jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentos_faltantes jsonb NOT NULL DEFAULT '[]'::jsonb,
  inconsistencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  exhausted_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_operation_closure_audits_operation_idx
  ON public.bonus_operation_closure_audits (tenant_id, vin, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bonus_price_lookup_audits (
  id bigserial PRIMARY KEY,
  request_id text NOT NULL,
  tenant_id text NOT NULL,
  vin text NOT NULL,
  status text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_price_lookup_audits_request_idx
  ON public.bonus_price_lookup_audits (request_id, created_at DESC);
