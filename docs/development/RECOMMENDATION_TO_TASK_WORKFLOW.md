# Recommendation-to-Task Workflow

**Status:** Contract created  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/recommendationToTask.ts`

---

## Purpose

TIP recommendations must become actionable work without skipping human authority.

This workflow converts accepted or new recommendations into reviewable task candidates.

---

## Flow

```text
Recommendation
  ↓
Conversion Helper
  ↓
Task Candidate
  ↓
Review Queue
  ↓
Execution / Implementation
  ↓
Activity + Knowledge Graph Update
```

---

## Current Capabilities

The implementation can:

- convert one recommendation into a task candidate,
- convert multiple eligible recommendations,
- preserve product and project linkage,
- preserve priority,
- attach acceptance criteria,
- attach the originating recommendation ID,
- summarize conversion results.

---

## Guardrail

`convertRecommendationToTask` still returns `ready` workflow status and does not execute anything by itself.

## Approve bridge

`POST /v1/review-queue/decisions` with `action: "approve"` on a recommendation item calls `convertRecommendationToTask`, then stores the task.

The stored task:

- uses the Registry project id for the recommendation product (`PROD-TIP` → `PRJ-TIP`, `PROD-ROOTWORK` → `PRJ-ROOTWORK`),
- assigns `assignedTo` from the decision's `decidedBy`,
- sets `workflowStatus` to `in_progress` and stores a `workflow` object with status `started`,
- copies recommendation evidence plus a review-decision link.

Postgres writes that row to `tasks`. `GET /v1/collections/tasks` and `GET /v1/snapshot` include it. `GET /health` reports `persistenceMap.tasks` as `postgres` once at least one durable row exists. Reject and defer do not create a task. The `tip_review_decisions` insert is unchanged.

API startup replays the latest `tip_review_decisions` row per review item. An `approve` on a recommendation item uses the same conversion and is upserted as `TASK-FROM-{recommendation id}` on the Registry project (`PROD-ROOTWORK` → `PRJ-ROOTWORK`). A later boot finds that id and updates the same row. Postgres `timestamptz` values are read back as ISO timestamps before that insert.

---

## Why This Matters

This is the first bridge from intelligence to operations.

TIP can now move from “what should happen” to “what work item should be created,” while keeping final execution under control.
