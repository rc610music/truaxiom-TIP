# TIP Current Build Map

**Status:** Sprint 002 visual learning aid  
**Purpose:** Show what has been built in a way that is easier to understand before full deployment.

---

## The simple picture

```text
TruaXiom / RootWork data
        ↓
TIP API Gateway
        ↓
Content map + extracted records
        ↓
Review Queue
        ↓
Founder decision: Approve / Defer / Reject
        ↓
Local memory now
        ↓
Neon/Postgres or Supabase later
```

---

## What you can see in Mission Control now

The Mission Control UI has been shifted into a visual-first dashboard:

1. **Connection Orb** — tells whether the local API is connected or whether the UI is in static fallback.
2. **Metric Strip** — shows product, review item, extracted record, recommendation, and decision counts.
3. **Live System Map** — shows the current platform flow from source data to persistence.
4. **Runtime Panel** — shows current API mode and persistence mode.
5. **Review Queue Panel** — shows review items with Approve / Defer / Reject buttons.
6. **RootWork Intelligence Snapshot** — shows mapped RootWork content items and gaps.
7. **Next Stage Panel** — shows what should be built next.

---

## What this means visually

TIP is no longer just a repo full of files.

It now has a visible command-center shape:

```text
Mission Control
  ├── System Map
  ├── Runtime Status
  ├── Review Queue
  ├── RootWork Intelligence
  ├── Recommendations
  └── Next Stage
```

---

## What still needs a live preview

Right now, the visual dashboard exists in the app code.

To see it in a normal browser without a terminal, the next stage is deployment:

```text
GitHub repo → build app → hosted preview URL
```

Best near-term deployment options:

1. **Vercel / Netlify style preview** — easiest for frontend preview.
2. **Cloudflare Pages** — best fit if TruaXiom uses Cloudflare long term.
3. **Codex/Replit/StackBlitz style dev preview** — easiest if you want to test quickly without DNS setup.

---

## Current build truth

The current visual preview is still connected to mostly local/static and mock data.

That is intentional.

The priority right now is to make the platform understandable and testable before activating:

- live crawling,
- paid AI provider calls,
- public publishing,
- durable database writes,
- customer-facing onboarding.
