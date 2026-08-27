<!-- Canonical Drive source: https://docs.google.com/document/d/1TnO8ZHu68544lxeeRkjcaGDMy1HSiiiiVunnwYQDnfo/edit -->

TIP — Architecture Source of Truth v1.0

Canonical Product Architecture

Status: Foundational / Source of Truth

Last reconciled: August 26, 2026

1. PURPOSE

This document defines the canonical architecture of the TruaXiom Intelligence Platform (TIP). It exists to keep product strategy, implementation, agent design, Mission Control, Command Center, and product integrations aligned across builds and conversations.

TIP is the shared intelligence platform beneath role-specific AI workers and TIP-enabled products. Customers may subscribe to TIP commercially, but the experience they are buying is not a collection of infrastructure services. The customer-facing experience is an AI workforce powered, governed, and orchestrated by TIP.

Canonical commercialization principle:

“Customers do not configure AI infrastructure. They hire an AI workforce. TIP assembles and governs the intelligence behind it.”

2. ARCHITECTURAL BOUNDARIES

TIP Core

TIP Core provides reusable platform services shared by agents and TIP-enabled products. Core services are not individual agents and are not customer-facing product modules.

Canonical core capability domains:

• Intelligence / reasoning services

• Knowledge ingestion, retrieval, and grounding

• Memory and project memory

• Planning and task decomposition

• Policy, permissions, and governance

• Research and evidence collection

• Scheduling and trigger services

• Registry and identity services

• Orchestration and workflow execution

• Observability, audit, and system health

App Manifest / Self-Registration

Every participating product, service, agent, and project integration must expose a structured identity and capability manifest to TIP. The manifest establishes what the object is, who owns it, what it can do, what it depends on, what permissions it has, what sources are authoritative, and how TIP should interact with it.

Registry

The Registry is TIP’s canonical inventory of registered agents, products, projects, services, integrations, capabilities, and relationships. Registration is not the same as intelligence. The Registry answers “what exists and how is it addressed?”

Project Intelligence Engine (PIE)

PIE is the central project-intelligence layer that turns registered sources and project history into usable, reconciled context. PIE maintains current project state, decisions, relationships, authoritative sources, open questions, and relevant historical context. PIE should prefer approved/current information over brainstorming, drafts, or stale documentation.

Agent Framework

The Agent Framework is the governed execution layer that assembles TIP capabilities into role-specific AI workers. Agents are not separate AI systems; they are configured roles that use shared TIP services, approved tools, scoped memory, policy, permissions, and workflows.

Mission Control

Mission Control is the operational control surface for the AI workforce. It is where authorized users view agents, inspect activity, approve actions, configure automations, launch workflows, review intelligence, intervene in runs, inspect failures, and manage workforce policy.

Mission Control does not replace TIP Core, PIE, or the Registry. It operates them through governed interfaces.

Command Center

TruaXiom Command Center is TruaXiom’s internal operational and project-intelligence HQ. It maintains the company-wide project registry, Build Ledger, product/source reconciliation, domain and DNS health, deployment/source health, project status, standards, documentation synchronization, and operational visibility across TruaXiom products.

Command Center is not the customer-facing AI workforce manager and should not absorb Mission Control’s responsibilities. It may consume TIP intelligence and may expose internal links into Mission Control, but the two surfaces remain distinct.

Products

RootWork, Kronike, Prep’Pay, BizWhiz, Pik.AI.so, and other TruaXiom products remain independent products. A product may:

• consume TIP Core services;

• register with TIP;

• contribute project knowledge to PIE;

• employ one or more TIP-powered agents;

• expose approved workflows for agents to operate;

• remain usable without becoming a TIP module.

3. SYSTEM RELATIONSHIP MODEL

Canonical stack:

Products / Customer Workflows

        ↓

Role-Specific Agents / AI Workforce

        ↓

Agent Framework

        ↓

TIP Core Services + PIE + Registry

        ↓

Authoritative Sources, Tools, Integrations, Policies, Infrastructure

Operational surfaces:

• Mission Control supervises agents and workforce activity.

• Command Center supervises TruaXiom projects, products, sources, deployments, documentation, and operational health.

4. SHARED TIP CORE SERVICES

Intelligence

Provides reasoning, synthesis, prioritization, decision support, classification, recommendation, and context-sensitive response generation.

Knowledge

Ingests and retrieves grounded information from approved sources. Tracks provenance, freshness, authority, conflicts, and source relationships.

Memory

Maintains scoped durable context. Memory must distinguish user memory, project memory, agent working memory, run memory, and organization-level knowledge. Memory is governed by permissions and retention policy.

Planning

Decomposes goals into tasks, dependencies, checkpoints, and execution plans. Planning can propose work but cannot bypass policy or approval requirements.

Policy & Governance

Controls permissions, approval gates, protected actions, privacy boundaries, tool access, data handling, escalation, and audit requirements.

Research

Collects external or internal evidence when permitted, records sources, distinguishes verified facts from inference, and returns grounded findings to the requesting workflow.

Scheduling

Supports recurring, delayed, and condition-based execution while respecting platform execution limits, approvals, and user-defined windows.

Registry

Stores identities, capabilities, relationships, versions, ownership, status, endpoints, source-of-truth references, and lifecycle state.

Orchestration

