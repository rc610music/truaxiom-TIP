-- TIP Review Queue schema
-- Sprint 002 local-first review workflow persistence draft.

create table if not exists review_queues (
  id text primary key,
  status text not null default 'open',
  generated_at timestamptz not null default now(),
  source text not null default 'mission-control',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists review_queue_items (
  id text primary key,
  queue_id text not null references review_queues(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  status text not null default 'needs_review',
  priority text not null default 'medium',
  source text not null,
  entity_id text,
  product_id text,
  recommended_action text,
  evidence jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_queue_items_queue_id on review_queue_items(queue_id);
create index if not exists idx_review_queue_items_status on review_queue_items(status);
create index if not exists idx_review_queue_items_priority on review_queue_items(priority);
create index if not exists idx_review_queue_items_product_id on review_queue_items(product_id);

create table if not exists review_decisions (
  id text primary key,
  queue_item_id text not null references review_queue_items(id) on delete cascade,
  decision text not null,
  decision_reason text,
  follow_up_task_id text,
  decided_by text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_review_decisions_queue_item_id on review_decisions(queue_item_id);
create index if not exists idx_review_decisions_decision on review_decisions(decision);
