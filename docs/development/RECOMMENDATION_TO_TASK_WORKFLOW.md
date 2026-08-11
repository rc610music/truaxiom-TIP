# Recommendation-to-Task Workflow

**Status:** Contract created  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/recommendationToTask.ts`

---

## Purpose

TIP recommendations must become actionable work without skipping human authority.

This workflow converts accepted or new recommendations into reviewable task candidates.

---

## Flow

```text
Recommendation
  ↓
Conversion Helper
  ↓
Task Candidate
  ↓
Review Queue
  ↓
Execution / Implementation
  ↓
Activity + Knowledge Graph Update
```

---

## Current Capabilities

The implementation can:

- convert one recommendation into a task candidate,
- convert multiple eligible recommendations,
- preserve product and project linkage,
- preserve priority,
- attach acceptance criteria,
- attach the originating recommendation ID,
- summarize conversion results.

---

## Guardrail

Converted tasks enter `ready` workflow status.

They are not automatically executed.

---

## Why This Matters

This is the first bridge from intelligence to operations.

TIP can now move from “what should happen” to “what work item should be created,” while keeping final execution under control.
