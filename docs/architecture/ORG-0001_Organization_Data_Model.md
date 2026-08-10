# ORG-0001 — Organization Data Model

**Document ID:** ORG-0001  
**Status:** Draft v1.0  
**Sprint:** Sprint 001 — Foundation  
**Type:** Data Model Specification

---

## 1. Purpose

The Organization Data Model defines the minimum structured data TIP needs to represent a company, brand, product ecosystem, or client workspace.

This model becomes the base layer for Mission Control, the Organizational Brain, the Knowledge Graph, user permissions, modules, agents, and product integrations.

---

## 2. Core Concept

TIP is multi-organization by design.

Every product, system, agent, module, document, task, workflow, and recommendation belongs to an organization or organization workspace.

---

## 3. Primary Entities

### Organization
Represents a business, brand, studio, client, or internal operating unit.

Fields:

```text
id
name
slug
description
mission
vision
values
brand_voice
industry
website_url
status
created_at
updated_at
```

### Product
Represents a market-facing app, platform, service, offer, or operating product.

Fields:

```text
id
organization_id
name
slug
description
product_type
status
repository_url
production_url
staging_url
owner
created_at
updated_at
```

### Project
Represents an active build effort, sprint, initiative, or operational project.

Fields:

```text
id
organization_id
product_id
name
description
status
priority
phase
start_date
target_date
created_at
updated_at
```

### Module
Represents an installable intelligence capability.

Fields:

```text
id
name
slug
description
module_type
status
version
created_at
updated_at
```

### Agent
Represents a specialized worker assigned to an organization, product, or workflow.

Fields:

```text
id
organization_id
product_id
name
agent_type
purpose
permissions
status
created_at
updated_at
```

### Knowledge Object
Represents any structured item of organizational knowledge.

Fields:

```text
id
organization_id
type
title
summary
body
source
source_uri
confidence_score
approval_status
freshness_status
created_at
updated_at
```

### Task
Represents work surfaced by TIP or manually created by a user.

Fields:

```text
id
organization_id
product_id
project_id
title
description
status
priority
assigned_to
source
due_date
created_at
updated_at
```

### Decision
Represents strategic, product, technical, or architectural decisions.

Fields:

```text
id
organization_id
decision_type
title
status
context
decision
rationale
consequences
approved_by
created_at
updated_at
```

### Activity Event
Represents a timeline event in Mission Control.

Fields:

```text
id
organization_id
actor_type
actor_id
event_type
title
summary
metadata
created_at
```

---

## 4. Organization Hierarchy

TIP supports multiple hierarchy patterns.

Initial TruaXiom hierarchy:

```text
TruaXiom LLC
  ├── TIP
  ├── RootWork
  ├── Boogie Lab
  ├── StockSense
  ├── Prompt2Pod
  └── Scrollodex
```

Commercial hierarchy:

```text
Client Organization
  ├── Products
  ├── Projects
  ├── Agents
  ├── Modules
  ├── Knowledge
  └── Workflows
```

---

## 5. Required Relationships

```text
Organization HAS Product
Organization HAS Project
Organization INSTALLS Module
Organization DEPLOYS Agent
Product HAS Project
Project HAS Task
Agent USES Module
Module READS Knowledge Object
Decision AFFECTS Product
Activity Event REFERENCES Any Entity
```

---

## 6. MVP Database Recommendation

Use a relational database first, preferably PostgreSQL/Supabase.

Reason:

- lower complexity,
- lower operating cost,
- strong querying,
- good auth support,
- easy migration path,
- works with graph-style relationship tables.

Graph behavior can be modeled with:

```text
graph_nodes
graph_edges
```

without requiring a dedicated graph database in v0.1.

---

## 7. Multi-Tenant Considerations

Every organization-owned table requires `organization_id`.

No cross-organization access should occur unless explicitly configured.

Future commercial TIP deployments must support:

- internal TruaXiom workspaces,
- client workspaces,
- white-label workspaces,
- organization-level permissions,
- product-level permissions,
- agent-level permissions.

---

## 8. Success Criteria

ORG-0001 is successful when:

- Mission Control can list organizations, products, projects, agents, modules, and tasks.
- The Knowledge Graph can attach knowledge to any organization-owned entity.
- The Organizational Brain can generate context by organization and product.
- RootWork can be modeled as the first connected product.

---

## 9. Version History

| Version | Date | Notes |
|---|---|---|
| v1.0 | 2026-08-10 | Sprint 001 data model specification created |
