# CRAWLER ADAPTER CONTRACT — Sprint 002

**Status:** Mock Contract / No Live Fetch Yet  
**Sprint:** SPRINT-002  
**Package:** `packages/core/src/crawlerAdapter.ts`

---

## Purpose

The crawler adapter contract defines how TIP will request, receive, normalize, and store content extracted from connected sources.

The adapter is deliberately separated from the Intelligence Engine.

The crawler's job is not to think.

The crawler's job is to retrieve and normalize evidence.

TIP's Knowledge Graph and Organizational Brain decide what that evidence means.

---

## Current Adapter

Current adapter ID:

`ADAPTER-ROOTWORK-CRAWLER-MOCK`

Current behavior:

- creates a crawl request from an ingestion source,
- generates mock extracted RootWork records,
- returns a normalized crawl result,
- provides summary counts,
- does not hit the live website.

---

## Crawl Request Shape

A crawl request contains:

- request ID,
- source ID,
- product ID,
- root URL,
- include paths,
- exclude paths,
- max depth,
- requested timestamp.

---

## Extracted Content Record Shape

Each extracted content record contains:

- source ID,
- product ID,
- URL,
- title,
- format,
- excerpt or raw text,
- detected content type,
- detected intent,
- detected topics,
- HTTP status,
- canonical URL,
- discovery timestamp,
- adapter metadata.

---

## Governance Rules

1. Crawlers produce evidence, not final truth.
2. Extracted records must include provenance.
3. Extracted records do not become approved knowledge automatically.
4. Mapping into the Knowledge Graph requires classification and confidence.
5. Publishing actions require founder-approved automation rules.

---

## Sprint 002 Boundary

Sprint 002 uses a mock adapter so the rest of the platform can be built without waiting on live crawling.

Live crawling belongs in the next implementation phase.

---

## Next Step

Implement a real website crawler adapter that satisfies the same contract, then run it against `restoreyour.life` in read-only mode.
