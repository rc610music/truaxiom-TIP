-- Additive, development-only until reviewed. No startup DDL. PIE-owned outcomes
-- in the existing runtime database; executor mission/packet remains immutable.
create table if not exists tip_pie_finding_verifications (
  mission_id text primary key references tip_runtime_missions(mission_id),
  verification_id text not null unique check (verification_id ~ '^[a-f0-9]{64}$'),
  body jsonb not null,
  created_at timestamptz not null default now(),
  check (body->>'schema_version' = '1.0'),
  check (body->>'mission_id' = mission_id),
  check (body->>'verification_id' = verification_id),
  check (body->>'finding_state' in ('VERIFIED_RESOLVED','STILL_FAILING')),
  check (body->>'observer_actor' <> body->>'executing_agent_id'),
  check (body->>'observer_actor' <> body->>'completion_actor')
);
