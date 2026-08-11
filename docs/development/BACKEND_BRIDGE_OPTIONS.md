# Backend Bridge Options

## Status

Sprint 002 note created while the managed Supabase project is temporarily blocked by billing.

## Decision

TIP should continue development without waiting on hosted Supabase.

The active path is:

1. Local API server.
2. In-memory repository snapshot.
3. Mock crawler and review workflows.
4. Supabase-compatible schema files kept in `database/`.
5. Hosted persistence added later when credentials or another provider are available.

## Primary No-Supabase Path

Use the local API server as the backend seam.

```text
Mission Control → apps/api → packages/core → in-memory snapshot
```

This lets frontend and backend integration continue without live database credentials.

## Backup Hosted Options

### Option A — Supabase later

Best long-term fit because Sprint 002 already includes Supabase-compatible schema, repository adapter stubs, auth direction, and TypeScript type generation plans.

Blocked only by organization invoice status.

### Option B — Neon

Best backup if the priority is staying on Postgres while avoiding the current Supabase billing issue.

Tradeoff: TIP would need separate auth/storage decisions.

### Option C — Turso

Best backup for lightweight edge SQLite persistence.

Tradeoff: less direct compatibility with the existing Postgres/Supabase schema direction.

### Option D — Cloudflare D1

Best backup if TIP moves toward Cloudflare Workers/Pages as a very low-friction deployment stack.

Tradeoff: SQLite model, not Postgres. Some data access logic would need an adapter.

### Option E — Local Supabase CLI

Best development-only bridge if Docker/local machine setup is acceptable.

Tradeoff: useful for local dev and schema testing, not a hosted production backend by itself.

## Current Recommendation

Do not create another paid account just to bypass the invoice yet.

Continue with local API + in-memory persistence now, while keeping schemas compatible with Supabase/Postgres.

If Supabase remains blocked, choose Neon for Postgres compatibility or Cloudflare D1 if deployment simplicity becomes the top priority.

## Next Implementation Steps

1. Mission Control reads runtime status from the local API.
2. API smoke test verifies core endpoints.
3. Replace direct frontend imports one panel at a time with API calls.
4. Keep static fallback mode so the app does not break when the API is offline.
5. Add persistence adapter only after provider decision or Supabase billing resolution.
