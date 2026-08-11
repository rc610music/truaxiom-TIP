-- TIP Sprint 002: Data access and crawler adapter persistence
-- Target: Supabase/PostgreSQL-compatible schema draft

create table if not exists repository_collections (
  id text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists repository_records (
  id text primary key,
  collection_id text not null references repository_collections(id),
  entity_id text not null,
  version integer not null default 1,
  payload jsonb not null,
  stored_at timestamptz not null default now(),
  unique(collection_id, entity_id)
);

create table if not exists crawl_requests (
  id text primary key,
  source_id text not null,
  product_id text not null,
  root_url text not null,
  include_paths jsonb not null default '[]'::jsonb,
  exclude_paths jsonb not null default '[]'::jsonb,
  max_depth integer not null default 2,
  requested_at timestamptz not null default now()
);

create table if not exists extracted_content_records (
  id text primary key,
  crawl_request_id text references crawl_requests(id),
  source_id text not null,
  product_id text not null,
  url text not null,
  title text not null,
  format text not null,
  raw_text text,
  excerpt text,
  detected_type text,
  detected_intent text,
  detected_topics jsonb not null default '[]'::jsonb,
  status text not null,
  http_status integer,
  canonical_url text,
  discovered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists crawler_adapter_contracts (
  id text primary key,
  name text not null,
  version text not null,
  source_types jsonb not null default '[]'::jsonb,
  status text not null default 'stubbed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into repository_collections (id, label, description)
values
  ('organizations', 'Organizations', 'Tenant and business identity records'),
  ('products', 'Products', 'Products, brands, platforms, and properties managed by TIP'),
  ('knowledgeObjects', 'Knowledge Objects', 'Approved and unapproved knowledge records'),
  ('contentMaps', 'Content Maps', 'Structured content intelligence maps'),
  ('recommendations', 'Recommendations', 'TIP recommendations and next actions')
on conflict (id) do nothing;

insert into crawler_adapter_contracts (id, name, version, source_types, status)
values (
  'ADAPTER-ROOTWORK-CRAWLER-MOCK',
  'RootWork Mock Website Crawler Adapter',
  '0.1.0',
  '["website"]'::jsonb,
  'stubbed'
)
on conflict (id) do nothing;
