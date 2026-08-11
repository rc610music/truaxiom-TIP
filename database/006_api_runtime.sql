-- TIP API runtime support schema
-- Applies after base schema and ingestion/review workflow migrations.

create table if not exists api_runtime_instances (
  id text primary key,
  name text not null,
  mode text not null check (mode in ('local-static', 'supabase')),
  environment text not null default 'local',
  health_status text not null default 'unknown',
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_routes (
  id text primary key,
  runtime_instance_id text references api_runtime_instances(id) on delete cascade,
  method text not null,
  path text not null,
  description text,
  requires_auth boolean not null default true,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(method, path)
);

create table if not exists api_request_logs (
  id uuid primary key default gen_random_uuid(),
  runtime_instance_id text references api_runtime_instances(id) on delete set null,
  method text not null,
  path text not null,
  status_code integer not null,
  duration_ms integer,
  request_id text,
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into api_runtime_instances (id, name, mode, environment, health_status, metadata)
values (
  'API-RUNTIME-LOCAL-STATIC',
  'TIP Local Static API Runtime',
  'local-static',
  'local',
  'planned',
  '{"sprint":"SPRINT-002","supabaseRequired":false,"liveCrawlerEnabled":false}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  mode = excluded.mode,
  environment = excluded.environment,
  metadata = excluded.metadata,
  updated_at = now();

insert into api_routes (id, runtime_instance_id, method, path, description, requires_auth, status)
values
  ('API-ROUTE-HEALTH', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/health', 'Runtime health and repository snapshot summary.', false, 'active'),
  ('API-ROUTE-SNAPSHOT', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/snapshot', 'Full local static repository snapshot.', true, 'active'),
  ('API-ROUTE-COLLECTIONS', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/collections/:collection', 'Read a named TIP repository collection.', true, 'active'),
  ('API-ROUTE-ORG-CONTEXT', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/context/organization', 'Build Organizational Brain context packet.', true, 'active'),
  ('API-ROUTE-ROOTWORK-MAP', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/rootwork/content-map', 'Return RootWork content map and priority gaps.', true, 'active'),
  ('API-ROUTE-ROOTWORK-CRAWL', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/rootwork/mock-crawl', 'Return mock RootWork crawl, candidates, and proposed gaps.', true, 'active'),
  ('API-ROUTE-ACTIVE-RECOMMENDATIONS', 'API-RUNTIME-LOCAL-STATIC', 'GET', '/v1/recommendations/active', 'Return active platform recommendations.', true, 'active')
on conflict (method, path) do update set
  description = excluded.description,
  requires_auth = excluded.requires_auth,
  status = excluded.status,
  updated_at = now();
