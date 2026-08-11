# TIP API

Server-side API layer for the TruaXiom Intelligence Platform.

## Current mode

The API runs in `local-static` mode by default. It uses the in-memory repository snapshot seeded from `@truaxiom/core` while the dedicated Supabase project is blocked by billing.

## Commands

From the repository root:

```bash
npm run dev:api
```

Or from this workspace:

```bash
npm run build --workspace @truaxiom/api
npm run start --workspace @truaxiom/api
```

## Default URL

```text
http://localhost:4310
```

## Routes

- `GET /health`
- `GET /v1/snapshot`
- `GET /v1/collections/:collection`
- `GET /v1/context/organization`
- `GET /v1/rootwork/content-map`
- `GET /v1/rootwork/mock-crawl`
- `GET /v1/recommendations/active`

## Boundaries

- No live crawling by default.
- No paid AI provider calls by default.
- No Supabase writes until credentials and project access are available.
- This API is a local execution layer, not a production deployment yet.
