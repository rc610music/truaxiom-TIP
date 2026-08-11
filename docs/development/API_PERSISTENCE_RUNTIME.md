# API Persistence Runtime

**Status:** Sprint 002 implementation  
**Scope:** Server-side runtime persistence selection  
**Default:** local memory  

---

## Purpose

The API persistence runtime lets TIP continue working without hosted Supabase while still preparing for real durable storage.

The runtime chooses the review decision repository at API startup.

```text
Mission Control
  ↓
TIP API
  ↓
Review Decision Repository
  ↓
local memory OR Postgres-compatible database
```

---

## Current Modes

### 1. Local Memory

Default mode.

```env
TIP_PERSISTENCE_PROVIDER=local-memory
```

Behavior:

- no credentials required,
- decisions reset when the API restarts,
- safe for local development,
- safest path while billing or backend selection is unresolved.

---

### 2. Neon

Temporary hosted Postgres bridge.

```env
TIP_PERSISTENCE_PROVIDER=neon
NEON_DATABASE_URL=postgresql://...
POSTGRES_SSL_MODE=require
```

Behavior:

- persists review decisions,
- uses Postgres SQL,
- aligns with the current Supabase-shaped schema,
- minimizes future migration work.

---

### 3. Supabase

Preferred long-term project backend once billing is cleared.

```env
TIP_PERSISTENCE_PROVIDER=supabase
SUPABASE_DB_URL=postgresql://...
POSTGRES_SSL_MODE=require
```

Behavior:

- persists review decisions through the same Postgres adapter seam,
- lets the public Supabase API/Auth/Storage layer come later,
- avoids changing Mission Control workflow logic.

---

### 4. Generic Postgres

Any Postgres-compatible provider.

```env
TIP_PERSISTENCE_PROVIDER=postgres
DATABASE_URL=postgresql://...
POSTGRES_SSL_MODE=auto
```

---

## Runtime Files

```text
apps/api/src/persistence.ts
packages/core/src/postgresReviewDecisionAdapter.ts
packages/core/src/reviewDecisionRepository.ts
packages/core/src/serverRuntime.ts
```

---

## Environment Fields

```env
TIP_PERSISTENCE_PROVIDER=local-memory
DATABASE_URL=
NEON_DATABASE_URL=
SUPABASE_DB_URL=
POSTGRES_SSL_MODE=auto
```

Priority order for database URL resolution:

1. `NEON_DATABASE_URL`
2. `DATABASE_URL`
3. `SUPABASE_DB_URL`

---

## Safety Boundary

The runtime only controls review-decision persistence.

It does not enable:

- live crawling,
- paid AI calls,
- automatic publishing,
- production deployment,
- public user auth.

---

## Definition of Done

The persistence runtime is considered Sprint 002 ready when:

- local-memory mode starts without credentials,
- Postgres mode can be activated by environment variables,
- review decision writes use the repository contract,
- API health reports active persistence mode,
- smoke tests still pass in local-memory mode.
