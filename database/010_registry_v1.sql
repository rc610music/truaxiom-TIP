-- TIP Registry v1
-- Reconciles the shared organization, product, and project ids into Neon/Postgres.
-- The API applies the same rows from packages/core/src/registryV1.ts on startup.
-- This script does not delete rows outside this id set.

insert into organizations (
  id, name, description, mission, vision, values, domains, status, created_at, updated_at
) values (
  'ORG-TRUAXIOM',
  'TruaXiom LLC',
  'Innovation studio building AI-powered tools, digital products, and scalable systems for creators, entrepreneurs, and growing businesses.',
  'Simplify advanced technology into practical systems that help creators, founders, and small businesses grow.',
  'A connected ecosystem where intelligent systems help businesses understand themselves, coordinate work, and act with clarity.',
  '["Practical innovation","Human authority","Reusable systems","Creative momentum","Operational clarity"]'::jsonb,
  '["AI integration","workflow automation","SaaS development","brand systems","content intelligence"]'::jsonb,
  'active',
  '2026-08-10T00:00:00-04:00',
  '2026-08-10T00:00:00-04:00'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  mission = excluded.mission,
  vision = excluded.vision,
  values = excluded.values,
  domains = excluded.domains,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into products (
  id, organization_id, name, description, category, stage, status, public_url, repository, tags, created_at, updated_at
) values
  (
    'PROD-TIP', 'ORG-TRUAXIOM', 'TIP',
    'Shared TIP Core intelligence. Mission Control is the operator UI for this product. There is one TIP core for the ecosystem.',
    'platform', 'prototype', 'active',
    'https://rc610music.github.io/truaxiom-TIP/',
    'https://github.com/rc610music/truaxiom-TIP',
    '["registry-v1","tip-core","mission-control"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-COMMAND-CENTER', 'ORG-TRUAXIOM', 'Command Center',
    'Separate executive frontend. It shares these product and project ids with TIP Core and does not run its own TIP core.',
    'app', 'prototype', 'active',
    null, null,
    '["registry-v1","executive"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-ROOTWORK', 'ORG-TRUAXIOM', 'RootWork',
    'Wellness product registered in TIP Registry v1.',
    'brand', 'production', 'active',
    'https://restoreyour.life', null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-VIBN', 'ORG-TRUAXIOM', 'V!B^n',
    'V!B^n product registered in TIP Registry v1.',
    'website', 'production', 'active',
    'https://vibn.social', null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-PREPPAY', 'ORG-TRUAXIOM', 'Prep’Pay',
    'Prep’Pay product registered in TIP Registry v1.',
    'app', 'concept', 'active',
    null, null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-KRONIKE', 'ORG-TRUAXIOM', 'Kronike',
    'Kronike product registered in TIP Registry v1.',
    'app', 'concept', 'active',
    null, null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-FLOWFEED', 'ORG-TRUAXIOM', 'FlowFeed',
    'FlowFeed product registered in TIP Registry v1.',
    'app', 'concept', 'active',
    null, null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    'PROD-DOTDIZZY', 'ORG-TRUAXIOM', 'DotDizzy',
    'DotDizzy product registered in TIP Registry v1.',
    'website', 'production', 'active',
    'https://dotdizzy.com', null,
    '["registry-v1"]'::jsonb,
    '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'
  )
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  stage = excluded.stage,
  status = excluded.status,
  public_url = excluded.public_url,
  repository = excluded.repository,
  tags = excluded.tags,
  updated_at = excluded.updated_at;

insert into projects (
  id, organization_id, product_id, name, description, priority, status, tags, created_at, updated_at
) values
  ('PRJ-TIP', 'ORG-TRUAXIOM', 'PROD-TIP', 'TIP Core', 'Shared intelligence core and Mission Control operator surface.', 'critical', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-COMMAND-CENTER', 'ORG-TRUAXIOM', 'PROD-COMMAND-CENTER', 'Command Center', 'Executive frontend project. Uses the shared TIP product and project ids.', 'high', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-ROOTWORK', 'ORG-TRUAXIOM', 'PROD-ROOTWORK', 'RootWork', 'RootWork project registered under the shared TIP organization.', 'high', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-VIBN', 'ORG-TRUAXIOM', 'PROD-VIBN', 'V!B^n', 'V!B^n project registered under the shared TIP organization.', 'medium', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-PREPPAY', 'ORG-TRUAXIOM', 'PROD-PREPPAY', 'Prep’Pay', 'Prep’Pay project registered under the shared TIP organization.', 'medium', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-KRONIKE', 'ORG-TRUAXIOM', 'PROD-KRONIKE', 'Kronike', 'Kronike project registered under the shared TIP organization.', 'medium', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-FLOWFEED', 'ORG-TRUAXIOM', 'PROD-FLOWFEED', 'FlowFeed', 'FlowFeed project registered under the shared TIP organization.', 'medium', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'),
  ('PRJ-DOTDIZZY', 'ORG-TRUAXIOM', 'PROD-DOTDIZZY', 'DotDizzy', 'DotDizzy project registered under the shared TIP organization.', 'medium', 'active', '["registry-v1"]'::jsonb, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  product_id = excluded.product_id,
  name = excluded.name,
  description = excluded.description,
  priority = excluded.priority,
  status = excluded.status,
  tags = excluded.tags,
  updated_at = excluded.updated_at;
