# EVD-TIP-ARCH-RECON-001 — TIP architecture reconciliation

**Status:** Read-only investigation. No product code, merge, or deploy was performed for this report.
**Repo:** `rc610music/truaxiom-TIP` (workspace package name `truaxiom-tip`)
**Commit inspected:** `eb6da6d13a8dba2a3e35921930a6a5f833933696` (`main`, matches `origin/main` at investigation time)
**Commit subject:** Replay existing approve rows into Registry tasks on boot (#4)
**Live probe:** `GET https://truaxiom-tip-api.onrender.com/health` at `2026-09-22T21:23:12.955Z` returned HTTP 200.
**Taxonomy used:** Dot's classes in the task brief, checked against `docs/architecture/TIP-ARCHITECTURE-SOURCE-OF-TRUTH-v1.0.md` and `docs/architecture/TIP-AGENT-FRAMEWORK-SPECIFICATION-v1.0.md` section 4 (the nine role questions).
**Meeting notes:** Granola MCP was not authenticated. This report does not use meeting memory.

Boundaries held while reading:

- TIP Core is the shared intelligence runtime in this repo.
- Mission Control is the operator UI (`apps/mission-control`).
- Command Center is a registered executive product (`PROD-COMMAND-CENTER` / `PRJ-COMMAND-CENTER`). This repo does not contain a Command Center application.
- Grok/xAI, ChatGPT, and Cursor do not appear in product runtime code.

---

## 0. Ten points CoS can paste

1. **What is live.** Render service `truaxiom-tip-api` is up. `GET /health` reports `mode: api`, `persistence: postgres-review-decision-repository`, registry source `postgres`, counts organizations 1 / products 8 / projects 8, `tip_review_decisions` count 7, `tasks` durableCount 1. Mission Control is the GitHub Pages app pointed at that API by `.github/workflows/mission-control-pages.yml`.
2. **What the registry actually stores.** Runtime registry is organization, product, and project rows only (`organizations`, `products`, `projects`). It is not a service registry, agent registry, or workflow registry.
3. **What the one durable task is.** Live snapshot includes seed tasks `TASK-0001`, `TASK-0002`, `TASK-0003` (project `PRJ-SPRINT-002`, memory) plus durable `TASK-FROM-REC-0002` on `PRJ-ROOTWORK`, owner `founder-local`, workflow status `started`, entry step `execute-approved-recommendation`. That row is the approve-to-task bridge for recommendation `REC-0002`.
4. **What approval does.** `POST /v1/review-queue/decisions` persists every approve/reject/defer. A task row is written only when the item type is `recommendation`. Live proof: approved content candidate `REV-CMC-EXT-ROOTWORK-HOME` and approved task candidates `REV-TASK-0001` / `REV-TASK-0002` did not add durable tasks. Only `TASK-FROM-REC-0002` did.
5. **What is still seed.** Recommendations, content map, mock crawl, modules, agents, knowledge objects, graph, activity, and ingestion sources are in-memory seed. Live `persistenceMap` says so. Graph node and edge counts on the live snapshot are 0.
6. **Provider boundary.** There is an `AiProviderAdapter` interface and a manual offline adapter. The API never calls it. `TIP_AI_PROVIDER` is logged at startup and unused for routing. No OpenAI, Anthropic, Google, Grok, xAI, or Cursor SDK is imported. `OPENAI_API_KEY` exists only as an env placeholder.
7. **Agent status.** `AGT-0001` RootWork Agent is a seed record with `status: "planned"` and `autonomyLevel: "recommend"`. No agent process, manifest instance, memory scope, or tool grant is loaded at runtime. Do not promote it to a persistent agent for the next slice.
8. **RootWork shape that matches the code.** RootWork Content Intelligence should be a Service plus a Workflow, with a later Automation only for a scheduled read-only crawl. The nine role questions in the agent spec are unanswered in code, so a persistent RootWork Agent is not justified.
9. **Highest harden risk.** `render.yaml` still sets `TIP_PERSISTENCE_PROVIDER=local-memory` while the live service is Postgres. Reapplying the blueprint would drop the API back to memory. `POST /v1/review-queue/decisions` has no authentication; `decidedBy` is a free string, default `founder-local`.
10. **Smallest next build.** Do not rebuild the registry or the approve bridge. Next code slice: when a `content_map_candidate` is approved, write one durable content/knowledge row with the same upsert and startup-replay pattern already used for recommendation tasks. Load one workflow-definition JSON for that path. Leave the model provider and the agent runtime unwired.

---

## 1. Repository inventory

Workspace npm package `truaxiom-tip` `0.0.1`. Workspaces: `apps/*`, `packages/*`. Node `>=20`.

```text
truaxiom-TIP/
  apps/api/                         HTTP server (node:http) + Postgres pool
  apps/mission-control/             Vite + React operator UI
  packages/core/                    Gateway, registry, review, tasks, RootWork helpers
  packages/types/                   Domain TypeScript types
  packages/contracts/schemas/       JSON Schema contracts, not loaded by the API
  database/                         SQL drafts; no migration runner
  scripts/                          Structure check, contract check, smoke, adapter tests
  docs/                             Architecture, ADR, sprints, deployment, development
  data/fixtures/rootwork/           mock-crawl-result.json (fixture; gateway uses code mock)
  .github/workflows/                ci.yml, api-smoke.yml, mission-control-pages.yml
  render.yaml                       Render blueprint (env lags the live service)
```

Required-path list enforced by `scripts/check-repo-structure.mjs` (63 paths). Contract check: `scripts/check-foundation-contracts.mjs` parses four schemas.

### 1.1 Packages

| Package | Path | Role |
|---|---|---|
| `@truaxiom/types` | `packages/types` | Domain types. No runtime I/O. |
| `@truaxiom/contracts` | `packages/contracts` | Four JSON Schemas. README says persistence and UI must conform. API does not import them. |
| `@truaxiom/core` | `packages/core` | All platform logic. Entry `packages/core/src/index.ts`. Depends only on `@truaxiom/types`. |
| `@truaxiom/api` | `apps/api` | Process entry. Depends on core, types, `pg@8.23.0`, `tsx`. |
| `@truaxiom/mission-control` | `apps/mission-control` | React 19 UI. Calls the API over HTTP. Does not import `@truaxiom/core` in `App.tsx`. |

### 1.2 API routes (implemented)

Declared in `packages/core/src/apiGateway.ts` `availableRoutes` and confirmed on the live `/health` body:

| Method | Path | Handler |
|---|---|---|
| GET | `/health` | Readiness, `persistenceMap`, registry meta, review count, durable task count |
| GET | `/v1/snapshot` | Bootstrap snapshot with registry overlay and durable tasks merged |
| GET | `/v1/collections/:collection` | One collection from that snapshot |
| GET | `/v1/registry` | Org / product / project registry payload |
| GET | `/v1/context/organization` | `buildOrganizationContextPacket` |
| GET | `/v1/rootwork/content-map` | Static `rootWorkContentMap` |
| GET | `/v1/rootwork/mock-crawl` | `createMockCrawlResult` for `SRC-ROOTWORK-WEBSITE` |
| GET | `/v1/recommendations/active` | Filter of seed recommendations |
| GET | `/v1/review-queue` | Built queue, statuses hydrated from `tip_review_decisions` |
| GET | `/v1/review-queue/decisions` | List decision rows |
| POST | `/v1/review-queue/decisions` | Record decision; recommendation approve also upserts `tasks` |
| GET | `/v1/ecosystem/status` | Live HTTP health checks of hard-coded public URLs |

Server: `apps/api/src/server.ts`. Binds `config.host` (default `0.0.0.0`) and `PORT` or `TIP_API_PORT` (default 4310). Methods other than GET/POST/OPTIONS get 405 from the gateway. CORS allow-list: `TIP_CORS_ORIGINS`. A request with no `Origin` is allowed (`isOriginAllowed` in `packages/core/src/serverRuntime.ts`). Header `Authorization` is permitted by CORS and never read.

Startup sequence in `apps/api/src/server.ts`:

1. `readTipServerConfig()`
2. `createApiPersistenceRuntime()`
3. `loadRegistry()` reconcile of `registryV1` when a database URL exists
4. `overlayRegistryOnSnapshot(createTipBootstrapSnapshot(), records)` or seed snapshot if reconcile fails
5. `createTipApiGateway(...)`
6. `replayApprovedRecommendationTasks()`

### 1.3 Database files

There is no migration tool. The API applies SQL itself for the live path. Other files are drafts unless someone applied them out of band. This environment has no `DATABASE_URL`, so table presence beyond what the live API reads and writes is **uncertain**.

| File | Tables created or altered | Applied by API startup? |
|---|---|---|
| `database/schema.sql` | `organizations`, `products`, `projects`, `modules`, `agents`, `knowledge_objects`, `graph_nodes`, `graph_edges`, `tasks`, `activity_events` | Partial. Registry SQL in `postgresRegistryAdapter.ts` creates the first three. Task SQL in `postgresTaskAdapter.ts` creates `tasks` if missing. |
| `database/002_content_ingestion.sql` | `ingestion_sources`, `ingestion_runs`, `content_maps`, `content_map_sources`, `content_map_items`, `content_clusters`, `content_gaps` | No |
| `database/003_data_access_and_crawler.sql` | `repository_collections`, `repository_records`, `crawl_requests`, `extracted_content_records`, `crawler_adapter_contracts` | No |
| `database/004_supabase_adapter_and_candidates.sql` | `supabase_adapter_bootstrap_runs`, `content_map_candidate_workflows`, `content_map_candidates` | No |
| `database/005_ai_and_review_workflows.sql` | `ai_generation_requests`, `ai_generation_results`, `recommendation_task_conversions`, `review_queue_items` | No |
| `database/006_api_runtime.sql` | `api_runtime_instances`, `api_routes`, `api_request_logs` | No |
| `database/007_review_queue.sql` | `review_queues`, `review_queue_items`, `review_decisions` | No. Live table is `tip_review_decisions`, not `review_decisions`. |
| `database/008_postgres_review_decision_adapter.sql` | `tip_review_decisions`, `review_decision_adapter_runs`, `review_decision_adapter_events` | `tip_review_decisions` only, via inline SQL in `apps/api/src/persistence.ts` |
| `database/009_launch_readiness_audit.sql` | `launch_readiness_checkpoints`, `launch_readiness_findings`, `launch_readiness_evidence`, `launch_readiness_decisions`, `launch_readiness_decision_state`, `launch_readiness_regressions`, `launch_readiness_top_actions`, `project_readiness_current`, `launch_readiness_tip_outbox` | No API route. `docs/development/PERSISTENCE_MAP.md` says these exist in Neon and are unread. Not re-verified here. |
| `database/010_registry_v1.sql` | Upserts `ORG-TRUAXIOM`, eight products, eight projects | Same rows are upserted from `packages/core/src/registryV1.ts` on startup |
| `database/011_approval_task_bridge.sql` | Alters `tasks` with owner, recommendation, workflow, evidence columns | Same alters are in `approvalTaskSchemaStatements` |

Live collections the API actually uses in Postgres: `organizations`, `products`, `projects`, `tip_review_decisions`, `tasks`.

### 1.4 Mission Control UI

`apps/mission-control/src/App.tsx` plus `apiClient.ts`. Panels:

- Connection orb and metric strip
- Registry v1 products and projects
- Live system map (static stage copy)
- Ecosystem operations (`GET /v1/ecosystem/status`)
- Review queue with Approve / Defer / Reject (`POST /v1/review-queue/decisions`, `decidedBy` not sent by the client, so the API default `founder-local` is used)
- Runtime panel (mode, persistence, registry source, durable task count)
- RootWork content map snapshot
- Recommendations plus approval tasks
- Next-stage list (copy is behind the code: it still says to attach Postgres and to promote approved recommendations)

`packages/core/src/missionControlViewState.ts` is not imported by the UI.

Deploy: `.github/workflows/mission-control-pages.yml` builds `npm run build:mission-control-preview` and deploys GitHub Pages with `VITE_TIP_API_BASE_URL=https://truaxiom-tip-api.onrender.com`. Workflow runs on `main` when app, package, or workflow files change.

### 1.5 Docs, scripts, CI, Render

Docs directories: `docs/architecture`, `docs/adr`, `docs/registry`, `docs/roadmap`, `docs/sprints`, `docs/deployment`, `docs/development`, `docs/integrations`, `docs/visuals`.

Several docs describe an older runtime. Treat code plus the live `/health` body as newer than:

- `README.md` (still "Sprint 001 — Foundation", tree omits `apps/`)
- `docs/registry/TIP_Registry.md` (API Gateway, Ingestion, agents still "Planned")
- `docs/deployment/ENVIRONMENT.md` ("static seed mode")
- `docs/architecture/API-0001_API_Gateway.md` (mode `local-static`, Supabase as the next store)
- `docs/visuals/TIP_CURRENT_BUILD_MAP.md` ("local memory now", "Neon later")
- Mission Control "Next Stage" copy in `App.tsx`

`docs/development/PERSISTENCE_MAP.md` matches the live persistence map and is the best operator doc.

Scripts:

| Script | npm name | What it proves |
|---|---|---|
| `scripts/check-repo-structure.mjs` | `check:structure` | Required paths exist |
| `scripts/check-foundation-contracts.mjs` | `check:contracts` | Four schemas parse and refs resolve |
| `scripts/smoke-api.mjs` | `smoke:api` | GET routes plus one POST defer |
| `scripts/test-api-loop.mjs` | `test:api` | Starts API in local-memory and runs smoke |
| `scripts/test-postgres-adapter.mjs` | `test:postgres-adapter` | Review-decision adapter. Not in CI. |
| `scripts/test-approval-task-bridge.mjs` | `test:approval-tasks` | Approve bridge. Not in CI. |
| `scripts/test-registry-adapter.mjs` | `test:registry` | Registry adapter. Not in CI. |
| `scripts/wait-for-api.mjs` | `wait:api` | Poll until API answers |

CI:

- `.github/workflows/ci.yml` — on push/PR to `main`: install, `check:structure`, `typecheck`. Does not run smoke or Postgres tests.
- `.github/workflows/api-smoke.yml` — local-memory API, `TIP_AI_PROVIDER=manual`, `TIP_ENABLE_LIVE_CRAWLER=false`, `TIP_SOURCE_HEALTH_MODE` forced to `skip` inside `test-api-loop.mjs`.
- `.github/workflows/mission-control-pages.yml` — Pages deploy from `main`.

`render.yaml` service `truaxiom-tip-api`:

- `plan: free`, `branch: main`, `autoDeploy: true`
- `healthCheckPath: /health`
- `startCommand: npm --workspace @truaxiom/api run start` which is `node --import tsx src/server.ts` (TypeScript source, not `dist/`)
- Blueprint env: `TIP_PERSISTENCE_PROVIDER=local-memory`, `TIP_AI_PROVIDER=manual`, `TIP_ENABLE_LIVE_CRAWLER=false`
- Live `/health` persistence is `postgres-review-decision-repository`. Dashboard env is ahead of the blueprint. **Do not reapply `render.yaml` over the live service** or registry source returns to `in-memory-seed`. Documented in `docs/development/PERSISTENCE_MAP.md`.

---

## 2–3. Component register

Status words: **LIVE** (running in the probed Render API), **WIRED** (on the API path, in-memory), **LIBRARY** (exported, not called by API or UI), **DRAFT** (schema or doc only), **STALE DOC**.

Disposition: KEEP, MODIFY, DEPRECATE, or DECISION (owner must choose before code changes).

### TIP Core

| NAME | PURPOSE | STATUS | CLASS | DEPENDENCIES | STORAGE | CALLERS | CALLEES | PRODUCTION-READY? | DISPOSITION | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| Domain types | Shared entity shapes | WIRED | TIP Core | none | none | core, both apps | none | Yes as types | KEEP | `packages/types/src/index.ts` |
| Foundation contracts | Identity, registry entry, agent manifest, workflow definition schemas | DRAFT | TIP Core | none at runtime | JSON files | `check:contracts` only | none | Schema-valid, unused by runtime | KEEP | `packages/contracts/schemas/*.schema.json` |
| Server config | Read env into `TipServerConfig` | LIVE | TIP Core | process env | none | `apps/api/src/server.ts` | none | Yes for host/port/CORS/DB URL. AI and live-crawler flags are unread by behavior | MODIFY | `packages/core/src/serverRuntime.ts` |
| In-memory repository | Snapshot list/upsert | LIVE | TIP Core | types | process memory | gateway | none | Yes as a cache in front of Postgres rows | KEEP | `packages/core/src/dataAccess.ts` |
| Bootstrap snapshot | Assemble seed collections | LIVE | TIP Core | seed, content map | process memory | server, gateway | `createRepositorySnapshot` | Yes as the non-registry cache | MODIFY | `packages/core/src/bootstrapSnapshot.ts` |
| API gateway | Route table and approval side effect | LIVE | TIP Core | repositories, review, tasks, mock crawl, ecosystem | mixed | HTTP server | listed below | Yes for the routes that exist. No auth | KEEP | `packages/core/src/apiGateway.ts` |
| HTTP server | CORS, JSON, listen, startup replay | LIVE | TIP Core | gateway, persistence | none | Render start | gateway | Yes while dashboard env stays Postgres | KEEP | `apps/api/src/server.ts` |
| Seed catalog | Demo org, 6 older products, sprint project, modules, one agent, tasks, recs | LIVE as overlay base | TIP Core | none | process memory | bootstrap | none | Seed projects are not the registry. `PRJ-SPRINT-002` still hangs off seed tasks and recommendations | MODIFY | `packages/core/src/seed.ts` |

Registry v1 replaces snapshot `organizations`, `products`, and `projects` when reconcile succeeds (`overlayRegistryOnSnapshot`). Seed tasks and recommendations keep their own `projectId: "PRJ-SPRINT-002"`. Live snapshot shows that split.

### Registry and durable records

| NAME | PURPOSE | STATUS | CLASS | DEPENDENCIES | STORAGE | CALLERS | CALLEES | PRODUCTION-READY? | DISPOSITION | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| Registry v1 catalog | Canonical org/product/project ids shared with Command Center | LIVE | TIP Core | seed `organization` | code, then Postgres | persistence `loadRegistry` | none | Yes. Live counts 1/8/8, source `postgres` | KEEP | `packages/core/src/registryV1.ts`, `database/010_registry_v1.sql` |
| Postgres registry adapter | Create tables, upsert, read back | LIVE | Service | `pg` query function | `organizations`, `products`, `projects` | `apps/api/src/persistence.ts` | SQL | Yes for reconcile. Failure falls back to seed and logs | KEEP | `packages/core/src/postgresRegistryAdapter.ts` |
| Review decision repository | Port for record/list | LIVE | Service | none | memory or Postgres | gateway | adapter | Yes | KEEP | `packages/core/src/reviewDecisionRepository.ts` |
| Postgres review decision adapter | Upsert by decision id | LIVE | Service | `pg` | `tip_review_decisions` | persistence | SQL | Persistence yes. Identity of the human is not verified | KEEP | `packages/core/src/postgresReviewDecisionAdapter.ts` |
| Approval task repository | Upsert/list tasks | LIVE | Service | `pg` | `tasks` | gateway | SQL | Yes for recommendation-derived rows | KEEP | `packages/core/src/postgresTaskAdapter.ts` |
| API persistence runtime | Choose memory vs Postgres pool | LIVE | Service | `pg`, config | Neon/Postgres when URL set | server | adapters | Live path is Postgres. Blueprint says memory | KEEP code. DECISION on blueprint | `apps/api/src/persistence.ts`, `render.yaml` |

Live registry ids (`GET /v1/registry`):

| Product | Project | Stage on the row |
|---|---|---|
| `PROD-TIP` TIP | `PRJ-TIP` TIP Core | prototype |
| `PROD-COMMAND-CENTER` Command Center | `PRJ-COMMAND-CENTER` | prototype |
| `PROD-ROOTWORK` RootWork | `PRJ-ROOTWORK` | production |
| `PROD-VIBN` V!B^n | `PRJ-VIBN` | production |
| `PROD-PREPPAY` Prep'Pay | `PRJ-PREPPAY` | concept |
| `PROD-KRONIKE` Kronike | `PRJ-KRONIKE` | concept |
| `PROD-FLOWFEED` FlowFeed | `PRJ-FLOWFEED` | concept |
| `PROD-DOTDIZZY` DotDizzy | `PRJ-DOTDIZZY` | production |

Organization id: `ORG-TRUAXIOM`.

Seed file `packages/core/src/seed.ts` still lists a different, smaller product set (TIP, RootWork, StockSense, Boogie Lab, Prompt2Pod, Scrollodex) and project `PRJ-SPRINT-002`. After a successful overlay those seed products are not the registry payload. They remain a drift hazard inside the seed module.

### Workflow pieces that actually run

| NAME | PURPOSE | STATUS | CLASS | DEPENDENCIES | STORAGE | CALLERS | CALLEES | PRODUCTION-READY? | DISPOSITION | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| Review queue builder | Turn crawl candidates, gaps, recommendations, and tasks into review items | LIVE | Workflow | mock crawl, seed recs/tasks | memory; status from `tip_review_decisions` | gateway | none | Yes as a queue. Queue id is fixed: `REVQ-MISSION-CONTROL-SPRINT-002` | KEEP | `packages/core/src/reviewQueue.ts` |
| Recommendation to task | Build `TASK-FROM-{recommendationId}` | LIVE via bridge | Workflow | types | row written by task adapter | `approvalTaskBridge` | none | Conversion sets `workflowStatus: "ready"`. Bridge then overwrites to `in_progress` | KEEP | `packages/core/src/recommendationToTask.ts` |
| Approval task bridge | Map `PROD-*` to `PRJ-*`, refuse `PRJ-SPRINT-002`, attach evidence | LIVE | Workflow | conversion helper | `tasks` | gateway POST and startup replay | task repository | Yes for recommendation items. Live row `TASK-FROM-REC-0002` | KEEP | `packages/core/src/approvalTaskBridge.ts` |
| Startup replay | Re-apply latest approve decisions onto tasks | LIVE | Workflow | bridge, decision list | `tasks` upsert | `server.ts` boot | bridge | Idempotent for task id. Does not delete a task if the latest decision later rejects | MODIFY | `apiGateway.replayApprovedRecommendationTasks` |
| Content map candidates | Propose items and gaps from extracted records | WIRED for mock crawl | Workflow | extracted records | memory | gateway crawl package | none | Candidates are reviewable. Approval does not persist them | MODIFY | `packages/core/src/contentMapCandidates.ts` |
| Candidate workflow object | Bundles candidates, items, gaps, summary | LIBRARY | Workflow | candidates | none | none in API/UI | none | Not on the request path | KEEP as helper or fold into the wired functions | `createContentMapCandidateWorkflow` |
| Ingestion run planner | Queue/complete run objects, map items to knowledge objects | LIBRARY | Workflow | content map types | none | none in API/UI | none | Not on the request path | KEEP unused until a durable ingest write exists | `packages/core/src/ingestionRunner.ts` |
| Task queue helpers | Sort and group tasks | LIBRARY | Service | types | none | not called by gateway (gateway uses snapshot tasks directly) | none | Display helper only | KEEP | `packages/core/src/taskQueue.ts` |

Decision ids are `RDEC-{itemId}-{action}-{Date.now()}` (`reviewQueue.ts`). Each click inserts a new row. Replay keeps the latest row per `itemId` by `decidedAt`. Live list contains two approve rows for `REV-REC-0002`. Task upsert key is `TASK-FROM-REC-0002`, so the second approve updates the same task.

Workflow JSON on that task is a single object, not an executed definition:

- `id`: `WF-TASK-FROM-REC-0002`
- `status`: `started`
- `entryStepId`: `execute-approved-recommendation`
- `owner`: `founder-local`

No step runner reads `workflow-definition.schema.json`.

### Services and product surfaces

| NAME | PURPOSE | STATUS | CLASS | DEPENDENCIES | STORAGE | CALLERS | CALLEES | PRODUCTION-READY? | DISPOSITION | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| Organizational Brain packet | Slice active products, tasks, recs into a context packet | LIVE | Service | snapshot | memory | `GET /v1/context/organization` | `summarizeGraph` | Packet works. It is not a reasoning service | KEEP | `packages/core/src/organizationalBrain.ts` |
| Knowledge graph helpers | Count nodes/edges | WIRED but empty | Service | snapshot arrays | memory; tables in `schema.sql` unread | context route | none | Live graph is 0 nodes / 0 edges | KEEP as stub | `packages/core/src/knowledgeGraph.ts` |
| Recommendation helpers | Filter and sort | LIVE for active route | Service | seed recs | memory | `GET /v1/recommendations/active` | none | Two seed recs only | KEEP | `packages/core/src/recommendations.ts`, `seed.ts` `REC-0001`, `REC-0002` |
| RootWork content map | Static pages, gaps, coverage | LIVE read | Service | none | memory constant | `GET /v1/rootwork/content-map`, bootstrap | none | Safe read model. Not crawled from the site | MODIFY when a durable map exists | `packages/core/src/rootWorkContentMap.ts` |
| RootWork section list | Planned crawl sections | LIBRARY | Service | none | memory | not imported by gateway | none | Planning constant | KEEP | `packages/core/src/rootWorkIngestion.ts` |
| Mock crawler | Fabricate extracted records | LIVE | Service | seed source `SRC-ROOTWORK-WEBSITE` | memory | gateway | none | Correct for a blocked live crawl | KEEP | `packages/core/src/crawlerAdapter.ts` |
| Live crawler adapter | Fetch HTML if `allowLiveFetch` | LIBRARY | Service | `fetch` | none | not constructed by server | network if enabled in code | Flag `TIP_ENABLE_LIVE_CRAWLER` does not construct this adapter | KEEP disabled | `packages/core/src/liveCrawlerAdapter.ts` |
| Ecosystem source health | GET public URLs, 8s timeout | LIVE | External integration | hard-coded URL list | none | `GET /v1/ecosystem/status` | public HTTP | Useful probe. Not a registry | KEEP | `packages/core/src/ecosystemRegistry.ts` |
| Mission Control UI | Operator panels | LIVE (Pages workflow + API client) | TIP Core surface (ops UI, not Core) | Render API | none in the browser | human | API routes in `apiClient.ts` | Yes as a viewer and approval client. No login | KEEP | `apps/mission-control/src/App.tsx`, `apiClient.ts` |
| Mission Control view-state builder | Older view model | LIBRARY | Dev leftover | snapshot | none | no UI import | none | Unused | DECISION | `packages/core/src/missionControlViewState.ts` |

Ecosystem source ids in code: `SRC-TIP-RENDER`, `SRC-TIP-GITHUB`, `SRC-GOOGLE-DRIVE` (`oauth_required`, no fetch), `SRC-ROOTWORK`, `SRC-TRUAXIOM-WEB`, `SRC-VIBN`, `SRC-DOTDIZZY`.

### Experimental, draft, and doc systems

| NAME | PURPOSE | STATUS | CLASS | DEPENDENCIES | STORAGE | CALLERS | CALLEES | PRODUCTION-READY? | DISPOSITION | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| AI provider adapter | Manual offline `generate()` and result-to-recommendation helper | LIBRARY | Experimental | none | none | no API call | none | Not a product model runtime | KEEP as the boundary. Do not add a provider until Dot approves one | `packages/core/src/aiProviderAdapter.ts` |
| Supabase repository adapter | Generic collection upsert via a Supabase-like client | LIBRARY | Experimental | no `@supabase` package in `package.json` | would target many tables | no caller | none | Not the live store. Live store is `pg` | DECISION | `packages/core/src/supabaseRepositoryAdapter.ts` |
| Seed agent `AGT-0001` | Placeholder RootWork Agent | WIRED as seed row | Persistent Agent (declared only) | module ids in the object | memory; `agents` table unread | snapshot, context packet treats `planned` as active-list eligible | none | No | DECISION: leave planned | `packages/core/src/seed.ts` |
| Seed modules `MOD-0001`..`MOD-0003` | Content, project, brand intelligence labels | WIRED as seed | Service names only | none | memory | snapshot | none | Names only. `MOD-0001` is not an executable service | MODIFY when a real service id is registered | `seed.ts` |
| Launch-readiness SQL | Audit tables | DRAFT | Unclear | none in API | possibly Neon, unread | no route | none | No | DECISION | `database/009_launch_readiness_audit.sql` |
| Command Center product row | Marks the executive product as a registry member | LIVE as a row | External product record | none in this repo | `products`, `projects` | registry reconcile | none | The row is real. The product codebase is not in this repo | KEEP the row. Do not build Command Center here | `registryV1.ts` |
| Architecture source of truth | Canonical TIP / MC / Command Center split | STALE DOC relative to code dates (last reconciled 2026-08-26) | TIP Core doc | none | git | humans | none | Still the right boundary language. Capability list is ahead of code | KEEP | `docs/architecture/TIP-ARCHITECTURE-SOURCE-OF-TRUTH-v1.0.md` |
| Agent framework spec | Agent contract and nine role questions | STALE DOC as an implementation claim | Persistent Agent spec | contracts schema mirrors it | git | humans | none | Spec only | KEEP as the bar a future agent must clear | `docs/architecture/TIP-AGENT-FRAMEWORK-SPECIFICATION-v1.0.md` |

`buildOrganizationContextPacket` includes agents whose status is `active` or `planned`. The planned RootWork Agent therefore shows up as an "active agent" in the context packet. That is a labeling bug, not an agent runtime.

---

## 4. Dependency audit (product runtime vs team tools)

Search of `*.ts`, `*.tsx`, `*.mjs`, `*.yml`, `*.json`, `*.sql` found no `grok`, `xai`, `chatgpt`, or `cursor` strings. OpenAI and Anthropic appear only as type-union members and docs.

| Dependency | Where | Class | Notes |
|---|---|---|---|
| Neon / Postgres via `pg` | `apps/api/src/persistence.ts` | INTENTIONAL PRODUCT INFRA | Live persistence. URL order: `NEON_DATABASE_URL`, then `DATABASE_URL`, then `SUPABASE_DB_URL`. |
| `TIP_PERSISTENCE_PROVIDER` `postgres` / `neon` / `supabase` | `serverRuntime.ts` | INTENTIONAL PRODUCT INFRA | All three use the same `pg` pool. `supabase` here means a Postgres URL, not the Supabase JS client. |
| In-memory fallback | persistence + gateway | INTENTIONAL PRODUCT INFRA | Default when no URL. Also the failure fallback for registry reconcile. |
| GitHub Actions, GitHub Pages | `.github/workflows/*` | DEV TOOL ONLY | CI and operator UI hosting. |
| Render web service | `render.yaml`, ecosystem source `SRC-TIP-RENDER` | INTENTIONAL PRODUCT INFRA | Host of the API. Blueprint env is stale. |
| Vite, React, TypeScript, tsx | app packages | DEV TOOL ONLY | UI build and API TS runner. `tsx` is also how production starts. That is a packaging choice, not a model provider. |
| `TIP_AI_PROVIDER` union `manual \| openai \| other` | `serverRuntime.ts` | ACCIDENTAL COUPLING | Logged only. Does not select `manualAiProviderAdapter`. The word `openai` in the union is not a client. |
| `OPENAI_API_KEY` | `.env.example`, `docs/deployment/ENVIRONMENT.md` | ACCIDENTAL COUPLING | Empty placeholder. No reader in TS. |
| `AiProviderAdapter.provider` includes `openai`, `anthropic`, `google` | `aiProviderAdapter.ts` | OPTIONAL ADAPTER | Interface exists. Zero call sites. Safe to keep. Do not implement a vendor until Dot approves a product runtime. |
| `manualAiProviderAdapter` | same file | OPTIONAL ADAPTER | Offline draft string. Not on the request path. |
| Supabase env names and adapter | `.env.example`, `supabaseRepositoryAdapter.ts` | OPTIONAL ADAPTER | Unused. Live path does not need them. |
| `TIP_ENABLE_LIVE_CRAWLER` | env, readiness notes | ACCIDENTAL COUPLING | Server prints the flag. Gateway always calls `createMockCrawlResult`. |
| Ecosystem `fetch` of public sites | `ecosystemRegistry.ts` | INTENTIONAL PRODUCT INFRA | Health only. User-Agent `TruaXiom-TIP-Source-Health/1.0`. |
| Google Drive source row | ecosystem list | OWNER DECISION | Status `authorization_required`. No OAuth client in the repo. |
| `decidedBy` default `founder-local` | `apiGateway.ts`, `reviewQueue.ts` | ACCIDENTAL COUPLING | A string, not an authenticated identity. Live rows also contain other free-text actors. |
| Grok / xAI / ChatGPT / Cursor | absent from product code | DEV TOOL ONLY | Team tools. Not product runtime. No removal required because they are not coupled. |
| Command Center | registry row only | OWNER DECISION | Shares ids. Implementation lives outside this repo. Unverified here. |

Startup, orchestration, memory, task creation, evidence, and approval do not import a model SDK.

---

## 5. Model / provider boundary

There is a clean interface and no hard-coded provider client.

```text
AiProviderAdapter
  id, name, provider union, mode offline|online
  generate(request) -> AiGenerationResult

Implemented adapter: manualAiProviderAdapter (offline)
Not implemented: any HTTP client, SDK, or model name
Not called by: server.ts, apiGateway.ts, review queue, task bridge, replay
```

`TIP_AI_PROVIDER` is stored on config and printed by `describeServerReadiness`. Nothing branches on it to choose an adapter. Render blueprint and CI set it to `manual`.

Guardrail already written in `docs/development/AI_PROVIDER_ADAPTER.md`: model output becomes a result, then a recommendation, then optionally a task, and executes only after approval. The code does not yet create recommendations from model output. Recommendations are the two seed objects.

**Owner decision before any provider work:** whether a product runtime model is allowed at all. Until that decision, leave the manual adapter unwired and do not add keys.

---

## 6. MVP core checklist vs code

| Capability | Mark | What exists |
|---|---|---|
| Project registry | DONE | `ORG-TRUAXIOM`, eight `PROD-*`, eight `PRJ-*`, Postgres reconcile, `GET /v1/registry`. Live source `postgres`. |
| Tasks / lifecycle | PARTIAL | Type has `workflowStatus` backlog through done. Durable write sets `in_progress` and never moves it. Seed tasks stay in memory on `PRJ-SPRINT-002`. No complete/cancel API. |
| Durable storage | PARTIAL | Postgres for registry, review decisions, approval tasks. Everything else is process memory. |
| Orchestration | MISSING | No engine that loads steps, hands off, or runs a workflow definition. One JSON blob is stored on the task. |
| Service registry | MISSING | Identity schema allows `kind: service`. No `services` table is read or written. Modules are seed rows. |
| Workflow definitions | PARTIAL | `workflow-definition.schema.json` is valid and unused. No instance file for RootWork. |
| Execution state | PARTIAL | Task row plus `workflow.status = started`. No run table, no step log, no failure state. |
| Scheduling | NOT MVP for the first slice / MISSING in code | No cron, queue, or scheduler. Ingestion source `crawlFrequency` is the string `manual`. Ecosystem checks run only when the route is called. |
| Permissions | MISSING | No authn, no authz. CORS is an origin list. Agent-manifest permission schema is unused. |
| Tools | MISSING | No tool registry or tool-call log. Mock crawler and HTTP health checks are hard-coded functions. |
| Evidence | PARTIAL | Recommendation evidence strings are copied onto the task plus `/v1/review-queue/decisions#{itemId}`. No evidence table is written by the API. `launch_readiness_evidence` is unused by routes. |
| Retry | MISSING | Retry fields exist on the workflow schema only. No attempt counter. |
| Replay protection | PARTIAL | Startup replay upserts `TASK-FROM-{id}` so the same recommendation does not duplicate tasks. Decision primary keys include `Date.now()`, so decision rows do duplicate. A later reject does not retract the task. |
| Human approval | DONE for the recommendation path | Review queue, POST decision, Mission Control buttons, durable decision rows, task only on recommendation approve. Live: 7 decisions, 1 durable task. |
| Memory | MISSING | No user, project, agent, or run memory store. "In-memory" means process cache. `SYS-0005` is still planned in `docs/registry/TIP_Registry.md`. |
| Knowledge | PARTIAL | Two seed knowledge objects. Content map is a constant. Graph tables are not read. No retrieval API. |
| Audit | PARTIAL | `tip_review_decisions` is an audit of approvals. No general audit log, no API request log despite `database/006_api_runtime.sql`. |

NOT MVP for the first vertical slice: scheduling, a model provider, a persistent agent, Command Center features, launch-readiness UI, Supabase JS client.

OWNER DECISION: whether `TIP_PERSISTENCE_PROVIDER` in `render.yaml` should be updated to match live Postgres (yes, as documentation of intent) without a blueprint apply that wipes dashboard secrets. Whether Google Drive OAuth is in scope. Whether any product model provider is allowed.

---

## 7. RootWork Content Intelligence — service + workflow, not an agent

### What the code already is

RootWork in this repo is:

- a registry product `PROD-ROOTWORK` and project `PRJ-ROOTWORK`
- a static content map service (`rootWorkContentMap`)
- a mock crawl service (`ADAPTER-ROOTWORK-CRAWLER-MOCK`)
- a candidate proposal step (`createContentMapCandidatesFromExtractedRecords`)
- a human review workflow (`REVQ-MISSION-CONTROL-SPRINT-002`)
- one durable outcome when recommendation `REC-0002` is approved: task `TASK-FROM-REC-0002`

`AGT-0001` is a planned seed row. `REC-0002.agentId` points at it. Nothing loads an agent manifest or calls a worker.

### Nine questions (agent spec section 4)

Source: `docs/architecture/TIP-AGENT-FRAMEWORK-SPECIFICATION-v1.0.md` lines 95–111. A persistent agent is justified only when these have answers in a registered manifest. They do not.

| # | Question | Answer in this repo |
|---|---|---|
| 1 | Who is this worker? | Unanswered. Seed name "RootWork Agent" only. |
| 2 | What business outcome is it responsible for? | Unanswered as an agent. The outcome that exists is "map and recommend, founder approves." That is a workflow. |
| 3 | What may it decide independently? | Nothing. No decider besides the HTTP client. |
| 4 | What must it recommend rather than execute? | The seed says `autonomyLevel: "recommend"`, which argues against an autonomous worker. |
| 5 | What sources may it trust? | Only the mock of `https://restoreyour.life` plus the static map. No source policy object. |
| 6 | What systems may it access? | No tool grants. |
| 7 | What actions require approval? | In practice every mutation is a human POST. That gate is on the API, not on an agent policy. |
| 8 | When must it escalate? | No escalation policy is loaded. |
| 9 | How is success measured? | No success metric is stored. |

**Conclusion:** do not create a persistent RootWork Agent in the next build. Register a service and a workflow.

### Proposed shape (design only, not implemented)

```text
SERVICE  SVC-ROOTWORK-CONTENT-INTELLIGENCE
  owns: content map read, mock-or-later crawl, candidate proposal
  does not: publish to restoreyour.life, call a model, run on a timer

WORKFLOW  WF-ROOTWORK-CONTENT-REVIEW
  step crawl.read            actor: crawler adapter (mock today)
  step candidates.propose    actor: contentMapCandidates
  step human.approve         actor: founder via Mission Control
  step record.persist        actor: new durable writer (missing)
  step task.optional         actor: existing approval bridge when the item is a recommendation

AUTOMATION  later, only if Dot wants a schedule
  trigger: manual first
  later: one scheduled read-only crawl of allow-listed host restoreyour.life
  still enters the same workflow at human.approve
  not an agent
```

The workflow should be one JSON document that validates against `packages/contracts/schemas/workflow-definition.schema.json`. The API should store that document's id on the run. It should not invent a second TIP core inside RootWork.

---

## 8. Maps

### 8.1 Architecture map (what runs)

```text
HUMAN
  Mission Control (GitHub Pages)
  apps/mission-control
        |  HTTPS, no login
        v
TIP API  apps/api/src/server.ts
  Render truaxiom-tip-api
        |
        v
GATEWAY  packages/core/src/apiGateway.ts
        |
        +-- registry overlay -------- Postgres organizations, products, projects
        |                              source: registryV1.ts reconcile
        |
        +-- review decisions --------- Postgres tip_review_decisions
        |
        +-- recommendation approve --- Postgres tasks
        |     TASK-FROM-{recId}
        |     project PRJ-* from PROD-*
        |     replay on boot
        |
        +-- snapshot cache ----------- process memory
        |     recommendations, content map, mock crawl,
        |     modules, agents, knowledge, graph, activity,
        |     seed tasks on PRJ-SPRINT-002
        |
        +-- ecosystem status --------- outbound GET public URLs
        |
        +-- NOT called --------------- AiProviderAdapter
                                      live crawler adapter
                                      Supabase JS adapter
                                      workflow schema
                                      agent manifest

COMMAND CENTER
  registry rows only in this repo
  PROD-COMMAND-CENTER / PRJ-COMMAND-CENTER
  no UI and no second core here
```

### 8.2 Dependency map (team tooling vs TIP runtime)

```text
TEAM TOOLING (not product runtime)
  Cursor / Grok / xAI / ChatGPT     absent from repo
  GitHub Actions                    ci.yml, api-smoke.yml, pages.yml
  Vite + React + tsc                Mission Control build
  tsx                               how the API process starts

TIP RUNTIME
  node:http server
  @truaxiom/core
  pg  ->  Neon/Postgres
            organizations
            products
            projects
            tip_review_decisions
            tasks
  fetch -> public health URLs only (ecosystem route)

OPTIONAL, UNWIRED
  AiProviderAdapter / TIP_AI_PROVIDER / OPENAI_API_KEY
  live crawler / TIP_ENABLE_LIVE_CRAWLER
  Supabase client env vars
  JSON Schemas in packages/contracts

OWNER-HELD OUTSIDE THIS REPO
  Command Center application
  Google Drive OAuth
  any future product model provider
```

---

## 9. Gap lists

### Verified built

- Monorepo layout, typecheck CI, structure check, contract check, local-memory API smoke.
- API route table listed in section 1.2, matching live `/health` `availableRoutes`.
- Registry v1 reconcile to Postgres. Live 1 organization, 8 products, 8 projects, `registry.source = postgres`, `registry.error = null`.
- Review decisions in `tip_review_decisions`. Live count 7, source postgres.
- Approve-recommendation to durable task, startup replay. Live durableCount 1: `TASK-FROM-REC-0002` on `PRJ-ROOTWORK`.
- Mission Control panels for registry, review actions, runtime, content snapshot, ecosystem.
- Render health check and Pages workflow wiring.
- Provider-neutral adapter type with the manual adapter not on the hot path.
- Mock crawl stays on the hot path. Live fetch adapter defaults `allowLiveFetch: false`.

### Needs harden (do not redesign)

- Align `render.yaml` `TIP_PERSISTENCE_PROVIDER` with the live Postgres setting without applying the blueprint over dashboard secrets.
- Authenticate `POST /v1/review-queue/decisions`. Today any caller that passes CORS, including a request with no Origin, can write decisions and create tasks.
- Stop using `Date.now()` inside the decision primary key, or define idempotency per queue item.
- On startup replay, if the latest decision for a recommendation is reject or defer, do not leave an earlier `TASK-FROM-*` row as `in_progress` without an explicit rule.
- Keep seed `PRJ-SPRINT-002` tasks out of the operator task list, or mark them `source: seed` in the API payload. Live snapshot mixes 3 seed tasks with 1 durable task (`summary` says 4 tasks).
- Context packet should not list `status: planned` agents as active.
- Run `test:postgres-adapter`, `test:approval-tasks`, and `test:registry` in CI against a disposable Postgres, or document that they are manual.
- Update stale docs listed in section 1.5 so the next reader does not rebuild Postgres attachment or the approve bridge.
- Mission Control "Next Stage" bullets 1 and 3 describe work that is already live.

### Missing MVP (for a governed core, not all required for the next slice)

- Service registry records that the API reads.
- A workflow definition instance and a step runner.
- Execution state beyond one JSON blob.
- Permissions and an authenticated actor.
- Tool registry.
- Durable knowledge / content items.
- Retry policy execution.
- Scoped memory.
- General audit log.
- Scheduler.

### Later

- Live crawl of `restoreyour.life` behind the existing allow-list, still read-only, still through review.
- Scheduled automation of that crawl.
- Model-backed recommendation drafts through `AiProviderAdapter` after an owner decision.
- Reading `modules`, `agents`, `knowledge_objects`, `graph_*`, `activity_events` if those tables are actually populated. Unread today.
- Launch-readiness audit UI.
- Supabase JS adapter. The `pg` path already covers a Supabase Postgres URL.
- Command Center product work (other repo).
- Persistent agents for RootWork, Kronike, Prep'Pay.

### Accidental coupling

- `openai` in the config union and `OPENAI_API_KEY` in the env template, with no client.
- `TIP_AI_PROVIDER` and `TIP_ENABLE_LIVE_CRAWLER` look like runtime switches and do not change behavior.
- `founder-local` and other free-text `decidedBy` values stored as if they were identities.
- Seed catalog products differ from Registry v1 products inside the same process.
- Two review-decision table designs (`review_decisions` in `007`, `tip_review_decisions` in `008`). Only the second is live.
- `render.yaml` memory default vs live Postgres.

### Dot decisions

1. Confirm RootWork Content Intelligence is a service + workflow, and `AGT-0001` stays `planned`.
2. Confirm no product model provider (no Grok, no OpenAI, no other) until a written approval. Team tools stay team tools.
3. Confirm the live persistence provider is the source of truth and the blueprint must be edited to match it before any future Render blueprint apply.
4. Confirm whether unauthenticated review POST is acceptable on a public Render URL until an auth slice exists.
5. Confirm Google Drive remains `authorization_required` and out of the next slice.
6. Confirm Command Center continues to consume these ids from outside this repo.

---

## 10. Ordered next-build queue

Goal: one end-to-end RootWork content slice on top of the bridge that already works. No agent, no model, no scheduler, no Command Center, no rewrite of registry or review storage.

Already done, do not rebuild: registry reconcile, review decision persistence, recommendation approve to `tasks`, startup replay, Mission Control approval buttons.

### TASK-CI-000 — Owner decisions (no code)

- **Purpose:** Lock the five boundaries in section 9 "Dot decisions" items 1–4 before implementation.
- **Depends on:** this report.
- **Acceptance:** a short written answer from Dot for agent-vs-workflow, model provider, Render env, and public POST.
- **Evidence to produce:** a note next to this file or an ADR. Do not change runtime while the note is missing.
- **Blockers:** none in code.
- **Rollback:** n/a.

### TASK-CI-001 — Blueprint truth, docs only

- **Purpose:** Make `render.yaml` state the live persistence mode so a future apply does not silently select `local-memory`.
- **Depends on:** TASK-CI-000 item 3.
- **Acceptance:** `TIP_PERSISTENCE_PROVIDER` in the blueprint matches the intended live value, and the change does not require putting `DATABASE_URL` into git. Dashboard env stays the secret source. A comment in `docs/development/PERSISTENCE_MAP.md` already warns about this; the yaml should stop contradicting it.
- **Evidence:** diff of `render.yaml` only, plus live `/health` still showing `postgres-review-decision-repository` after any deploy.
- **Blockers:** applying the blueprint without the dashboard database URL would drop the live API to memory. Edit the file in git first; deploy only with the existing dashboard URL intact.
- **Rollback:** revert the yaml commit. Do not change dashboard env as part of rollback.

### TASK-CI-002 — Workflow definition instance (contract file)

- **Purpose:** Add one workflow JSON, `WF-ROOTWORK-CONTENT-REVIEW`, valid against `workflow-definition.schema.json`. Steps: read crawl, propose candidates, human approval, persist approved candidate. No runner yet.
- **Depends on:** TASK-CI-000 item 1.
- **Acceptance:** `npm run check:contracts` still passes, and a tiny additional check or test asserts this file validates. API behavior unchanged.
- **Evidence:** the JSON path and the check output.
- **Blockers:** schema requires `actor_identity_id` per step. Use service ids (`SVC-CRAWLER-MOCK`, `SVC-CONTENT-CANDIDATES`, `HUMAN-REVIEW`, `SVC-CONTENT-RECORD`), not `AGT-0001`.
- **Rollback:** delete the file.

### TASK-CI-003 — Durable approved content candidate

- **Purpose:** The missing write. Approving a review item of type `content_map_candidate` upserts one durable row (new table or a clearly named existing table the API creates itself, same pattern as `tasks`). Reject and defer do not insert. Restart replays the latest approve into the same primary key.
- **Depends on:** existing `POST /v1/review-queue/decisions`, `tip_review_decisions`, Postgres pool. TASK-CI-002 for the workflow id to store on the row.
- **Acceptance:**
  - Local or disposable Postgres: approve one candidate, see one row, restart process, still one row.
  - Approve the same item again, still one row.
  - Approve a recommendation, existing `TASK-FROM-*` behavior unchanged.
  - `GET /health` `persistenceMap` reports the new collection as `postgres` when a row exists.
  - Mission Control can show the persisted item after refresh without a new visual system.
- **Evidence:** SQL table name, route response, a script beside `scripts/test-approval-task-bridge.mjs`.
- **Blockers:** public unauthenticated POST (TASK-CI-004) means this write is as exposed as task creation already is. Ship the write with the same exposure, then close auth. Do not block the slice on a new identity system.
- **Rollback:** stop calling the writer from the POST handler; leave `tip_review_decisions` as they are. Dropping the new table is safe if nothing else references it.

### TASK-CI-004 — Actor on the decision

- **Purpose:** Reject review POSTs that do not carry an approved operator secret or session. Store that actor in `decided_by`. Keep the default off the public internet.
- **Depends on:** TASK-CI-003 can land first.
- **Acceptance:** smoke test still passes because CI sets the test secret. A request without the secret receives 401 and writes nothing.
- **Evidence:** `api-smoke.yml` env and a negative test.
- **Blockers:** Dot must choose the first mechanism (shared secret header vs real login). Shared secret is the smaller path.
- **Rollback:** feature flag defaulting to current open behavior only in local-memory. Production should fail closed once enabled.

### TASK-CI-005 — Show seed vs durable in the task list

- **Purpose:** `GET /v1/collections/tasks` and Mission Control distinguish seed `PRJ-SPRINT-002` tasks from Registry tasks.
- **Depends on:** none. Can run parallel to CI-003.
- **Acceptance:** live-shaped payload marks `TASK-0001`..`TASK-0003` as seed and `TASK-FROM-*` as durable. Counts in `/health` stay understandable (`durableCount` already exists).
- **Evidence:** API fixture or smoke assertion.
- **Blockers:** none.
- **Rollback:** remove the extra field.

### Explicitly not in this queue

- Implementing `AGT-0001` or any other persistent agent.
- Calling OpenAI, Anthropic, Google, Grok, or xAI.
- Wiring `TIP_ENABLE_LIVE_CRAWLER` until CI-003 is durable and review still sits in front.
- A scheduler.
- Rewriting the registry, the review table, or Mission Control's layout.
- Building Command Center in this repo.
- Applying `database/002` through `009` as a big-bang schema migration.

---

## Uncertainty

- Neon catalog was not queried. This environment has no database URL. Tables proved by the live API are `organizations`, `products`, `projects`, `tip_review_decisions`, and `tasks`. Other SQL files may or may not have been applied earlier. `PERSISTENCE_MAP.md` claims empty module/agent/graph/activity tables and unused launch-readiness tables. That claim was not re-checked against the database.
- Render dashboard env vars were not opened. Persistence mode is inferred from live `/health` (`postgres-review-decision-repository`, registry source `postgres`) contradicting `render.yaml` (`local-memory`).
- GitHub Pages HTML was not loaded in a browser for this pass. The Pages workflow and the API CORS default origin `https://rc610music.github.io` are in repo and in the live response headers.
- Command Center's actual client of these ids was not inspected. It is not in this repository.
- Granola was unavailable. If a meeting narrowed "service" vs "module" vs "MOD-0001", that constraint is not in this report.
- Live decision `decided_by` values show the API trusts client text. The report names that fact and does not copy decision notes.

---

## Evidence index

| Claim | Path or probe |
|---|---|
| Route list | `packages/core/src/apiGateway.ts` `availableRoutes`; live `/health` |
| Startup replay | `apps/api/src/server.ts`; `replayApprovedRecommendationTasks` |
| Postgres pool and fallback | `apps/api/src/persistence.ts` |
| Registry ids | `packages/core/src/registryV1.ts`; live `GET /v1/registry` |
| Task id rule | `packages/core/src/recommendationToTask.ts` `TASK-FROM-${recommendation.id}` |
| Project id rule | `packages/core/src/approvalTaskBridge.ts` `registryProjectIdForRecommendation` |
| Decision id rule | `packages/core/src/reviewQueue.ts` `RDEC-${itemId}-${action}-${Date.now()}` |
| Mock crawl on the hot path | `apiGateway.ts` `createMockCrawlResult` |
| Live crawler unwired | `liveCrawlerAdapter.ts` has no caller outside its file; flag only in `serverRuntime.ts` |
| AI adapter unwired | `aiProviderAdapter.ts` has no caller outside its file |
| Contracts unwired | `scripts/check-foundation-contracts.mjs` |
| CI gaps | `.github/workflows/ci.yml`, `api-smoke.yml` |
| Blueprint drift | `render.yaml` vs live persistence string |
| Live durable task | snapshot task `TASK-FROM-REC-0002` at probe time |
| Nine questions | `docs/architecture/TIP-AGENT-FRAMEWORK-SPECIFICATION-v1.0.md` section 4 |
| Core vs MC vs Command Center | `docs/architecture/TIP-ARCHITECTURE-SOURCE-OF-TRUTH-v1.0.md` sections 2–3; registry descriptions in `registryV1.ts` |
