# TIP Architecture Reconciliation

**ID:** EVD-TIP-ARCH-RECON-001  
**Status:** Inventory and plan. No runtime change.  
**Checked against:** `main` `eb6da6d` (startup replay ISO fix) which includes `ac706af` (approve → task bridge).  
**Live read (2026-09-22, no writes):** `GET https://truaxiom-tip-api.onrender.com/health`  
**Product architecture intent:** `docs/architecture/TIP-ARCHITECTURE-SOURCE-OF-TRUTH-v1.0.md` (last reconciled 2026-08-26). This file describes the running tree. It does not replace that source of truth.

## How to read the classes

| Class | Meaning in this inventory |
|---|---|
| TIP Core | Shared platform code and the identity/registry/persistence seam every product uses. |
| Service | A callable capability with a request/response or repository contract. No long-lived identity of its own. |
| Workflow | A sequenced path across services, usually started by an operator action or by API boot. |
| Automation | A scripted or hosted runner (CI, Pages deploy, Render auto-deploy). Not a product agent. |
| Persistent Agent | A long-lived role process with its own identity, memory, and authority across sessions. |
| Dev tooling | Checks, tests, and local scripts. Not part of the deployed product behavior. |
| External | A system outside this repository. |
| Experimental | Present in the tree, not on the live request path. |
| Unclear | Named or documented in a way that does not match the running code. |

Command Center is **External**. Its code is not in this repository. Registry ids `PROD-COMMAND-CENTER` and `PRJ-COMMAND-CENTER` are the shared address seam. This run could not read `rc610music/truaxiom` (GitHub returned “could not resolve”), so the external note below uses the task boundary plus the in-repo registry copy, not a directory listing.

---

## 1. Component inventory

### Deploy surfaces (verified)

| Surface | What it is | Evidence |
|---|---|---|
| Render API | `truaxiom-tip-api` on `main`, start `npm --workspace @truaxiom/api run start`, health `/health` | `render.yaml`; live `/health` `status: ok`, `mode: api` |
| GitHub Pages Mission Control | `https://rc610music.github.io/truaxiom-TIP/` built from `apps/mission-control` | `.github/workflows/mission-control-pages.yml` sets `VITE_TIP_API_BASE_URL=https://truaxiom-tip-api.onrender.com` |
| Neon `tip-core` | Intentional Postgres. Live provider label is `postgres-review-decision-repository`. | Live `persistenceMap` below. `docs/development/PERSISTENCE_MAP.md` names project `tip-core`. |

Live `persistenceMap` at the read above:

| Key | Source |
|---|---|
| organizations, products, projects | `postgres` (counts 1 / 8 / 8, `registry.source` `postgres`) |
| reviewDecisions | `postgres`, table `tip_review_decisions`, count 7 |
| tasks | `postgres`, table `tasks`, `durableCount` 1 |
| ecosystemStatus | `live-http-check` |
| modules, agents, knowledgeObjects, recommendations, ingestionSources, contentMaps, graphNodes, graphEdges, activity, rootWorkContentMap, rootWorkMockCrawl | `in-memory-seed` |

`summary` reported 4 tasks while `durableCount` was 1. Seed tasks stay in the in-memory snapshot; the durable approval task is merged on top. That mix is the current design in `docs/development/PERSISTENCE_MAP.md`.

`render.yaml` still sets `TIP_PERSISTENCE_PROVIDER=local-memory`. The live service does not. Reapplying the blueprint over the dashboard environment would drop the API back to memory. Leave `render.yaml` unchanged.

### TIP Core

