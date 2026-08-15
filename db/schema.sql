create extension if not exists pgcrypto;

create table if not exists bonus_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  dealer_id text,
  dealer_nombre text,
  vin text not null,
  marca text,
  modelo text,
  vendedor text,
  estado text not null default 'BORRADOR',
  financiado_forum boolean,
  rut_cliente text,
  fecha_venta date,
  monto_venta bigint,
  fecha_compra date,
  monto_compra bigint,
  dias_stock_dealer integer,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bonus_requests_tenant_created
  on bonus_requests (tenant_id, created_at desc);

create index if not exists idx_bonus_requests_estado_created
  on bonus_requests (estado, created_at asc);

create index if not exists idx_bonus_requests_vin
  on bonus_requests (vin);

create table if not exists bonus_request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references bonus_requests(id) on delete cascade,
  tenant_id text not null,
  document_type text not null,
  file_id text not null,
  file_name text,
  file_url text,
  contract_version text,
  extraction jsonb,
  validation_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, document_type)
);

create index if not exists idx_bonus_request_documents_request
  on bonus_request_documents (request_id);

create table if not exists bonus_request_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references bonus_requests(id) on delete cascade,
  document_id uuid not null references bonus_request_documents(id) on delete cascade,
  document_type text not null,
  reviewer_id text,
  decision text not null,
  rejection_reason text,
  original_extraction jsonb,
  corrected_extraction jsonb,
  reviewed_at timestamptz not null default now(),
  unique (request_id, document_type)
);

create index if not exists idx_bonus_request_reviews_request
  on bonus_request_reviews (request_id);
