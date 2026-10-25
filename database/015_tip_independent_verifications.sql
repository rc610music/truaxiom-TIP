-- Additive manual migration. Development branch first; no startup DDL.
-- The completed mission row stays immutable. This table is the later observer record.
create table if not exists tip_runtime_independent_verifications (
  mission_id text primary key references tip_runtime_missions(mission_id),
  verification_id text not null unique check (verification_id ~ '^[a-f0-9]{64}$'),
  body jsonb not null,
  created_at timestamptz not null default now(),
  check (body->>'schema_version' = '1.0'),
  check (body->>'mission_id' = mission_id),
  check (body->>'verification_id' = verification_id),
  check (body->>'lifecycle' = 'RECORDED'),
  check (body->>'result' in ('MATCH', 'MISMATCH')),
  check (body->>'dot_approval' = 'NOT_RECORDED'),
  check (body->>'finding_resolution' = 'NOT_RECORDED'),
  check ((body->>'dispatch_enabled') = 'false'),
  check (body->>'ledger_sender' = 'TIP'),
  check (body->>'observer_actor' <> body->>'executing_agent_id'),
  check (body->>'observer_actor' <> body->>'completion_actor'),
  check (body->>'acknowledgment_actor' <> body->>'executing_agent_id'),
  check (body->>'acknowledgment_actor' <> body->>'completion_actor')
);
