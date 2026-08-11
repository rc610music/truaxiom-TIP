-- TIP Sprint 002: AI provider adapter + review workflow surfaces

create table if not exists ai_generation_requests (
  id text primary key,
  organization_id text not null references organizations(id),
  product_id text references products(id),
  module_id text references modules(id),
  objective text not null,
  context text[] default '{}',
  constraints text[] default '{}',
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists ai_generation_results (
  request_id text primary key references ai_generation_requests(id) on delete cascade,
  provider text not null,
  model text,
  status text not null check (status in ('draft', 'completed', 'failed')),
  output text not null,
  confidence text not null,
  evidence text[] default '{}',
  errors text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists recommendation_task_conversions (
  id text primary key,
  recommendation_id text not null references recommendations(id),
  task_id text not null references tasks(id),
  converted_at timestamptz not null default now(),
  notes text[] default '{}'
);

create table if not exists review_queue_items (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  review_reason text not null,
  priority text not null,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'needs_changes', 'archived')),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_queue_status on review_queue_items(status);
create index if not exists idx_review_queue_priority on review_queue_items(priority);
create index if not exists idx_ai_generation_requests_product_id on ai_generation_requests(product_id);

comment on table ai_generation_requests is 'Provider-agnostic requests for AI-assisted outputs.';
comment on table ai_generation_results is 'Provider-agnostic AI output records, including manual/offline draft provider results.';
comment on table recommendation_task_conversions is 'Tracks recommendation-to-task conversion events.';
comment on table review_queue_items is 'Human review queue for candidates, recommendations, tasks, and generated outputs.';
