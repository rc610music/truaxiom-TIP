-- TIP Database Migration 002
-- Content Map + Ingestion Foundation
-- Target: Supabase / PostgreSQL-compatible

create table if not exists ingestion_sources (
  id text primary key,
  product_id text not null references products(id),
  label text not null,
  url text not null,
  source_type text not null check (source_type in ('website', 'cms', 'repository', 'document_store', 'analytics')),
  crawl_frequency text not null check (crawl_frequency in ('manual', 'daily', 'weekly', 'event_driven')),
  sections text[] default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id text primary key,
  source_id text not null references ingestion_sources(id),
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  discovered_items integer not null default 0,
  created_knowledge_objects integer not null default 0,
  notes text[] default '{}'
);

create table if not exists content_maps (
  id text primary key,
  product_id text not null references products(id),
  generated_at timestamptz not null,
  updated_at timestamptz not null,
  total_items integer not null default 0,
  mapped_items integer not null default 0,
  needs_review integer not null default 0,
  open_gaps integer not null default 0,
  stale_items integer not null default 0
);

create table if not exists content_map_sources (
  content_map_id text not null references content_maps(id) on delete cascade,
  source_id text not null references ingestion_sources(id) on delete cascade,
  primary key (content_map_id, source_id)
);

create table if not exists content_map_items (
  id text primary key,
  content_map_id text not null references content_maps(id) on delete cascade,
  product_id text not null references products(id),
  source_id text references ingestion_sources(id),
  title text not null,
  type text not null,
  url text,
  section text not null,
  intent text not null,
  lifecycle_status text not null,
  primary_topic text not null,
  secondary_topics text[] default '{}',
  audience text,
  funnel_stage text,
  canonical_knowledge_object_id text references knowledge_objects(id),
  confidence text not null,
  last_observed_at timestamptz,
  freshness text not null,
  notes text[] default '{}',
  tags text[] default '{}'
);

create table if not exists content_clusters (
  id text primary key,
  content_map_id text not null references content_maps(id) on delete cascade,
  product_id text not null references products(id),
  name text not null,
  description text not null,
  topic text not null,
  item_ids text[] default '{}',
  target_audience text,
  strategic_role text not null,
  coverage_score integer not null check (coverage_score >= 0 and coverage_score <= 100)
);

create table if not exists content_gaps (
  id text primary key,
  content_map_id text not null references content_maps(id) on delete cascade,
  product_id text not null references products(id),
  gap_type text not null,
  title text not null,
  description text not null,
  priority text not null,
  related_item_ids text[] default '{}',
  recommended_action text not null,
  expected_impact text not null,
  status text not null check (status in ('open', 'planned', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_map_items_product on content_map_items(product_id);
create index if not exists idx_content_map_items_section on content_map_items(section);
create index if not exists idx_content_map_items_lifecycle on content_map_items(lifecycle_status);
create index if not exists idx_content_gaps_product_status on content_gaps(product_id, status);
create index if not exists idx_ingestion_runs_source_status on ingestion_runs(source_id, status);
