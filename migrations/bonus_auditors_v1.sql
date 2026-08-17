create table if not exists bonus_auditors (
  id text primary key,
  name text not null,
  tenant_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into bonus_auditors (id, name, tenant_id)
values
  ('auditor-1', 'Auditor 1', 'bonus-auditors'),
  ('auditor-2', 'Auditor 2', 'bonus-auditors'),
  ('auditor-3', 'Auditor 3', 'bonus-auditors')
on conflict (id) do update set
  name = excluded.name,
  tenant_id = excluded.tenant_id,
  active = true,
  updated_at = now();
