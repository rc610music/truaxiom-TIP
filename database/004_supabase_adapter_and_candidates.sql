-- TIP Sprint 002: Supabase adapter + crawler candidate workflow
-- Purpose: prepare persistence surfaces for repository adapter bootstrap and crawler-to-content-map review.

create table if not exists supabase_adapter_bootstrap_runs (
  id text primary key,
  provider text not null default 'supabase',
  organization_id text references organizations(id),
  status text not null check (status in ('planned', 'running', 'completed', 'failed')),
  inserted_collections integer not null default 0,
  inserted_records integer not null default 0,
  notes text[] default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists content_map_candidate_workflows (
  id text primary key,
  product_id text not null references products(id),
  created_at timestamptz not null default now(),
  candidate_count integer not null default 0,
  accepted_count integer not null default 0,
  needs_review_count integer not null default 0,
  status text not null default 'open' check (status in ('open', 'reviewing', 'merged', 'rejected', 'archived'))
);

create table if not exists content_map_candidates (
  id text primary key,
  workflow_id text not null references content_map_candidate_workflows(id) on delete cascade,
  extracted_record_id text references extracted_content_records(id),
  product_id text not null references products(id),
  title text not null,
  url text,
  proposed_type text not null,
  proposed_intent text not null,
  proposed_section text not null,
  primary_topic text not null,
  secondary_topics text[] default '{}',
  confidence text not null,
  rationale text,
  status text not null check (status in ('candidate', 'accepted', 'rejected', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_map_candidates_workflow_id on content_map_candidates(workflow_id);
create index if not exists idx_content_map_candidates_product_id on content_map_candidates(product_id);
create index if not exists idx_content_map_candidates_status on content_map_candidates(status);

comment on table supabase_adapter_bootstrap_runs is 'Tracks bootstrap attempts that seed Supabase from a TIP repository snapshot.';
comment on table content_map_candidate_workflows is 'Represents a reviewable crawler-to-content-map candidate generation pass.';
comment on table content_map_candidates is 'Reviewable proposed content map items derived from extracted crawler records.';
