# Local Review Decision Loop

**Status:** Sprint 002 local-first workflow  
**Created:** 2026-08-11  
**Persistence:** In-memory only until Supabase or another backend is connected

---

## Purpose

The Review Queue is the first operational workflow loop inside TIP Mission Control.

It exists so candidate intelligence does not automatically mutate the system.

Instead, TIP produces reviewable items and the founder can decide whether to approve, reject, or defer them.

---

## Runtime Path

```text
Mission Control
  ↓
POST /v1/review-queue/decisions
  ↓
TIP API Gateway
  ↓
packages/core/reviewQueue
  ↓
in-memory review queue state
```

---

## Current Actions

### Approve

Marks the item as `approved`.

Use this when the item should continue toward implementation, persistence, content map merge, or task conversion.

### Reject

Marks the item as `rejected`.

Use this when the candidate should not move forward.

### Defer

Marks the item as `deferred`.

Use this when the item may be useful later but should not block current work.

---

## API Contract

```http
POST /v1/review-queue/decisions
Content-Type: application/json
```

```json
{
  "itemId": "REV-CAND-ROOTWORK-HOME",
  "action": "approve",
  "decidedBy": "founder-local",
  "note": "Approved from Mission Control local mode."
}
```

Supported `action` values:

- `approve`
- `reject`
- `defer`

---

## Response Shape

```json
{
  "decision": {},
  "item": {},
  "queue": {},
  "summary": [],
  "mode": "local-simulated",
  "persistence": "in-memory-only"
}
```

---

## Mission Control Behavior

Mission Control now shows action buttons on review queue items when the local API is connected:

- Approve
- Defer
- Reject

If the API is offline, Mission Control keeps static fallback mode and disables decision actions.

---

## Boundary

This is not production persistence yet.

Current decisions prove the workflow and update the local in-memory queue only.

When Supabase or another persistence adapter is available, this same workflow should write to:

- `review_decisions`
- `review_queue_items`
- affected downstream tables depending on the decision type

---

## Next Step

Add a durable decision repository interface so this exact workflow can swap from in-memory mode to Supabase/Neon/D1 persistence without changing Mission Control.
