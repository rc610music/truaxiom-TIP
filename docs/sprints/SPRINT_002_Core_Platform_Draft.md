# SPRINT 002 — Core Platform

**Sprint ID:** SPRINT-002  
**Status:** Draft / Ready to Start  
**Created:** 2026-08-10  
**Depends On:** SPRINT-001 — Foundation

---

## 1. Sprint Objective

Move TIP from architecture foundation into the first buildable platform layer.

Sprint 002 creates the initial Mission Control shell, establishes the platform application structure, defines core models in implementation form, and seeds the first TruaXiom and RootWork data.

---

## 2. Sprint Outcome

By the end of Sprint 002, TIP should have a visible application shell that can represent:

- organizations,
- products,
- projects,
- agents,
- modules,
- knowledge placeholders,
- recommendations placeholders,
- tasks,
- and activity.

It does not need full intelligence yet.

It must create the structure where intelligence will live.

---

## 3. Primary Deliverables

### CORE-0001 — Platform App Initialization

Create the initial TIP application structure.

Recommended default:

```text
apps/
  mission-control/
packages/
  core/
  types/
  ui/
docs/
database/
scripts/
```

### APP-0001 — Mission Control Shell

Build the first interface shell:

- sidebar navigation,
- top search/command bar,
- home overview,
- organization switcher placeholder,
- product cards,
- project cards,
- activity timeline placeholder,
- agent/module status placeholders.

### ORG-0001 — Data Model Implementation

Translate the Organization Data Model into implementation types or schema.

Initial models:

- Organization
- Product
- Project
- Agent
- Module
- KnowledgeObject
- Task
- Decision
- ActivityEvent

### REG-0001 — Seed Registry Data

Create seed data for:

- TruaXiom LLC
- TIP
- RootWork
- Boogie Lab
- StockSense
- Prompt2Pod
- Scrollodex

### SYS-0002 — Knowledge Graph Stub

Create initial graph structures:

- graph nodes,
- graph edges,
- source metadata,
- confidence status,
- freshness status.

### SYS-0001 — Organizational Brain Stub

Create initial context packet format.

No advanced reasoning is required yet.

The goal is to define the shape of context before intelligence is added.

---

## 4. Recommended Technology Path

Default recommended stack for Sprint 002:

- TypeScript
- React / Next.js-compatible structure
- Tailwind-style component thinking
- Local static seed data first
- Supabase/PostgreSQL-compatible schema later
- GitHub repository as source of truth

Rationale:

- fast iteration,
- low initial cost,
- easy future deployment,
- compatible with modern UI tooling,
- and clear migration path to database-backed intelligence.

---

## 5. Initial Mission Control Screens

### Home

Displays:

- organization health,
- priority recommendations,
- active products,
- active projects,
- recent activity,
- agent status.

### Products

Displays all TruaXiom products and product statuses.

### Projects

Displays active initiatives and sprint states.

### Knowledge

Placeholder for Knowledge Graph browser.

### Agents

Placeholder for specialized agents.

### Modules

Placeholder for installable intelligence modules.

### Activity

Unified timeline placeholder.

### Settings

Workspace and platform configuration placeholder.

---

## 6. Data Seed v0.1

Initial organization:

```text
TruaXiom LLC
```

Initial products:

```text
TIP
RootWork
Boogie Lab
StockSense
Prompt2Pod
Scrollodex
DotDizzy
```

Initial core systems:

```text
Organizational Brain
Knowledge Graph
Intelligence Engine
Mission Control
```

Initial modules:

```text
Content Intelligence
SEO Intelligence
Brand Intelligence
Workflow Intelligence
Analytics Intelligence
Project Intelligence
Research Intelligence
Customer Intelligence
Creative Intelligence
```

---

## 7. Sprint 002 Definition of Done

Sprint 002 is complete when:

- application structure exists,
- Mission Control shell exists,
- primary navigation exists,
- seed data exists,
- TypeScript models or schema exist,
- README reflects implementation path,
- repository can be cloned and understood,
- and Sprint 003 can begin on the Intelligence Layer.

---

## 8. Open Founder Decisions

These do not block Sprint 002.

1. Final hosting target for the first deployed Mission Control shell.
2. Whether Sprint 002 UI should be built directly in code or first prototyped visually.
3. Whether RootWork content ingestion begins with static sample data or live crawling.

Default if no direction is given:

- build repository-based Mission Control shell,
- use static seed data,
- defer live crawling until Sprint 003 or Sprint 004.

---

## 9. Sprint 003 Preview

Sprint 003 should focus on:

- Intelligence Engine,
- context packet generation,
- recommendation model,
- confidence scoring,
- RootWork content opportunity analysis,
- and task generation.

---

## 10. Version History

| Version | Date | Notes |
|---|---|---|
| v0.1 | 2026-08-10 | Sprint 002 drafted after Sprint 001 completion |
