-- TruaXiom TIP / Command Center — Launch Readiness Audit persistence
-- Beta integration migration 009
-- Target: Neon/PostgreSQL

create table if not exists launch_readiness_checkpoints (
  checkpoint_id text primary key,
  project_id text not null references projects(id),
  schema_version text not null default '1.0.0',
  event_type text not null,
  audit_date date not null,
  revision_no integer not null default 1 check (revision_no >= 1),
  readiness_status text not null check (readiness_status in ('READY','READY_WITH_CONDITIONS','NEAR_READY_VERIFY_BEFORE_FINAL_LOCK','NOT_READY','BLOCKED','CANONICAL_STATE_UNRESOLVED')),
  readiness_score numeric(5,2) check (readiness_score is null or readiness_score between 0 and 100),
  canonical_confidence text not null check (canonical_confidence in ('CONFIRMED','HIGH_CONFIDENCE','AMBIGUOUS','UNKNOWN')),
  p0_count integer not null default 0 check (p0_count >= 0),
  p1_count integer not null default 0 check (p1_count >= 0),
  p2_count integer not null default 0 check (p2_count >= 0),
  p3_count integer not null default 0 check (p3_count >= 0),
  regression_count integer not null default 0 check (regression_count >= 0),
  decision_count integer not null default 0 check (decision_count >= 0),
  unverified_gate_count integer not null default 0 check (unverified_gate_count >= 0),
  payload jsonb not null,
  payload_sha256 text not null,
  human_report_uri text,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(project_id, audit_date, revision_no)
);

create table if not exists launch_readiness_findings (
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id) on delete cascade,
  finding_id text not null,
  project_id text not null references projects(id),
  category text not null,
  priority text not null check (priority in ('P0','P1','P2','P3')),
  status text not null,
  evidence_state text not null,
  title text not null,
  impact text,
  recommended_action text,
  completion_evidence text,
  owner text,
  primary key(checkpoint_id, finding_id)
);

create table if not exists launch_readiness_evidence (
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id) on delete cascade,
  evidence_id text not null,
  project_id text not null references projects(id),
  state text not null,
  source_type text not null,
  source_ref text,
  summary text not null,
  captured_at timestamptz,
  sensitive_redacted boolean not null default false,
  primary key(checkpoint_id, evidence_id)
);

create table if not exists launch_readiness_decisions (
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id) on delete cascade,
  decision_id text not null,
  project_id text not null references projects(id),
  priority text not null check (priority in ('P0','P1','P2','P3')),
  question text not null,
  options jsonb not null default '[]'::jsonb,
  recommended_default text,
  consequence_of_delay text,
  source_status text not null default 'OPEN',
  primary key(checkpoint_id, decision_id)
);

create table if not exists launch_readiness_decision_state (
  project_id text not null references projects(id),
  decision_id text not null,
  source_checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id),
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','DEFERRED','CANCELLED')),
  resolution text,
  resolved_by text,
  resolved_at timestamptz,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key(project_id, decision_id)
);

create table if not exists launch_readiness_regressions (
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id) on delete cascade,
  regression_id text not null,
  project_id text not null references projects(id),
  state text not null check (state in ('NEW','REINTRODUCED','PERSISTENT','RESOLVED','UNKNOWN')),
  priority text not null check (priority in ('P0','P1','P2','P3')),
  summary text not null,
  related_finding_ids jsonb not null default '[]'::jsonb,
  primary key(checkpoint_id, regression_id)
);

create table if not exists launch_readiness_top_actions (
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id) on delete cascade,
  project_id text not null references projects(id),
  action_rank smallint not null check (action_rank between 1 and 3),
  action text not null,
  why_it_matters text not null,
  completion_evidence text not null,
  primary key(checkpoint_id, action_rank)
);

create table if not exists project_readiness_current (
  project_id text primary key references projects(id),
  checkpoint_id text not null unique references launch_readiness_checkpoints(checkpoint_id),
  audit_date date not null,
  revision_no integer not null,
  readiness_status text not null,
  readiness_score numeric(5,2),
  canonical_confidence text not null,
  p0_count integer not null default 0,
  p1_count integer not null default 0,
  p2_count integer not null default 0,
  p3_count integer not null default 0,
  regression_count integer not null default 0,
  decision_count integer not null default 0,
  unverified_gate_count integer not null default 0,
  top_actions jsonb not null default '[]'::jsonb,
  last_verified_at timestamptz not null,
  projection_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists launch_readiness_tip_outbox (
  id text primary key,
  checkpoint_id text not null references launch_readiness_checkpoints(checkpoint_id),
  project_id text not null references projects(id),
  event_type text not null,
  payload jsonb not null,
  state text not null default 'PENDING' check (state in ('PENDING','PROCESSING','DELIVERED','FAILED','DEAD_LETTER')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(checkpoint_id,event_type)
);

create index if not exists idx_lra_checkpoint_project_date on launch_readiness_checkpoints(project_id,audit_date desc,revision_no desc);
create index if not exists idx_lra_findings_risk on launch_readiness_findings(project_id,priority,status);
create index if not exists idx_lra_decisions_project on launch_readiness_decision_state(project_id,status,updated_at desc);
create index if not exists idx_lra_regressions_project on launch_readiness_regressions(project_id,state,priority);
create index if not exists idx_lra_current_status on project_readiness_current(readiness_status,updated_at desc);
create index if not exists idx_lra_outbox_ready on launch_readiness_tip_outbox(next_attempt_at,created_at) where state in ('PENDING','FAILED');

-- Source audit rows are append-only. Operational decision state and outbox state are separate mutable overlays.
create or replace function lra_reject_source_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'immutable Launch Readiness source record cannot be %', TG_OP;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['launch_readiness_checkpoints','launch_readiness_findings','launch_readiness_evidence','launch_readiness_decisions','launch_readiness_regressions','launch_readiness_top_actions'] loop
    execute format('drop trigger if exists trg_%s_immutable on %I', t, t);
    execute format('create trigger trg_%s_immutable before update or delete on %I for each row execute function lra_reject_source_mutation()', t, t);
  end loop;
end $$;
