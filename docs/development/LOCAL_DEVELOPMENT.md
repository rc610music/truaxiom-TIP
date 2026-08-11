# Local Development

**Project:** TruaXiom Intelligence Platform  
**Sprint:** SPRINT-002 — Core Platform

---

## Current Purpose

This repository now contains the first buildable structure for TIP:

- Mission Control shell
- shared TypeScript types
- core seed data
- Knowledge Graph helpers
- Organizational Brain context packet helpers
- task and recommendation models
- RootWork ingestion planning helpers

---

## Repository Layout

```text
apps/
  mission-control/        # First UI shell

packages/
  types/                  # Shared TypeScript contracts
  core/                   # Seed data and core platform helpers

database/
  schema.sql              # Early PostgreSQL-compatible schema draft

docs/
  architecture/           # System specs
  adr/                    # Architecture decision records
  roadmap/                # Roadmap
  sprints/                # Sprint records
  development/            # Developer setup notes
```

---

## Intended Commands

Install dependencies from the repository root:

```bash
npm install
```

Run Mission Control locally:

```bash
npm run dev
```

Build workspace packages:

```bash
npm run build
```

---

## Current Assumptions

Sprint 002 uses local static data first.

The app does not yet require:

- Supabase
- external API keys
- live RootWork crawling
- Lovable integration
- authentication

Those will be introduced only after the local shell and data model are stable.

---

## Current Limitations

Mission Control currently displays seeded data only.

RootWork ingestion is not live yet. The first ingestion phase is intentionally read-only and planning-based.

Recommendations are structured objects, not AI-generated outputs yet.

---

## Next Development Target

1. Confirm local app boot path.
2. Add task and recommendation UI improvements.
3. Add RootWork content map schema.
4. Add ingestion run model.
5. Add first read-only crawler plan.
