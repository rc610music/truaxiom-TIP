# Seed vs Postgres map

**Checked against:** main `b6eb177` and Neon project `tip-core` (`bitter-hat-91413820`).  
**Live API before this change:** `GET /health` reported `persistence: postgres-review-decision-repository`, while `summary` still counted the in-memory bootstrap snapshot (1 organization, 6 products, 1 project).

TIP Core is the only intelligence core. Mission Control is its operator UI. Command Center is a separate executive frontend and shares the `ORG-*`, `PROD-*`, and `PRJ-*` ids below.

## Route and collection map

| Surface | Store | Notes |
|---|---|---|
| `organizations`, `products`, `projects` | Postgres when `DATABASE_URL`, `NEON_DATABASE_URL`, or `SUPABASE_DB_URL` is set and `TIP_PERSISTENCE_PROVIDER` is `postgres`, `neon`, or `supabase` | Registry v1. Startup reconciles `packages/core/src/registryV1.ts` into these tables, then reads the rows back. |
| `GET /v1/registry` | Same as the three tables above | Returns Neon/Postgres rows after reconcile. Source is `in-memory-seed` only when no database is configured or reconcile fails. |
| `GET /health` `summary` organization, product, and project lines | Same as Registry v1 | `summarySources[0..2]` is `postgres` after a successful reconcile. `summarySources[4]` (`tasks`) is `postgres` only after at least one durable task row exists. The other summary lines stay seed. |
| `GET /health` `registry.counts` | Same as Registry v1 | This is the count block to compare with Neon. |
| `GET /v1/snapshot` and `GET /v1/collections/{organizations,products,projects}` | Registry rows overlaid on the bootstrap snapshot | Task rows from Postgres are merged into the snapshot and into `GET /v1/collections/tasks`. Other snapshot collections stay seed. |
| `GET /v1/collections/tasks` | Mixed | Seed tasks stay in memory. Approving a recommendation review item also upserts `tasks`. Those rows use Registry project ids (`PRJ-TIP`, `PRJ-ROOTWORK`, and the other `PRJ-*` ids), never seed `PRJ-SPRINT-002`. |
| `GET /v1/context/organization` | Mixed | Organization, products, and projects come from the overlay. Tasks include durable approval tasks once they exist. Agents, modules, knowledge, and recommendations stay seed. |
| `modules`, `agents`, `knowledgeObjects`, `recommendations`, `ingestionSources`, `contentMaps`, `graphNodes`, `graphEdges`, `activity` | In-memory seed | Neon has empty `modules`, `agents`, `knowledge_objects`, `graph_nodes`, `graph_edges`, and `activity_events` tables. The API does not read them. `recommendations`, `ingestion_sources`, and `content_maps` tables are not in Neon. |
| `tasks` | Postgres `tasks` when an approved recommendation has been written; otherwise in-memory seed | Startup replays the latest `tip_review_decisions` approve rows for recommendation items. The API adds owner, workflow, and evidence columns if they are missing. Without a database URL the same task is held in process memory and does not survive restart. |
| `GET /v1/rootwork/content-map` | In-memory seed | `rootWorkContentMap` constant. |
| `GET /v1/rootwork/mock-crawl` | In-memory seed | Mock crawler over the seed RootWork source. |
| `GET /v1/recommendations/active` | In-memory seed | |
| `GET /v1/review-queue` | Mixed | Queue items are built from the seed crawl. Item status is hydrated from `tip_review_decisions`. |
| `GET /v1/review-queue/decisions` and `POST /v1/review-queue/decisions` | Postgres `tip_review_decisions` | Insert uses `on conflict (id) do update`. The table is created on first use if it is missing. Rows survive process restart. |
| `GET /v1/ecosystem/status` | Live HTTP checks | Source list is code, not a database table. |
| `launch_readiness_*` | Postgres schema only | No API route reads or writes these tables yet. |

`GET /health` also returns `persistenceMap`, which is the same map in machine-readable form.

## Registry v1 ids

Organization: `ORG-TRUAXIOM`.

| Product id | Project id | Name |
|---|---|---|
| `PROD-TIP` | `PRJ-TIP` | TIP |
| `PROD-COMMAND-CENTER` | `PRJ-COMMAND-CENTER` | Command Center |
| `PROD-ROOTWORK` | `PRJ-ROOTWORK` | RootWork |
| `PROD-VIBN` | `PRJ-VIBN` | V!B^n |
| `PROD-PREPPAY` | `PRJ-PREPPAY` | Prep’Pay |
| `PROD-KRONIKE` | `PRJ-KRONIKE` | Kronike |
| `PROD-FLOWFEED` | `PRJ-FLOWFEED` | FlowFeed |
| `PROD-DOTDIZZY` | `PRJ-DOTDIZZY` | DotDizzy |

Migration file: `database/010_registry_v1.sql`. The API startup reconcile writes the same ids, so a deploy fills an empty database without a manual SQL step. Reconcile updates these ids and does not delete other rows.

## Environment already in use

No new secret names. The runtime still resolves the database URL in this order:

1. `NEON_DATABASE_URL`
2. `DATABASE_URL`
3. `SUPABASE_DB_URL`

Provider: `TIP_PERSISTENCE_PROVIDER=postgres`, `neon`, or `supabase`. SSL: `POSTGRES_SSL_MODE`.

The live Render service already reports `postgres-review-decision-repository`, so its dashboard environment is ahead of `render.yaml`, which still says `local-memory`. Do not reapply the blueprint over the dashboard env or the API will drop back to memory and the registry route will report `in-memory-seed`.

## Deploy notes

- Render service `truaxiom-tip-api` auto-deploys **main**. This branch does not change the public API until it is merged or the service is manually deployed from this branch.
- Mission Control is GitHub Pages at `https://rc610music.github.io/truaxiom-TIP/`. Workflow `.github/workflows/mission-control-pages.yml` deploys on pushes to **main** and sets `VITE_TIP_API_BASE_URL=https://truaxiom-tip-api.onrender.com`.
- After both deploys, `/health` registry counts should be organizations 1, products 8, projects 8, with `registry.source` of `postgres`. Mission Control should list the eight product names and their `PRJ-*` ids, with the registry pill reading `postgres`.
