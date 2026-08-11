# TIP Environment Configuration

**Status:** Draft  
**Sprint:** SPRINT-002

---

## Current Mode

TIP currently runs in static seed mode.

No production secrets are required for the current repository skeleton.

---

## Environment Files

Use `.env.example` as the template.

Local developers should copy it to:

```bash
.env.local
```

Real keys should never be committed.

---

## Required Later

### Supabase

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Needed when the Supabase project is created and database persistence is enabled.

### Crawler

```text
TIP_CRAWLER_MODE=mock
TIP_CRAWLER_MAX_DEPTH=2
TIP_CRAWLER_DEFAULT_FREQUENCY=manual
```

Current crawler mode remains `mock` until live crawling is intentionally enabled.

### AI Provider

```text
TIP_AI_PROVIDER=manual
OPENAI_API_KEY=
```

TIP remains provider-agnostic. The provider layer should be introduced through an adapter contract, not directly embedded inside business logic.

---

## Safe Defaults

The repository is safe to run without secrets using:

```bash
npm install
npm run dev
```

The first app will use local seed data and mock crawler fixtures.