Coordinates multi-step workflows across services, agents, products, and tools. It owns execution sequencing, retries, dependencies, handoffs, and run state—not business policy.

Observability & System Health

Records run status, failures, latency, data freshness, integration health, source drift, policy violations, and audit events.

5. AGENT MODEL

An agent is a governed, role-specific worker assembled from TIP shared capabilities.

An agent consists of:

• role identity;

• objective and scope;

• allowed TIP services;

• approved tools and integrations;

• knowledge sources;

• memory scope;

• permissions;

• policies and approval gates;

• triggers and schedules;

• workflow definitions;

• output contracts;

• observability and audit requirements;

• lifecycle state and version.

Examples include Marketing Manager, Content Strategist, SEO Specialist, Research Analyst, Customer Success Agent, Operations Manager, Executive Assistant, RootWork Content Agent, Kronike Interview Agent, and Prep’Pay Audit Agent.

The customer hires a role. TIP assembles the intelligence, permissions, tools, memory, and workflows necessary for that role.

6. AGENT LIFECYCLE

Create → Configure → Validate → Activate → Execute → Monitor → Review/Approve → Improve/Version → Pause/Retire

No agent should enter active production until required manifests, permissions, data scopes, policies, and test cases have passed validation.

7. HUMAN CONTROL MODEL

TIP uses policy-driven autonomy rather than universal autonomy.

Actions are classified into approval tiers:

• Read / analyze: normally autonomous when access is authorized.

• Draft / recommend: autonomous with review available.

• Reversible low-risk write: policy-dependent.

• External communication, publishing, financial, legal, account/security, destructive, or high-impact actions: explicit policy and, where required, human approval.

Every agent action must be attributable to an agent identity and run ID, with sufficient audit context to explain what source, policy, permission, and workflow produced the action.

8. PRODUCT INTEGRATION MODEL

A TIP-enabled product integration should define:

• product manifest;

• authoritative source locations;

• capabilities exposed to TIP;

• supported agent actions;

• read/write permissions;

• data schemas;

• webhooks or polling triggers where supported;

• authentication model;

• approval requirements;

• failure and retry behavior;

• audit events;

• version compatibility.

TIP integrations must preserve product independence. No product should be forced to duplicate TIP Core services internally unless required for offline, privacy, reliability, or product-specific reasons.

9. COMMERCIALIZATION STRATEGY

Phase 1 — Done-for-You AI Workforce

TruaXiom designs, configures, validates, and deploys custom AI workforces for clients. Revenue combines high-touch implementation/consulting with recurring platform revenue. Reusable patterns from engagements improve the platform and future templates without exposing client-private data.

Phase 2 — Guided Workforce Builder

Clients answer business-oriented questions about goals, processes, approvals, systems, data, and roles. TIP converts those answers into a proposed workforce configuration. Advanced users may customize roles, capabilities, permissions, and automations.

Phase 3 — Agent Marketplace

TIP supports industry templates, TruaXiom-built agent packages, approved third-party/community packages, one-click installation, versioning, reviews/verification, and revenue sharing. Marketplace packages must conform to the Agent Framework Specification and platform governance requirements.

10. BUILD SEQUENCE

The canonical implementation sequence is:

1. Lock TIP architecture and terminology.

2. Implement App Manifest / self-registration and canonical Registry behavior.

3. Implement PIE and required shared intelligence/knowledge/memory services.

4. Lock and implement the Agent Framework contract.

5. Build Mission Control against the real Agent Framework and Registry.

6. Build the RootWork Content Agent as the reference implementation.

7. Validate the framework by implementing at least one materially different second agent.

8. Productize the internal configuration flow into the Guided Workforce Builder.

9. Stabilize packaging/versioning/security contracts.

10. Introduce Marketplace capability only after the agent contract is proven stable.

11. REFERENCE AGENT — ROOTWORK CONTENT AGENT

The first reference agent is the RootWork Content Agent.

Its objective is not merely to write blog posts. Its reference workflow is:

• inspect approved RootWork content and site structure;

• build or refresh a content inventory;

• detect topic, audience, journey, SEO, and coverage gaps;

• recommend an editorial plan with reasoning;

• draft content grounded in RootWork’s approved voice and sources;

• run quality, duplication, policy, and citation checks;

• submit content for review when policy requires;

• publish only after approval or when an approved policy explicitly permits autonomous publishing;

• record the resulting changes back into project intelligence and audit history.

This agent exists primarily to prove the Agent Framework end-to-end. RootWork-specific shortcuts must not become framework assumptions.

12. ARCHITECTURAL NON-NEGOTIABLES

• Agents are role configurations on TIP, not independent AI platforms.

• Mission Control supervises agents; Command Center supervises TruaXiom operations/projects.

• PIE owns reconciled project intelligence; the Registry owns identity/inventory.

• Products remain independent products.

• Brainstorming and unapproved ideas do not overwrite approved/current state.

• Every consequential action is permissioned, attributable, observable, and auditable.

• Human approval is a policy control, not an afterthought.

• Reusable framework behavior must not be hard-coded to a single reference agent.

• Marketplace support cannot precede a stable versioned agent contract.

13. SOURCE-OF-TRUTH RULE

When implementation, documentation, or conversation conflicts with this architecture, the conflict must be surfaced and reconciled rather than silently inventing a third model. Approved later architecture revisions supersede this document only when intentionally versioned and recorded.