| Path | Why | Deploy surface |
|---|---|---|
| `packages/types/src/index.ts` | Shared entity contracts (org, product, project, task, recommendation, content map, crawler). | Compiled into API and Mission Control. |
| `packages/contracts/schemas/identity.schema.json`, `registry-entry.schema.json` | Provider-neutral identity and registry contracts. | Not a network service. Validated by `scripts/check-foundation-contracts.mjs`. |
| `packages/core/src/registryV1.ts` | Canonical Registry v1 ids, including the Command Center id pair as data, not as a second core. | Reconciled into Neon `organizations`, `products`, `projects` on API boot. |
| `packages/core/src/postgresRegistryAdapter.ts` | Startup reconcile and row mapping for those three tables. | Neon via `apps/api/src/persistence.ts`. |
| `database/010_registry_v1.sql` | Same id set as SQL. API reconcile is what actually runs. | Neon, when applied. |
| `packages/core/src/seed.ts`, `dataAccess.ts`, `bootstrapSnapshot.ts` | In-memory snapshot for collections that are not yet durable. Registry rows overlay this snapshot. | API process memory. Lost on restart except where Postgres overlays them. |
| `packages/core/src/organizationalBrain.ts` | Builds the organization context packet from the snapshot. | `GET /v1/context/organization`. |
| `packages/core/src/knowledgeGraph.ts` | In-memory graph helpers. | Snapshot only. Neon graph tables are not read. |
| `packages/core/src/serverRuntime.ts` | Process config: host `0.0.0.0`, port, persistence provider, CORS, crawler flag, AI provider label. | Render env. |
| `packages/core/src/apiGateway.ts` | Route table for health, registry, snapshot, collections, context, RootWork reads, recommendations, review queue. | Render API. |
| `apps/api/src/server.ts`, `apps/api/src/persistence.ts` | HTTP server and the only persistence bootstrap. | Render API. Creates `tip_review_decisions` if missing, reconciles Registry v1, ensures task columns, replays approvals. |
| `database/schema.sql` | Draft relational shape for the core tables. | Not applied automatically by the API. The live path uses the adapter SQL in code. |
| `database/008_postgres_review_decision_adapter.sql` | `tip_review_decisions` DDL matching the adapter. | Neon. API also creates the table on first use. |

### Service

| Path | Why | Deploy surface |
|---|---|---|
| `apps/mission-control/` (`App.tsx`, `apiClient.ts`, `index.css`, Vite config) | Operator UI. It calls the API and submits approve / defer / reject. It is not Command Center and it is not a second intelligence core. | GitHub Pages. |
| `packages/core/src/missionControlViewState.ts` | View-model helper for that UI. | Built into the Pages bundle via `@truaxiom/core`. |
| `packages/core/src/reviewQueue.ts`, `reviewDecisionRepository.ts` | Review items and the decision repository contract (in-memory implementation included). | API. Decisions go to Neon when a database URL is set. |
| `packages/core/src/postgresReviewDecisionAdapter.ts` | Postgres implementation. `toIsoTimestamp` normalizes `timestamptz` before replay. | Neon table `tip_review_decisions`. |
| `packages/core/src/postgresTaskAdapter.ts` | Task repository. Table name `tasks`. Refuses seed project id `PRJ-SPRINT-002` on the approval path (see bridge). | Neon `tasks`. |
| `packages/core/src/recommendations.ts`, `taskQueue.ts` | Read/sort helpers over in-memory collections. | API snapshot routes. |
| `packages/core/src/ecosystemRegistry.ts` | On-request HTTP health of public sources. Not a scheduler. | `GET /v1/ecosystem/status`. |
| `packages/core/src/rootWorkContentMap.ts` | Static RootWork content map and gaps. | `GET /v1/rootwork/content-map`. In-memory. |
| `packages/core/src/rootWorkIngestion.ts` | Section catalog and gap text for the RootWork source. | Used by ingestion planning, not a separate service process. |
| `packages/core/src/crawlerAdapter.ts` | Mock crawler over the seed RootWork source. This is what the API calls. | `GET /v1/rootwork/mock-crawl` and review-queue build. |
| `packages/core/src/aiProviderAdapter.ts` | Provider contract plus `manualAiProviderAdapter` only. No SDK call. | Not mounted on an API route. |
| `packages/contracts/schemas/workflow-definition.schema.json`, `agent-manifest.schema.json` | Contracts for future workflow definitions and role manifests. | Schema files only. |

