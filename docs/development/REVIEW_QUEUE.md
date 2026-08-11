# Review Queue

**System area:** Mission Control / Human Approval Layer  
**Sprint:** SPRINT-002  
**Status:** Local-first implementation added

---

## Purpose

The Review Queue is the safety and approval layer between TIP intelligence and actual platform changes.

TIP may discover content, generate recommendations, propose gaps, or convert recommendations into task candidates. None of those should automatically become durable system changes without review.

The Review Queue turns machine-generated or system-generated suggestions into human-reviewable items.

---

## Current Inputs

The current Sprint 002 queue can include:

- content map candidates from extracted RootWork records,
- proposed content gaps,
- active recommendations,
- task candidates,
- extracted content records that need mapping decisions.

---

## Current API Route

```text
GET /v1/review-queue
```

The route returns:

- `queue`
- `queue.items`
- `queue.summary`
- `summary` as human-readable status notes

---

## Current Statuses

Review items use:

- `needs_review`
- `approved`
- `rejected`
- `deferred`
- `implemented`

---

## Current Review Item Types

- `content_map_candidate`
- `content_gap_candidate`
- `recommendation`
- `task_candidate`

---

## Operating Rule

TIP may propose.

Mission Control may display.

The founder/user approves, rejects, defers, or edits.

Only approved items should later become durable knowledge, official tasks, publishing actions, or content map changes.

---

## Persistence

Persistence is prepared in:

```text
database/007_review_queue.sql
```

Tables:

- `review_queues`
- `review_queue_items`
- `review_decisions`

---

## Next Implementation Step

When the local API is fully verified, Mission Control should add controls for:

- approve,
- reject,
- defer,
- convert to task,
- mark implemented.

Until persistence is connected, those actions should remain read-only or mocked.
