# Server-Side Setup

## Status

Sprint 002 server-side setup is now repo-ready and local-first.

Supabase project creation is currently blocked by organization billing, so the API runs in `local-static` mode using the bootstrap repository snapshot from `@truaxiom/core`.

## Added Components

```text
apps/api/
packages/core/src/apiGateway.ts
packages/core/src/bootstrapSnapshot.ts
packages/core/src/serverRuntime.ts
database/006_api_runtime.sql
```

## API Workspace

The API workspace is a Node HTTP server with no external web framework dependency.

Default runtime:

```text
http://localhost:4310
```

Default mode:

```text
TIP_API_MODE=local-static
```

## Root Commands

```bash
npm run dev:api
npm run build:api
npm run start:api
npm run ci
```

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Runtime health and repository snapshot summary |
| GET | `/v1/snapshot` | Full local TIP repository snapshot |
| GET | `/v1/collections/:collection` | Read a named repository collection |
| GET | `/v1/context/organization` | Build Organizational Brain context packet |
| GET | `/v1/rootwork/content-map` | Return RootWork content map and priority gaps |
| GET | `/v1/rootwork/mock-crawl` | Return mock crawl result, candidates, and proposed gaps |
| GET | `/v1/recommendations/active` | Return active recommendations |

## Server Runtime Defaults

```text
TIP_API_HOST=0.0.0.0
TIP_API_PORT=4310
TIP_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
TIP_ENABLE_LIVE_CRAWLER=false
TIP_AI_PROVIDER=manual
```

## Design Rules

1. Mission Control should consume an API boundary instead of reaching into future database details.
2. Supabase remains an adapter behind the data access layer.
3. Live crawling remains disabled unless explicitly approved.
4. AI providers remain provider-agnostic and disabled/manual by default.
5. Local-static mode must remain useful without paid services or credentials.

## Supabase Cutover Path

Once Supabase billing is cleared and the TIP project can be created:

1. Create the dedicated `TruaXiom TIP` Supabase project.
2. Apply SQL files in order from `database/`.
3. Generate Supabase TypeScript types.
4. Add Supabase project URL and keys to environment variables.
5. Switch `TIP_API_MODE` from `local-static` to `supabase`.
6. Replace in-memory repository calls with the Supabase repository adapter.

## Current Boundary

This is not production auth or production deployment yet.

It is the server-side foundation that allows Sprint 002 to continue without waiting on Supabase billing.
