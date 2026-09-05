-- SPRINT 002 — Postgres review decision adapter support
-- Target: Neon now / Supabase Postgres later

create table if not exists tip_review_decisions (
  id text primary key,
  queue_id text not null,
  item_id text not null,
  action text not null check (action in ('approve', 'reject', 'defer')),
  decided_by text not null,
  note text,
  decided_at timestamptz not null,
  resulting_status text not null,
  mode text not null default 'persistent',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tip_review_decisions_queue
  on tip_review_decisions(queue_id, decided_at desc);

create table if not exists review_decision_adapter_runs (
  id text primary key,
  provider text not null default 'postgres',
  status text not null check (status in ('planned', 'ready', 'connected', 'failed')),
  connection_label text,
  decision_table text not null default 'review_decisions',
  notes text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists review_decision_adapter_events (
  id text primary key,
  adapter_run_id text references review_decision_adapter_runs(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

insert into review_decision_adapter_runs (
  id,
  provider,
  status,
  connection_label,
  notes
) values (
  'PG-REVIEW-DECISION-ADAPTER-SPRINT-002',
  'postgres-neon-compatible',
  'planned',
  'DATABASE_URL / NEON_DATABASE_URL',
  array[
    'Prepared as a Postgres-first bridge while Supabase project creation is blocked.',
    'Neon can be used temporarily with standard Postgres connection strings.',
    'Supabase can use the same table shape later.'
  ]
) on conflict (id) do update set
  provider = excluded.provider,
  status = excluded.status,
  connection_label = excluded.connection_label,
  notes = excluded.notes,
  updated_at = now();
