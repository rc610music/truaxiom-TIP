-- Additive manual migration. No production application or startup DDL.
create table if not exists tip_runtime_deliveries (
  delivery_id text primary key check (delivery_id ~ '^[a-f0-9]{64}$'),
  mission_id text not null references tip_runtime_missions(mission_id),
  mission_revision integer not null check (mission_revision > 0),
  target jsonb not null,
  packet jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','DELIVERING','DELIVERED','PAUSED')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_token text,
  lease_until timestamptz,
  last_error_code text,
  delivered_task_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (target ?& array['schema_version','tip_project_id','command_center_project_id','environment']),
  check (target->>'schema_version' = '1.0'),
  check (target->>'environment' in ('development','preview')),
  check (packet ?& array['schema_version','mission_id','revision','source']),
  check (packet->>'mission_id' = mission_id),
  check ((packet->>'revision')::integer = mission_revision)
);
create index if not exists tip_runtime_deliveries_due on tip_runtime_deliveries (status, available_at, created_at);
alter table tip_runtime_deliveries add column if not exists retry_history jsonb not null default '[]'::jsonb;