### Workflow

| Path | Why | Deploy surface |
|---|---|---|
| `packages/core/src/recommendationToTask.ts` | `convertRecommendationToTask`. Produces `TASK-FROM-{recommendation id}` at workflow status `ready`. Does not execute. | Called by the approval bridge. |
| `packages/core/src/approvalTaskBridge.ts` | Maps `PROD-*` → `PRJ-*`, attaches owner, evidence, and a started workflow record. | `POST /v1/review-queue/decisions` when action is `approve` and the item is a recommendation. |
| `apps/api/src/server.ts` `replayApprovedRecommendationTasks()` | Boot workflow: latest approve rows become the same durable tasks. | Render process start. |
| `packages/core/src/contentMapCandidates.ts` | Extracted records → candidates → proposed gaps. `mergeCandidatesIntoContentMap` exists and is not called by the gateway. | Candidates are returned inside `GET /v1/rootwork/mock-crawl` and feed the in-memory review queue. |
| `packages/core/src/ingestionRunner.ts` | Plans a queued ingestion run. No scheduler invokes it. | Library only. |
| `packages/core/src/reviewQueue.ts` `applyReviewDecision` | Operator decision step. | API + Mission Control buttons. |

### Automation

| Path | Why | Deploy surface |
|---|---|---|
| `.github/workflows/ci.yml` | Structure check and typecheck on push/PR to `main`. | GitHub Actions. |
| `.github/workflows/api-smoke.yml` | API loop smoke with `TIP_PERSISTENCE_PROVIDER=local-memory` and `TIP_AI_PROVIDER=manual`. | GitHub Actions. Does not touch Neon. |
| `.github/workflows/mission-control-pages.yml` | Builds and deploys the static operator UI on `main`. | GitHub Pages. |
| `render.yaml` `autoDeploy: true` | Platform redeploy of the API from `main`. | Render. Blueprint env is stale relative to the dashboard; see deploy note above. |

There is no cron, queue worker, or in-repo scheduler.

### Persistent Agent

None running.

`packages/core/src/seed.ts` record `AGT-0001` “RootWork Agent” is seed data: `status: "planned"`, `autonomyLevel: "recommend"`. Live `persistenceMap.agents` is `in-memory-seed`. The `agents` SQL table in `database/schema.sql` is not read by the API. The agent manifest schema is a contract, not a process.

### Dev tooling

| Path | Why |
|---|---|
| `scripts/check-repo-structure.mjs`, `scripts/check-foundation-contracts.mjs` | Repo and contract checks. |
| `scripts/smoke-api.mjs`, `scripts/wait-for-api.mjs`, `scripts/test-api-loop.mjs` | Local/CI API smoke. |
| `scripts/test-postgres-adapter.mjs`, `scripts/test-approval-task-bridge.mjs`, `scripts/test-registry-adapter.mjs` | Adapter and replay tests, including the ISO replay assertion. |
| `scripts/README.md` | States scripts must not mutate live data unless that is explicit. |
| Root `package.json` scripts | Workspace orchestration only. |
| `tsx` (`apps/api`) | Runtime loader for `src/server.ts`. Tooling that ships with the API start command, not an intelligence provider. |
| Vite, React, TypeScript (`apps/mission-control`) | UI build. Vite is a dependency of the Pages build, not of API request handling. |

### External

