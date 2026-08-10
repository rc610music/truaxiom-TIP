# ADR-0001 — Systems Before Features

**Status:** Accepted  
**Date:** 2026-08-10  
**Sprint:** Sprint 001 — Foundation

---

## Context

TIP is intended to become the reusable intelligence platform beneath TruaXiom products and, later, external client organizations.

Because TruaXiom has multiple active and planned products, the platform cannot be built as a collection of isolated features. Features that solve only one product's immediate problem create duplicated work, inconsistent behavior, and long-term maintenance drag.

---

## Decision

Every major capability in TIP must become a system before it becomes a feature.

A feature may be built only after its reusable system boundary is understood.

---

## Meaning

Instead of building:

```text
RootWork blog writer
```

TIP builds:

```text
Content Intelligence Module
  → used by RootWork
  → reusable by TruaXiom
  → reusable by client organizations
```

Instead of building:

```text
Project dashboard
```

TIP builds:

```text
Mission Control product/project model
  → supports every product
  → supports every organization
  → supports every agent
```

---

## Consequences

### Positive

- Less duplicate development
- More reusable architecture
- Better long-term scalability
- Easier product expansion
- Cleaner commercial positioning
- Stronger platform identity

### Negative

- Slower initial feature delivery
- More upfront architecture work
- Requires discipline to avoid overbuilding

---

## Implementation Guidance

Before implementing any new capability, define:

1. Is this a system, module, agent, product feature, or one-off task?
2. Can another TruaXiom product use it?
3. Can a future client organization use it?
4. What data model does it require?
5. What permissions does it require?
6. What interface does it expose?
7. What should be logged or explained?

---

## Decision Outcome

Accepted as TIP Principle 0.

Everything becomes a system before it becomes a feature.
