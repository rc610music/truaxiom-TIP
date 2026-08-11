# ROOTWORK_CONTENT_MAP_SCHEMA

**Status:** Draft v0.1  
**Sprint:** SPRINT-002  
**System:** SYS-0002 Knowledge Graph / MOD-0001 Content Intelligence  
**Product:** RootWork

---

## Purpose

The RootWork Content Map turns the RootWork website and content ecosystem into structured intelligence.

The goal is not only to list pages.

The goal is to let TIP understand:

- what content exists,
- what each item is for,
- which audience it serves,
- where it sits in the user journey,
- what topics are covered,
- what content is missing,
- what needs review,
- and what should become the next task or recommendation.

---

## Core Objects

### ContentMap

A snapshot of the content ecosystem for one product.

Tracks:

- source IDs,
- generated date,
- content items,
- clusters,
- gaps,
- summary metrics.

### ContentMapItem

A single mapped asset.

Examples:

- homepage,
- article,
- practice,
- resource,
- quiz,
- offer page,
- podcast episode,
- video,
- email,
- social asset.

Required intelligence fields:

- type,
- section,
- intent,
- lifecycle status,
- primary topic,
- secondary topics,
- audience,
- funnel stage,
- confidence,
- freshness,
- source provenance.

### ContentCluster

A strategic grouping of related content.

Examples:

- RootWork Foundation,
- Wisdom Library,
- Practice Engine,
- Premium Conversion Path,
- Root Types Onboarding.

Clusters help TIP understand topic coverage and strategic role.

### ContentGap

An identified weakness or missing piece.

Gap types include:

- missing topic,
- thin content,
- stale content,
- broken path,
- weak conversion,
- SEO opportunity,
- brand alignment.

Every content gap should be convertible into a recommendation or task.

---

## Initial RootWork Map

The first static map includes:

1. RootWork Home
2. Wisdom / Blog Library
3. RootWork Practices
4. RootWork Resources
5. Root Types System
6. RootWork Premium

Initial gaps:

1. Crawler-backed article inventory missing
2. Practice taxonomy not structured yet
3. Premium conversion path needs mapping

---

## Ingestion Loop

```text
Source configuration
  ↓
URL discovery
  ↓
Section classification
  ↓
Metadata extraction
  ↓
Content item mapping
  ↓
Knowledge object creation
  ↓
Cluster analysis
  ↓
Gap detection
  ↓
Recommendation/task generation
  ↓
Mission Control review
```

---

## Sprint 002 Boundary

Sprint 002 does not require live crawling yet.

Sprint 002 requires:

- the schema,
- static RootWork map,
- ingestion run planner,
- database tables,
- Mission Control display,
- and a path to the first real crawler.

---

## Next Implementation Step

Build the crawler adapter contract:

```ts
interface WebsiteCrawlerAdapter {
  discover(source: IngestionSource): Promise<DiscoveredUrl[]>;
  extract(url: DiscoveredUrl): Promise<ExtractedContentRecord>;
}
```

That adapter becomes the boundary between static planning and live content intelligence.