| System | Why it is outside TIP product runtime | Seam |
|---|---|---|
| Neon `tip-core` | Intentional database. Reached through `pg`, not through a model vendor. | `NEON_DATABASE_URL` or `DATABASE_URL` or `SUPABASE_DB_URL`. |
| Render | Intentional API host. | `render.yaml`, service `truaxiom-tip-api`. |
| GitHub Pages | Intentional static host for Mission Control. | `mission-control-pages.yml`. |
| Command Center | Separate executive frontend. Lives in `rc610music/truaxiom` under `command-center/` per the architecture boundary. Not imported by this repo. | Registry ids `PROD-COMMAND-CENTER`, `PRJ-COMMAND-CENTER` only. |
| RootWork / `https://restoreyour.life` | First content source. Live fetch is not on the API path. | Seed source plus ecosystem health URL. |
| Public sites in `ecosystemRegistry.ts` | TruaXiom, V!B^n, DotDizzy, GitHub repo, Render health. Checked on request. | `GET /v1/ecosystem/status`. |
| Google Drive | Listed as `oauth_required`. No OAuth client in this repo. | Ecosystem status note only. |
| `pg` 8.23.0 | Intentional Postgres client. | `apps/api/package.json`. |

### Experimental

| Path | Why |
|---|---|
| `packages/core/src/liveCrawlerAdapter.ts` | Safety-gated fetcher (`allowLiveFetch` default false, host `restoreyour.life`). `createLiveCrawlerAdapter` is never called. `TIP_ENABLE_LIVE_CRAWLER` is only echoed by `describeServerReadiness`. The gateway always uses the mock crawler. |
| `packages/core/src/supabaseRepositoryAdapter.ts` | Alternate repository. Not constructed by `apps/api/src/persistence.ts`. |
| `database/002_content_ingestion.sql` through `database/007_review_queue.sql` | Draft DDL. Not executed on API boot. |
| `database/005_ai_and_review_workflows.sql` | Tables `ai_generation_requests` and `ai_generation_results`. No writer in TypeScript. |
| `database/009_launch_readiness_audit.sql` | `launch_readiness_*` tables. Header mentions Command Center. No API route reads or writes them (`PERSISTENCE_MAP.md`). |
| `data/fixtures/rootwork/mock-crawl-result.json` | Fixture. The running mock crawler builds records in code. |
| `docs/deployment/SUPABASE_BOOTSTRAP_CHECKLIST.md` | Future Supabase path, including a sample that sets a paid AI provider. Not the live path. |

### Unclear (docs that disagree with the running tree)

| Path | What it says | What the code does |
|---|---|---|
| `render.yaml` | `TIP_PERSISTENCE_PROVIDER=local-memory` | Live API reports Postgres. Dashboard env is ahead of the blueprint. Do not “fix” this by reapplying the blueprint. |
| `docs/deployment/ENVIRONMENT.md` | “static seed mode”; “No production secrets are required”; Neon is a future candidate. | Live API is on Render with Postgres review decisions, registry, and tasks. |
| `docs/visuals/TIP_CURRENT_BUILD_MAP.md` | “Local memory now / Neon later”, and a diagram labeled “command-center shape” for Mission Control panels. | Neon is already in use for registry, review decisions, and tasks. Mission Control is the operator UI. Command Center is the external app. |
| `docs/development/POSTGRES_NEON_BRIDGE.md` | Example `TIP_PERSISTENCE_PROVIDER=postgres-neon`. | `readPersistenceProvider` accepts only `postgres`, `neon`, `supabase`, or else `local-memory`. The example value would silently select memory. |
| `README.md` current phase | Still “Sprint 001 — Foundation” before implementation. | Sprint 002 API, Pages, Registry v1, and the approval bridge are on `main`. |
| `docs/adr/ADR-0004_Database_Free_Foundation.md` | Accepted for Sprint 001: no hosted database on the foundation critical path. | Still accurate as a Sprint 001 decision. Sprint 002+ live persistence is Neon. Do not revert ADR-0004 by deleting Neon. |

---

## 2. Dependency audit

Searched the repo (TypeScript, scripts, workflows, docs, `package.json`, `package-lock.json`) for Grok, xAI, OpenAI, ChatGPT, Cursor, Anthropic, and Claude. `package-lock.json` has no `openai`, `@xai`, `grok`, `@anthropic`, or `chatgpt` packages.

