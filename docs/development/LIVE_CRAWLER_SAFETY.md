# Live Crawler Safety

**Status:** Placeholder adapter created  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/liveCrawlerAdapter.ts`

---

## Purpose

The live crawler adapter exists so TIP has a future path from mock extraction to real website ingestion without loosening safety controls.

Live crawling is disabled by default.

---

## Safety Defaults

```ts
allowLiveFetch: false
maxDepth: 1
maxRecords: 25
allowedHosts: ["restoreyour.life"]
```

This prevents accidental broad crawling, paid usage, external requests, or unexpected site traffic.

---

## Current Behavior

If live fetch is not intentionally enabled, the adapter returns a failed crawl result with an explanatory error.

This is expected.

---

## Required Before Live Use

Before enabling live crawling:

1. Confirm allowed host list.
2. Confirm max crawl depth.
3. Confirm max records.
4. Confirm robots/legal/content policy expectations.
5. Confirm deployment environment.
6. Confirm whether crawl is manual, scheduled, or event-triggered.

---

## RootWork Boundary

For now, only `restoreyour.life` is listed as an allowed live host.

Any additional domain must be added intentionally.
