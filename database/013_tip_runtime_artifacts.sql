-- Additive manual migration. Development branch first; no startup DDL.
create table if not exists tip_runtime_artifacts (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  mission_id text not null references tip_runtime_missions(mission_id),
  body jsonb not null,
  created_at timestamptz not null default now(),
  check (body->>'mission_id' = mission_id),
  check (body->>'schema_version' = '1.0'),
  check (jsonb_typeof(body->'content') = 'object')
);
