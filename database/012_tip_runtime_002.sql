-- Additive, manually applied ONLY after owner approval. No startup DDL.
-- One mission owns one delegation in Runtime 002. JSON aggregate provides a single
-- atomic commit boundary for state, audit events, evidence, failures and handoffs.
create table if not exists tip_runtime_missions (
  mission_id text primary key,
  revision integer not null check (revision >= 1),
  record jsonb not null,
  created_at timestamptz not null default now(),
  check (record ?& array['mission', 'delegation', 'revision', 'events', 'evidence', 'failures', 'handoffs', 'permissionRequests', 'receipts']),
  check (record->'mission'->>'mission_id' = mission_id),
  check ((record->>'revision')::integer = revision),
  check (record->'delegation'->>'mission_id' = mission_id),
  check (jsonb_typeof(record->'events') = 'array'),
  check (jsonb_typeof(record->'evidence') = 'array'),
  check (jsonb_typeof(record->'failures') = 'array'),
  check (jsonb_typeof(record->'handoffs') = 'array')
);
