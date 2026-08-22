ALTER TABLE public.bonus_fv_extractions
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS modelo_source text;

ALTER TABLE public.bonus_fc_extractions
  ADD COLUMN IF NOT EXISTS modelo_source text;

ALTER TABLE public.bonus_inscripcion_extractions
  ADD COLUMN IF NOT EXISTS modelo_source text;

ALTER TABLE public.bonus_financiamiento_extractions
  ADD COLUMN IF NOT EXISTS modelo_source text;

ALTER TABLE public.bonus_reposicion_extractions
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS modelo_source text;
