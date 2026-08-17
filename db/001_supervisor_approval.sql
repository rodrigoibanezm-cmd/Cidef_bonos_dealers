-- Supervisor approval workflow for dealer bonus requests.
-- Existing canonical tables remain:
--   bonus_requests            -> one row per request
--   bonus_request_documents   -> one row per PDF/document type

begin;

alter table bonus_requests
  add column if not exists approved_by_user_id text,
  add column if not exists approved_by_tenant_id text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by_user_id text,
  add column if not exists rejected_by_tenant_id text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists paid_at timestamptz;

alter table bonus_request_documents
  add column if not exists review_status text not null default 'PENDIENTE',
  add column if not exists reviewed_by_user_id text,
  add column if not exists reviewed_by_tenant_id text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_extraction jsonb;

-- One immutable audit stream for request/document actions.
create table if not exists bonus_request_events (
  id bigserial primary key,
  request_id text not null,
  document_type text,
  action text not null,
  actor_user_id text not null,
  actor_tenant_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bonus_request_events_request_idx
  on bonus_request_events (request_id, created_at);

create index if not exists bonus_requests_queue_idx
  on bonus_requests (estado, submitted_at);

create index if not exists bonus_requests_tenant_history_idx
  on bonus_requests (tenant_id, approved_at desc);

commit;