| Coupling | Where | Class | Notes |
|---|---|---|---|
| No Grok / xAI / ChatGPT SDK or import | Entire tree | Absent | Development-team tools are not TIP product dependencies. |
| No Cursor SDK, package, or runtime import | Entire tree | Absent | Cursor is outside the product. |
| `provider: "manual" \| "openai" \| "anthropic" \| "google" \| "local" \| "other"` | `packages/core/src/aiProviderAdapter.ts` | Unclear | A type slot. The only constructed adapter is `manualAiProviderAdapter`. Nothing calls a vendor. |
| `aiProvider: "manual" \| "openai" \| "other"` | `packages/core/src/serverRuntime.ts` | Unclear | Read from `TIP_AI_PROVIDER` and printed by `describeServerReadiness`. Not used to choose an HTTP client. Default `manual`. |
| `TIP_AI_PROVIDER=manual` | `render.yaml`, `.github/workflows/api-smoke.yml` | Dev-only tooling for CI; intentional safe default in the blueprint | Live value was not changed. Health payload does not expose the provider field; readiness logs do. |
| `OPENAI_API_KEY=` | `.env.example`, `docs/deployment/ENVIRONMENT.md` | Unclear | Placeholder. No TypeScript or script reads `OPENAI_API_KEY`. |
| OpenAI / Anthropic / Google named as future adapters | `docs/development/AI_PROVIDER_ADAPTER.md` | Unclear | The doc says the engine must not hard-code a provider. Naming them in a future list is not an integration. |
| `pg` / node-pg | `apps/api/package.json`, `apps/api/src/persistence.ts` | Intentional external integration | Postgres client for Neon. |
| Neon / Postgres URL order | `packages/core/src/serverRuntime.ts` | Intentional external integration | `NEON_DATABASE_URL`, then `DATABASE_URL`, then `SUPABASE_DB_URL`. |
| Render, GitHub Actions, GitHub Pages | `render.yaml`, `.github/workflows/*` | Intentional external integration | Hosting and CI. |
| React, Vite, TypeScript, tsx | Workspace `package.json` files | Dev-only tooling | UI build and API TS loader. |
| Supabase env names | `.env.example`, supabase adapter, checklist | Unclear | Allowed by the provider switch, not selected on the live path. Not a model vendor. |

No accidental lock-in to Grok, xAI, OpenAI, ChatGPT, or Cursor was found in the product runtime. The OpenAI name is a dormant label in types, an unused env example, and docs. That is not an approved integration and it is not a called dependency. Leave the manual adapter in place until a provider is explicitly approved.

---

## 3. RootWork Content Intelligence — Services + Workflow

**Recommendation:** implement the next slice as a **Service** (content map + candidate extraction + manual provider) and a **Workflow** (mock or later read-only crawl → candidates → Mission Control review → existing approve → task). Do **not** add a Persistent Agent.

What already exists, and what it is:

| Piece | Class today |
|---|---|
| `MOD-0001` Content Intelligence in `seed.ts` | TIP Core seed, `status: "planned"` |
| `AGT-0001` RootWork Agent in `seed.ts` | Planned role record, not a process |
| Static map `rootWorkContentMap.ts` | Service data |
| Mock crawler + `createContentMapCandidates` | Workflow, in memory, on the review-queue path |
| `mergeCandidatesIntoContentMap` | Unused library function |
| `manualAiProviderAdapter` | Service contract, offline |
| Approve → `convertRecommendationToTask` → `tasks` | Workflow, durable, KEEP |
| Live crawler | Experimental, unwired |

“RootWork Content Agent” appears as an example role in `docs/architecture/TIP-ARCHITECTURE-SOURCE-OF-TRUTH-v1.0.md` section 5. That source of truth also says an agent is a configured role over shared TIP services, not a separate AI system. The seed record matches a planned role at `autonomyLevel: "recommend"`.

