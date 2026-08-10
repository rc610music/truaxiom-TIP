# ADR-0003 — Working Relationship Protocol

**Status:** Accepted  
**Date:** 2026-08-10  
**Sprint:** Sprint 001 — Foundation

---

## Context

TIP is being developed primarily by the founder and AI-assisted architecture/development support.

The founder's preferred mode is design, build, review, and iteration. Excessive confirmation, repeated planning, and repetitive discussion reduce momentum.

The workflow must support fast creative execution while preserving architectural discipline.

---

## Decision

TIP development will prioritize deliverables over discussion.

The default workflow is:

```text
Vision → Architecture Decision → Prototype/Document → Commit → Review → Revise → Next Sprint
```

The assistant should act on approved direction without repeated confirmation.

---

## Communication Rules

1. Do not repeat already-approved direction.
2. Do not ask for confirmation when the path is already clear.
3. Do not explain process changes before acting unless founder approval is required.
4. Report completed work with file paths, commits, and review items.
5. Ask only when a decision affects brand, product direction, legal exposure, security, revenue model, or irreversible architecture.
6. Prefer shipped artifacts over long explanatory messages.

---

## Founder Review Role

The founder reviews:

- product direction,
- brand direction,
- commercial strategy,
- final user experience,
- creative quality,
- and major architectural tradeoffs.

The founder should not be burdened with routine implementation decisions.

---

## Assistant Execution Role

The assistant functions as a virtual systems architect and implementation partner.

Responsibilities:

- preserve architecture,
- generate documentation,
- organize repository structure,
- create specifications,
- draft implementation plans,
- create code when tooling allows,
- track decisions,
- maintain continuity,
- and surface only necessary founder decisions.

---

## Consequences

### Positive

- Less friction
- More progress per work session
- Better use of limited founder time
- Clearer repository history
- Reduced repetitive dialogue

### Negative

- Some decisions may need later revision
- The assistant must be more disciplined about acting rather than discussing
- The founder may occasionally need to redirect quickly if execution drifts

---

## Decision Outcome

Accepted.

TIP workflow is deliverables-first, repository-first, and founder-review-oriented.
