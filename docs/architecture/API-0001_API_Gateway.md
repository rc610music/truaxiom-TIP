# API-0001 — TIP API Gateway

## Status

Draft v0.1 — Sprint 002

## Purpose

The TIP API Gateway is the server-side boundary between Mission Control, platform modules, persistence adapters, crawler adapters, AI providers, and future product integrations.

It prevents the frontend from coupling directly to Supabase tables, crawler internals, or AI provider details.

## Initial Runtime Mode

Current mode:

```text
local-static
```

The gateway uses an in-memory repository snapshot until Supabase is available.

## Responsibilities

- expose stable API routes for Mission Control,
- provide health and readiness information,
- return Organizational Brain context packets,
- expose product/content/recommendation collections,
- coordinate RootWork mock crawl and candidate workflows,
- prepare for Supabase-backed persistence,
- keep live crawling and AI provider access behind explicit switches.

## Initial Routes

- `GET /health`
- `GET /v1/snapshot`
- `GET /v1/collections/:collection`
- `GET /v1/context/organization`
- `GET /v1/rootwork/content-map`
- `GET /v1/rootwork/mock-crawl`
- `GET /v1/recommendations/active`

## Adapter Boundaries

```text
Mission Control
  ↓
TIP API Gateway
  ↓
Data Access Layer
  ↓
In-Memory Repository / Supabase Repository Adapter
```

Crawler and AI flows remain separate adapters:

```text
TIP API Gateway
  ↓
Crawler Adapter / AI Provider Adapter
  ↓
Reviewable Candidate Workflow
```

## Safety Rules

- no live crawling unless `TIP_ENABLE_LIVE_CRAWLER=true`,
- no paid AI calls unless provider keys and approvals are supplied,
- no Supabase writes until project and credentials exist,
- no production publishing through this gateway in Sprint 002.

## Sprint 002 Success Criteria

The API Gateway is successful for Sprint 002 when:

- it runs locally,
- it returns seed-backed platform data,
- it exposes RootWork content intelligence surfaces,
- it can be swapped from in-memory storage to Supabase through the repository adapter,
- Mission Control can later consume it without knowing the database implementation.
