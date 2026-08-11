# SYS-0010 — Ingestion Engine

**System ID:** SYS-0010  
**Status:** Draft v0.1  
**Sprint:** SPRINT-002  
**Owner:** TruaXiom Intelligence Platform

---

## Purpose

The Ingestion Engine is responsible for bringing outside evidence into TIP.

It connects sources, requests extraction, normalizes records, preserves provenance, and prepares content for Knowledge Graph mapping.

The Ingestion Engine does not approve knowledge.

It creates evidence for review, classification, and intelligence.

---

## Core Responsibilities

- Maintain ingestion sources.
- Create crawl requests.
- Execute or delegate crawling through adapters.
- Normalize extracted records.
- Track ingestion runs.
- Convert extracted records into candidate knowledge objects.
- Preserve source provenance.
- Surface ingestion status in Mission Control.

---

## System Boundary

### In Scope

- website ingestion,
- CMS ingestion planning,
- repository/document source ingestion planning,
- extracted content normalization,
- crawler adapter contracts,
- ingestion run records,
- candidate knowledge creation.

### Out of Scope for Sprint 002

- live crawling,
- publishing,
- scheduled jobs,
- advanced NLP classification,
- automatic approval,
- automated website updates.

---

## Architecture Flow

```text
Ingestion Source
    ↓
Crawl Request
    ↓
Crawler Adapter
    ↓
Extracted Content Records
    ↓
Content Map
    ↓
Candidate Knowledge Objects
    ↓
Knowledge Graph
    ↓
Organizational Brain
```

---

## First Validation Target

RootWork / restoreyour.life is the first read-only validation target.

The initial goal is to map content, identify gaps, and create recommendations.

The initial goal is **not** to publish or modify the site.

---

## Sprint 002 Implementation

Sprint 002 adds:

- shared ingestion and crawl types,
- mock RootWork crawler adapter,
- extracted content fixture,
- database schema for crawl requests and extracted records,
- documentation for the crawler adapter contract.

---

## Success Criteria

The Ingestion Engine is ready for Sprint 003 when:

1. A source can produce a crawl request.
2. A crawler adapter can return normalized extracted records.
3. Extracted records can be represented in storage.
4. Content maps can be updated from extracted records.
5. Mission Control can show ingestion readiness and status.
