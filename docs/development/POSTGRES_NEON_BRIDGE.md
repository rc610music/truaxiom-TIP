# Postgres / Neon Bridge

**Status:** Sprint 002 bridge plan  
**Created:** 2026-08-11  
**Purpose:** Keep TIP moving while Supabase project creation is temporarily blocked.

---

## Decision

Use a **Postgres-first persistence seam** with Neon as the recommended temporary hosted bridge.

Supabase remains the preferred long-term managed backend once the TruaXiom organization billing issue is cleared.

---

## Why this path

TIP already has Supabase/Postgres-shaped SQL schemas.

Neon is a better temporary bridge than SQLite-style options because it keeps the same core database model:

```text
TIP API
  ↓
Review Decision Repository Contract
  ↓
Postgres Adapter
  ↓
Neon now / Supabase Postgres later
```

This avoids rewriting review workflows for Cloudflare D1, Turso, or another SQLite/libSQL model.

---

## Environment Variables

```bash
TIP_PERSISTENCE_PROVIDER=postgres-neon
DATABASE_URL=postgresql://...
NEON_DATABASE_URL=postgresql://...
POSTGRES_SSL_MODE=require
```

Use `NEON_DATABASE_URL` when available. `DATABASE_URL` remains the generic fallback so the same adapter can support other Postgres providers later.

---

## Current Implementation

Added:

```text
packages/core/src/postgresReviewDecisionAdapter.ts
```

The adapter provides:

- SQL for inserting review decisions,
- SQL for listing decisions,
- SQL for finding one decision,
- row mapping into TIP's review decision model,
- a provider-neutral repository implementation.

It is intentionally inactive until a runtime query executor is supplied.

---

## Why inactive by default

No external DB driver has been added yet.

This keeps Sprint 002 easy to run locally without forcing a hosted database connection or breaking CI.

The next implementation step is to add a thin query executor for whichever runtime we select:

- Neon serverless driver,
- node-postgres `pg`,
- Supabase JS/PostgREST pathway,
- or deployment-platform-native Postgres connector.

---

## Recommended near-term path

1. Keep local-memory mode as the default.
2. Add Neon/Postgres as the first durable decision adapter.
3. Use the same `review_decisions` table shape already drafted in SQL.
4. Preserve the repository contract so Supabase can replace Neon later without changing Mission Control.

---

## Do not do yet

- Do not rewrite the platform for SQLite unless Postgres becomes unavailable.
- Do not enable live crawler writes.
- Do not enable paid AI writes.
- Do not require a hosted DB for local development.
