ALTER TABLE public.bonus_fc_extractions
  ADD COLUMN IF NOT EXISTS expected_vin text,
  ADD COLUMN IF NOT EXISTS vin_match boolean,
  ADD COLUMN IF NOT EXISTS readable boolean,
  ADD COLUMN IF NOT EXISTS chassis_retried boolean,
  ADD COLUMN IF NOT EXISTS chassis_first_read text,
  ADD COLUMN IF NOT EXISTS chassis_retry_read text,
  ADD COLUMN IF NOT EXISTS chassis_retry_consistent boolean,
  ADD COLUMN IF NOT EXISTS full_extraction_vin text,
  ADD COLUMN IF NOT EXISTS extraction_vin_match boolean;
