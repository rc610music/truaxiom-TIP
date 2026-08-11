# SPRINT 002 — API Review Queue Addendum

**Sprint ID:** SPRINT-002  
**Status:** Completed after founder approval  
**Created:** 2026-08-11  
**Repository:** rc610music/truaxiom-TIP

---

## Approval Context

Founder approved continuing the local-first/API-backed path while Supabase remains temporarily blocked by organization billing.

The approved path is:

```text
Mission Control → local API → packages/core → in-memory snapshot
```

Supabase remains the preferred persistence layer once billing is cleared.

---

## Completed

### API-backed Mission Control

Mission Control now loads the expanded API bridge through:

```text
apps/mission-control/src/apiClient.ts
```

The client now fetches:

- health,
- snapshot,
- organization context,
- RootWork content map,
- RootWork mock crawl,
- active recommendations,
- review queue.

Mission Control still keeps static fallback behavior so the UI remains usable if the API is offline.

---

### Review Queue

Added a server-side review queue model:

```text
packages/core/src/reviewQueue.ts
```

The queue turns candidate system output into human-reviewable work:

- content map candidates,
- content gap candidates,
- recommendations,
- task candidates,
- extracted records needing mapping decisions.

---

### API Routes

Added:

```text
GET /v1/review-queue
GET /v1/review-queue/decisions
POST /v1/review-queue/decisions
```

`GET /v1/review-queue` returns:

- review queue,
- review queue items,
- review summary.

`GET /v1/review-queue/decisions` returns locally recorded simulated decisions.

`POST /v1/review-queue/decisions` supports local simulated decisions:

- approve,
- reject,
- defer.

The API smoke test now checks review queue read and decision write behavior.

---

### Mission Control UI

Mission Control now includes a Review Queue panel showing:

- total review items,
- items needing review,
- approved count,
- deferred count,
- gap candidates,
- content candidates,
- reviewable item list,
- Approve / Defer / Reject controls.

Decision controls are enabled only when the local API is connected.

This establishes the human approval layer before live crawling or paid AI providers are enabled.

---

### Local Decision Loop

Added the first operational loop:

```text
Mission Control button
  ↓
POST /v1/review-queue/decisions
  ↓
API Gateway
  ↓
reviewQueue.applyReviewDecision()
  ↓
reviewDecisionRepository.recordDecision()
  ↓
updated in-memory queue response
  ↓
Mission Control refresh
```

Current decision persistence is intentionally marked:

```text
mode: local-simulated
persistence: in-memory-review-decision-repository
```

This proves workflow behavior without requiring Supabase.

---

### Review Decision Repository

Added a persistence seam:

```text
packages/core/src/reviewDecisionRepository.ts
```

The repository supports:

- `recordDecision`,
- `listDecisions`,
- `findDecision`.

Current implementation is in-memory. Future implementations can target Supabase, Neon/Postgres, D1, Turso, or another adapter.

---

### Postgres / Neon Bridge Decision

Selected the most reliable and easiest implementation path:

```text
local-memory default → generic Postgres adapter seam → Neon temporary bridge → Supabase later
```

Added:

```text
packages/core/src/postgresReviewDecisionAdapter.ts
database/008_postgres_review_decision_adapter.sql
docs/development/POSTGRES_NEON_BRIDGE.md
```

This keeps TIP aligned with the existing Postgres/Supabase-shaped schema while avoiding a rewrite into SQLite-style persistence.

Neon is the recommended temporary hosted bridge if Supabase billing stays blocked because it uses standard Postgres connection strings and supports serverless connection pooling.

---

### API Persistence Runtime

Added the actual server-side persistence runtime:

```text
apps/api/src/persistence.ts
```

The runtime now selects review-decision persistence at API startup:

```text
TIP_PERSISTENCE_PROVIDER=local-memory | neon | postgres | supabase
```

Runtime behavior:

- `local-memory` stays default and requires no credentials,
- `neon` uses `NEON_DATABASE_URL`,
- `postgres` uses `DATABASE_URL`,
- `supabase` can use `SUPABASE_DB_URL`,
- API health reports active mode and persistence label,
- server shutdown closes the Postgres pool safely.

This means the same approve/reject/defer loop can remain local today and become durable later by adding one connection string.

---

### Persistence Preparation

Added:

```text
database/007_review_queue.sql
database/008_postgres_review_decision_adapter.sql
```

Tables:

- `review_queues`
- `review_queue_items`
- `review_decisions`
- `review_decision_adapter_runs`
- `review_decision_adapter_events`

---

### Deployment / Backend Planning

Added:

```text
docs/deployment/DEPLOYMENT_TARGETS.md
docs/deployment/SUPABASE_BOOTSTRAP_CHECKLIST.md
docs/development/LOCAL_REVIEW_DECISION_LOOP.md
docs/development/REVIEW_DECISION_REPOSITORY.md
docs/development/POSTGRES_NEON_BRIDGE.md
docs/development/API_PERSISTENCE_RUNTIME.md
```

These documents keep the project moving while preserving a clean path back to Supabase.

---

## Current Best Path

Continue with the local API bridge until:

1. the API smoke test passes consistently,
2. Mission Control reads all major panels through API routes,
3. the review queue can approve/reject/defer items locally,
4. the API persistence runtime is tested in local-memory mode,
5. Supabase billing is cleared or Neon is selected as the temporary hosted Postgres bridge.

---

## Not Yet Enabled

- live crawler execution,
- paid AI provider execution,
- production persistence,
- public deployment,
- automatic publishing.
