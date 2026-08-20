ALTER TABLE public.bonus_fv_extractions
  ADD COLUMN IF NOT EXISTS nombre_facturado text,
  ADD COLUMN IF NOT EXISTS rut_facturado text,
  ADD COLUMN IF NOT EXISTS nombre_compra_para text,
  ADD COLUMN IF NOT EXISTS rut_compra_para text,
  ADD COLUMN IF NOT EXISTS identity_evidence jsonb;

ALTER TABLE public.bonus_inscripcion_extractions
  ADD COLUMN IF NOT EXISTS identity_evidence jsonb;

CREATE TABLE IF NOT EXISTS public.bonus_operation_identity_audits (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  vin text NOT NULL,
  status text NOT NULL,
  resolution_method text,
  resolved_role text,
  nombre_cliente_resuelto text,
  rut_cliente_resuelto text,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vin)
);
