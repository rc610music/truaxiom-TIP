# ADR-0002 — Organizational Brain as the Primary Intelligence Layer

**Status:** Accepted  
**Date:** 2026-08-10  
**Sprint:** Sprint 001 — Foundation

---

## Context

TIP requires a central intelligence layer that understands organizational context before modules, agents, or automations act.

Without a primary intelligence layer, each module would need to gather its own context, leading to duplicated logic, inconsistent decisions, and conflicting recommendations.

---

## Decision

The Organizational Brain is the primary intelligence layer of TIP.

All modules and agents should receive context from the Organizational Brain rather than constructing independent interpretations of the organization.

---

## Architecture Relationship

```text
Knowledge Graph
    ↓
Organizational Brain
    ↓
Intelligence Engine
    ↓
Modules / Agents / Mission Control
```

The Knowledge Graph stores organizational truth. The Organizational Brain interprets it. The Intelligence Engine decides what to do with it.

---

## Consequences

### Positive

- Shared organizational understanding
- Consistent brand and product context
- Better recommendations
- Easier debugging and explanation
- Reduced duplication across modules
- Clearer separation of responsibilities

### Negative

- The Organizational Brain becomes a critical dependency
- Poor context modeling can affect downstream systems
- Requires strong governance around confidence and provenance

---

## Implementation Guidance

Modules should request context packets from the Organizational Brain.

Agents should not independently crawl and interpret organization state unless explicitly assigned as ingestion agents.

Mission Control should display Organizational Brain outputs as recommendations, summaries, alerts, and explanations.

---

## Decision Outcome

Accepted.

The Organizational Brain becomes SYS-0001 and is treated as a core platform system.
