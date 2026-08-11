# RootWork Ingestion Plan

**Integration ID:** INT-ROOTWORK-001  
**Product:** RootWork / restoreyour.life  
**Sprint:** SPRINT-002 — Core Platform  
**Status:** Draft v0.1

---

## 1. Purpose

RootWork is the first production validation target for TIP.

The first ingestion phase is read-only. TIP will observe, map, classify, and recommend. It will not publish, edit, delete, or modify live RootWork content until explicit approval boundaries and confidence thresholds are implemented.

---

## 2. Initial Source

```text
https://restoreyour.life
```

---

## 3. Target Sections

### Blog

Purpose:
- long-form educational and reflective content
- topic coverage mapping
- freshness review
- internal link opportunities

### Resources

Purpose:
- worksheets
- guides
- downloads
- reference materials
- future lead magnets

### Practices

Purpose:
- guided exercises
- breathwork
- journaling
- rituals
- applied RootWork activities

### Core Pages

Purpose:
- brand clarity
- conversion flow
- membership language
- onboarding structure

---

## 4. First-Pass Metadata

Each discovered item should eventually produce:

- title
- URL
- section
- topic tags
- content type
- summary
- intended audience
- related RootWork concepts
- related products/modules
- freshness score
- confidence score
- recommended next action

---

## 5. Recommendation Outputs

The first useful recommendations should include:

- missing topic opportunities
- related practice opportunities
- resource/worksheet opportunities
- stale content updates
- internal link suggestions
- blog-to-resource conversion ideas
- content series opportunities

---

## 6. Approval Boundaries

During the first phase, TIP may:

- crawl public pages
- classify content
- generate summaries
- detect gaps
- recommend tasks
- draft suggested additions

TIP may not yet:

- publish directly to Lovable
- edit live RootWork pages
- delete content
- overwrite metadata
- modify URLs
- change brand messaging without review

---

## 7. Success Criteria

The RootWork ingestion phase is successful when TIP can answer:

1. What content exists?
2. What topics are already covered?
3. What sections are underdeveloped?
4. What content should be added next?
5. What related practices or resources are missing?
6. What should be updated before new material is created?

---

## 8. Next Build Step

Create the content map schema and an ingestion run record model.