### Persistent-agent questions

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Needs long-lived identity/memory across sessions? | No | Review decisions and approval tasks already persist in Neon under TIP Core. The content map and candidates are regenerated from seed/mock data. No agent memory store exists. |
| 2 | Needs autonomous initiation without a human trigger? | No | No scheduler. Live crawler is unwired and default-off. Review buttons are operator actions. Boot replay only restores tasks for decisions a human already approved. |
| 3 | Needs tool use with durable goals beyond a single workflow run? | No | Approval writes one task plus a workflow record (`WF-TASK-FROM-…`, status `started`). Nothing polls that task or calls tools afterward. |
| 4 | Cannot be expressed as a service plus a scheduled or event workflow? | No | The path is already crawler service → candidate workflow → review event → task workflow. |
| 5 | Has a clear ownership boundary separate from Mission Control operators? | No | Approve, defer, and reject are operator actions in Mission Control. The seed agent has no separate authority. |
| 6 | Survives redeploy with its own state store? | No | Durable state is `tip_review_decisions`, `tasks`, and Registry tables in Neon `tip-core`, owned by the API process. There is no agent-owned store. |
| 7 | Required for multi-product coordination beyond Registry ids? | No | Cross-product address is `ORG-TRUAXIOM`, `PROD-*`, `PRJ-*`. Content intelligence is scoped to `PROD-ROOTWORK` / `PRJ-ROOTWORK`. |
| 8 | Has Dot already named it as an agent product capability? | Yes, as a role name | Source of truth example “RootWork Content Agent”; seed `AGT-0001` “RootWork Agent”, status planned. That names a role. It does not name a persistent process, and questions 1–7 do not support one. |
| 9 | Risk of becoming a stand-in for the human development team? | No | The proposed workflow stops at recommendations and approved tasks. It does not edit this repository, deploy, choose providers, or publish RootWork. A persistent autonomous agent would change this answer, so that shape is rejected. |

Default holds: **Services + Workflow**.

Proposed shape for a later build (not this change):

1. **Service:** keep the manual provider. Add no model SDK. Keep the content map as the read model.
2. **Workflow:** operator or explicit API trigger runs mock crawl (live crawl only after a separate approval). Candidates stay proposals. `mergeCandidatesIntoContentMap` runs only after an approve decision. Approved recommendations keep using `convertRecommendationToTask`.
3. **Role record:** leave `AGT-0001` as planned seed. Do not promote it to a process, a second database, or a Mission Control replacement.

Publishing to RootWork stays out of scope (`docs/integrations/ROOTWORK_INGESTION_PLAN.md`).

---

## 4. Ordered next-build queue

Stop lines are Dot-only: secrets, billing, provider approval, production promote, AppDeploy account migration, and any flip of live hosting or the live crawler in production.

