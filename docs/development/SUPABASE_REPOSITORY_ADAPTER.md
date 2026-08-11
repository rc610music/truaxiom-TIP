# Supabase Repository Adapter

**Status:** Stubbed / Ready for connection  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/supabaseRepositoryAdapter.ts`

---

## Purpose

The Supabase Repository Adapter gives TIP a persistence boundary without coupling Mission Control or intelligence modules directly to Supabase client calls.

Mission Control should ask for platform data through repository contracts. The adapter decides where that data lives.

---

## What Exists Now

The adapter currently defines:

- a Supabase-like client contract,
- a collection-to-table map,
- async `list`, `findById`, and `upsert` methods,
- bootstrap ordering for seed data,
- a snapshot seeding helper,
- readiness checks for required environment keys.

---

## Why This Matters

This allows TIP to run in three phases:

1. **Static seed mode** — current Sprint 002 behavior.
2. **In-memory repository mode** — useful for demos and local tests.
3. **Supabase-backed repository mode** — production persistence.

The app does not need to be rewritten when we move from static data to Supabase.

---

## Environment Variables

Defined in `.env.example`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit real keys.

---

## Bootstrap Flow

```text
Seed Data
  ↓
Repository Snapshot
  ↓
Supabase Adapter
  ↓
Upsert Collections in Dependency Order
  ↓
Mission Control Reads Persisted Data
```

---

## Current Boundary

This is a stub. It is ready for connection once the Supabase project exists, tables are migrated, and keys are supplied.

No founder input is required until actual Supabase credentials are needed.
