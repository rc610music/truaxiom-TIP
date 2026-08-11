# Deployment Target Notes

**Project:** TruaXiom Intelligence Platform  
**Sprint:** SPRINT-002  
**Status:** Planning notes / no deployment selected yet

---

## Current Runtime Shape

TIP currently has two runnable surfaces:

```text
apps/mission-control/   frontend UI
apps/api/               local Node API
```

The local-first path is:

```text
Mission Control → TIP API → packages/core → in-memory snapshot
```

Supabase can later replace or back the in-memory repository without changing the frontend contract.

---

## Preferred Path After Supabase Is Unblocked

1. Keep frontend and API split.
2. Connect API to Supabase through the repository adapter.
3. Deploy Mission Control as a static app.
4. Deploy API as a serverless or long-running API depending on the host.
5. Keep crawler and AI execution behind server-side authorization.

---

## Candidate Deployment Targets

### Cloudflare Pages + Workers

Best fit when low-cost, edge-first hosting is the priority.

Pros:

- strong static hosting story,
- Workers can host API routes,
- Cloudflare D1/R2/Queues can support future edge services,
- good fit for TruaXiom's low-cost infrastructure preference.

Considerations:

- API may need a Workers-compatible runtime later,
- D1 is SQLite-style, not Postgres,
- long-running crawling needs careful queue/job design.

### Vercel

Best fit when React/Vite frontend deployment and serverless API convenience matter most.

Pros:

- easy frontend deployment,
- serverless API route model,
- straightforward preview deployments.

Considerations:

- serverless timeouts can affect crawlers,
- persistent jobs should live elsewhere,
- costs can grow with usage.

### Render / Railway / Fly.io

Best fit when a traditional Node API server should stay running.

Pros:

- closer to current `apps/api` Node server,
- less runtime conversion required,
- easier for crawler worker prototypes.

Considerations:

- recurring hosting cost,
- separate static frontend deployment may still be needed.

### Local-first until validated

Best fit right now.

Pros:

- no additional account needed,
- no billing blocker,
- keeps Sprint 002 moving,
- lets the architecture harden before deployment decisions.

Considerations:

- not public-facing,
- no persistent production database,
- not useful for external demos unless hosted later.

---

## Current Recommendation

For the next build window, stay local-first and API-backed.

When ready to deploy:

1. Use Cloudflare Pages for Mission Control if low recurring cost remains the top priority.
2. Use a Worker/API adapter or Render-style Node host for the API depending on how quickly we need deployment.
3. Keep Supabase as the preferred persistent database once billing is cleared.

---

## Not Yet Approved

- production deployment,
- live crawler execution,
- AI provider execution,
- public user onboarding,
- publishing automation.
