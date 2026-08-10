-- TruaXiom Intelligence Platform — Initial relational schema draft
-- Target: Supabase/PostgreSQL-compatible foundation

create table if not exists organizations (
  id text primary key,
  name text not null,
  description text,
  mission text,
  vision text,
  values jsonb default '[]'::jsonb,
  domains jsonb default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  description text,
  category text not null,
  stage text not null,
  status text not null default 'planned',
  public_url text,
  repository text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  organization_id text not null references organizations(id),
  product_id text references products(id),
  name text not null,
  description text,
  priority text not null default 'medium',
  sprint text,
  next_action text,
  status text not null default 'planned',
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modules (
  id text primary key,
  name text not null,
  description text,
  capability text not null,
  installable boolean not null default true,
  status text not null default 'planned',
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  product_id text references products(id),
  name text not null,
  description text,
  objective text not null,
  autonomy_level text not null default 'recommend',
  module_ids jsonb default '[]'::jsonb,
  status text not null default 'planned',
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_objects (
  id text primary key,
  name text not null,
  description text,
  source_type text not null,
  source_uri text,
  confidence text not null default 'unknown',
  approval_status text not null default 'draft',
  freshness text not null default 'unknown',
  status text not null default 'active',
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists graph_nodes (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  label text not null,
  metadata jsonb default '{}'::jsonb
);

create table if not exists graph_edges (
  id text primary key,
  from_node_id text not null references graph_nodes(id),
  to_node_id text not null references graph_nodes(id),
  relationship text not null,
  confidence text not null default 'unknown',
  source text,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  organization_id text references organizations(id),
  product_id text references products(id),
  project_id text references projects(id),
  name text not null,
  description text,
  priority text not null default 'medium',
  status text not null default 'planned',
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activity_events (
  id text primary key,
  type text not null,
  label text not null,
  description text,
  entity_id text,
  entity_type text,
  occurred_at timestamptz not null default now()
);
