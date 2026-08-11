# DATA ACCESS LAYER — Sprint 002

**Status:** Stubbed / Ready for Persistence Adapter  
**Sprint:** SPRINT-002  
**Package:** `packages/core/src/dataAccess.ts`

---

## Purpose

The data access layer gives TIP one stable interface for reading and writing organizational records.

This prevents Mission Control, agents, modules, and future services from reaching directly into storage implementation details.

The first implementation is intentionally in-memory.

Later implementations can target:

- Supabase/PostgreSQL,
- local JSON fixtures,
- cloud object storage,
- Google Drive exports,
- or TIP's own internal storage engine.

---

## Current Boundary

The Sprint 002 layer supports:

- snapshot access,
- collection listing,
- record lookup by ID,
- record upsert,
- typed repository snapshots.

It does **not** yet support:

- authentication,
- row-level security,
- migrations,
- remote persistence,
- real-time sync,
- concurrent writes,
- audit history beyond schema placeholders.

---

## Repository Collections

Current collection names:

- `organizations`
- `products`
- `projects`
- `modules`
- `agents`
- `knowledgeObjects`
- `tasks`
- `recommendations`
- `ingestionSources`
- `contentMaps`
- `graphNodes`
- `graphEdges`
- `activity`

---

## Sprint 002 Role

The role of this layer is not to be the final database.

The role is to give the platform a contract.

Once the contract exists, Mission Control and intelligence modules can be built against the contract while the storage backend evolves underneath it.

---

## Next Step

Create a Supabase-backed implementation that satisfies the same `TipDataRepository` interface.