| Order | Item | Acceptance criteria | Evidence | Stop? |
|---|---|---|---|---|
| 1 | This reconciliation. Docs only. | PR diff is markdown. `render.yaml` and persistence adapters unchanged. Classes and KEEP list match a live `/health` read. | PR diff; live health quoted above. | No |
| 2 | Stale-doc sweep, still docs only. Correct `ENVIRONMENT.md` current mode, the Mission Control “command-center shape” wording in `TIP_CURRENT_BUILD_MAP.md`, the `postgres-neon` example in `POSTGRES_NEON_BRIDGE.md`, and the README phase line. | A reader can see Neon is live for registry, review decisions, and tasks; Mission Control and Command Center stay separate; accepted provider values are `local-memory`, `postgres`, `neon`, `supabase`. | Doc diff only. No env or SQL change. | No |
| 3 | Characterization tests that lock the current RootWork path: mock crawl feeds candidates; `mergeCandidatesIntoContentMap` is not on the API path; approve still creates `TASK-FROM-{id}` on `PRJ-ROOTWORK`. | Existing approval-bridge and API-loop tests stay green. New assertions fail if merge is wired without an approve step. | `npm run test:approval-tasks` and `npm run test:api` logs. | No |
| 4 | Approved-candidate merge as a workflow step. After a human approve on a content candidate, call `mergeCandidatesIntoContentMap` for that candidate only. Do not auto-merge on crawl. | Reject and defer do not change the content map. A second approve does not duplicate the item. `tip_review_decisions` and `tasks` behavior stays as in KEEP. | Adapter test with an in-memory repository. | No, until the merge writes a new Neon table. A new table needs a reviewed migration and is the next design check, not a silent boot DDL change. |
| 5 | Wire `createLiveCrawlerAdapter` behind the existing flag for an explicit read-only request. Default remains mock. Allowed host remains `restoreyour.life`. No publish, no write to RootWork. | With the flag unset or false, responses match today’s mock package. With the flag true in a test, a fake `fetch` is used and other hosts are refused. | Unit test plus `docs/development/LIVE_CRAWLER_SAFETY.md` updated to match the call site. | **Stop before** setting `TIP_ENABLE_LIVE_CRAWLER=true` on Render. That is a production behavior change. |
| 6 | Real model provider. | Not started. | — | **Stop.** Needs Dot approval of the provider, secret, and billing. Do not add an OpenAI, Anthropic, Google, Grok, or xAI SDK before that. |
| 7 | `launch_readiness_*` API. | Not started. | Schema file only. | **Stop.** Tables are a Command Center beta seam. Dot decides whether TIP or Command Center reads them. Do not merge the products. |
| 8 | Make `render.yaml` match the dashboard (`neon` or `postgres` plus the real URL). | Not started. | Blueprint currently says `local-memory` while live health says Postgres. | **Stop.** Reapplying the blueprint as written would drop persistence to memory. Dashboard env stays authoritative until Dot changes it deliberately. |
| 9 | Supabase cutover, AppDeploy account migration, production publish of RootWork content. | Not started. | Checklists and ingestion plan only. | **Stop.** Billing, account, and publish decisions. |

Items 1–4 are the buildable queue. Item 5 may be coded dark (flag default false) and then stops. Items 6–9 wait.

---

## 5. Preserve list — KEEP

Do not redesign, rename, drop, or replace these.

| Keep | Where it lives | Live check 2026-09-22 |
|---|---|---|
| Neon `tip-core` | Intentional infra. URL via `NEON_DATABASE_URL` / `DATABASE_URL` / `SUPABASE_DB_URL`. | `/health` persistence `postgres-review-decision-repository`. |
| `tip_review_decisions` | `packages/core/src/postgresReviewDecisionAdapter.ts`, `database/008_postgres_review_decision_adapter.sql`, boot DDL in `apps/api/src/persistence.ts`. | `reviewDecisions.table` `tip_review_decisions`, `source` `postgres`, count 7. |
| `tasks` approval rows | `packages/core/src/postgresTaskAdapter.ts`, `database/011_approval_task_bridge.sql`. | `tasks.table` `tasks`, `source` `postgres`, `durableCount` 1. |
| Registry v1 | `packages/core/src/registryV1.ts`, `database/010_registry_v1.sql`. Ids `ORG-TRUAXIOM`, `PROD-*`, `PRJ-*`. | `registry.version` `v1`, `source` `postgres`, 8 products, 8 projects, including `PROD-COMMAND-CENTER` / `PRJ-COMMAND-CENTER` as ids only. |
| `convertRecommendationToTask` | `packages/core/src/recommendationToTask.ts`, invoked from `approvalTaskBridge.ts` on approve. | Route `POST /v1/review-queue/decisions`. Not re-tested with a write in this audit. |
| Startup replay ISO fix | `toIsoTimestamp` in `postgresReviewDecisionAdapter.ts`; `replayApprovedRecommendationTasks` from `apps/api/src/server.ts`; test in `scripts/test-approval-task-bridge.mjs` (“Boot replay must store the approval instant as ISO”). | Present at `eb6da6d`. Boot replay is idempotent upsert of `TASK-FROM-{recommendation id}`, not a second insert. |

Also leave in place: Mission Control as the operator UI, the manual AI provider default, live crawler default off, and Command Center as an external consumer of the Registry ids.
