# Content Map Candidate Workflow

**Status:** Draft implementation complete  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/contentMapCandidates.ts`

---

## Purpose

The candidate workflow turns crawler output into reviewable content map proposals.

The crawler should not directly rewrite the official content map. It produces candidates first.

This protects the Organizational Brain from treating raw extraction as verified truth.

---

## Workflow

```text
Crawler Adapter
  ↓
Extracted Content Records
  ↓
Content Map Candidates
  ↓
Candidate Gaps
  ↓
Founder / Operator Review
  ↓
Accepted Candidates Merge into Content Map
  ↓
Knowledge Graph + Organizational Brain Update
```

---

## Current Capabilities

The current implementation can:

- infer a section from URL/path patterns,
- infer content type and intent from extracted crawler metadata,
- generate candidate content map items,
- flag low-confidence candidates for review,
- propose content gaps from candidate coverage,
- merge accepted candidates into an existing content map.

---

## Guardrail

Crawler records are **evidence**.

Content map candidates are **proposals**.

Official content map items are **organizational knowledge** only after acceptance or confidence validation.

---

## RootWork Use Case

The RootWork website crawl will produce extracted records from:

- homepage,
- Wisdom / blog content,
- practices,
- resources,
- Root Types,
- Premium / membership paths.

TIP will then surface what was found, what is missing, and what needs review inside Mission Control.

---

## Next Step

Wire candidate workflow output into Mission Control as a review queue after the first live or fixture-backed crawl result is available.
