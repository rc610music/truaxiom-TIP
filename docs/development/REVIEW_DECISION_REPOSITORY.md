# Review Decision Repository

**Status:** Sprint 002 backend seam  
**Created:** 2026-08-11  
**Current implementation:** in-memory  
**Future implementation:** Supabase, Neon, Cloudflare D1, or another persistence adapter

---

## Purpose

The Review Decision Repository separates workflow behavior from persistence.

Mission Control can approve, reject, or defer review queue items today, while the actual storage layer can be swapped later.

This prevents the frontend from caring whether decisions are stored in:

- local memory,
- Supabase,
- Neon/Postgres,
- Cloudflare D1,
- Turso/libSQL,
- or another adapter.

---

## Current Path

```text
Mission Control
  ↓
POST /v1/review-queue/decisions
  ↓
API Gateway
  ↓
reviewQueue.applyReviewDecision()
  ↓
reviewDecisionRepository.recordDecision()
  ↓
in-memory decision list
```

---

## Contract

```ts
interface ReviewDecisionRepository {
  recordDecision(decision: ReviewDecision): Promise<ReviewDecision>;
  listDecisions(queueId?: string): Promise<ReviewDecision[]>;
  findDecision(id: string): Promise<ReviewDecision | undefined>;
}
```

---

## Why This Matters

The review queue is TIP's first real human-in-the-loop control surface.

Before enabling live crawling, paid AI providers, automated publishing, or persistent mutations, TIP needs a safe decision boundary.

The repository seam makes that boundary portable.

---

## Current API Routes

```text
GET /v1/review-queue
GET /v1/review-queue/decisions
POST /v1/review-queue/decisions
```

---

## Persistence Notes

Current responses intentionally say:

```text
mode: local-simulated
persistence: in-memory-review-decision-repository
```

That means:

- decisions are valid for the current local API runtime,
- decisions reset when the server restarts,
- no production database has been mutated,
- the workflow is ready to receive a durable adapter.

---

## Next Adapter Target

When Supabase billing is cleared, implement a Supabase-backed version that writes to:

- `review_decisions`
- optionally updates `review_queue_items.status`

If Supabase remains blocked, implement a Neon/Postgres adapter first because it keeps the existing SQL shape closest to the current database drafts.
