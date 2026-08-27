<!-- Canonical Drive source: https://docs.google.com/document/d/1amOHvfslZptEkYIifSxhbOd_62BMTUZyNiV3KxxaynA/edit -->

TIP — Agent Framework Specification v1.0

Canonical Agent Contract

Status: Foundational / Source of Truth

Last reconciled: August 26, 2026

1. PURPOSE

This specification defines what a TIP agent is, how agents are created, what TIP services they may use, how businesses “hire” AI workers, how agents are governed through their lifecycle, and the minimum contract future third-party agent packages must satisfy.

This document is subordinate to and must remain compatible with the TIP Architecture Source of Truth.

2. DEFINITION OF AN AGENT

A TIP agent is a governed, role-specific software worker assembled from shared TIP capabilities, approved tools, scoped knowledge, memory, policy, and workflows.

An agent is not:

• a separate AI platform;

• a duplicate TIP Core;

• merely a prompt;

• merely a chatbot persona;

• an unbounded autonomous process;

• a TruaXiom product by itself.

An agent becomes operational only when its role, objectives, permissions, tools, sources, policies, triggers, outputs, and lifecycle state are valid and registered.

3. AGENT MANIFEST

Every agent must have a versioned Agent Manifest. The manifest is the canonical machine-readable contract for the worker.

Required fields:

• agent_id — stable unique identifier

• name — human-readable role name

• version — semantic or platform-approved version

• owner — organization/project responsible for the agent

• role — business role performed

• description — concise purpose

• objectives — approved goals/outcomes

• scope — explicit in-scope responsibilities

• exclusions — explicit out-of-scope responsibilities

• lifecycle_state — draft, validating, active, paused, deprecated, retired

• capabilities — approved TIP capabilities used

• tools — approved external/internal tools

• data_sources — approved knowledge/data sources

• memory_policy — allowed memory types and retention

• permissions — read/write/action permissions

• approval_policy — actions requiring approval

• triggers — event, schedule, manual, or condition triggers

• workflows — supported workflow definitions

• output_contracts — expected output types/schemas

• escalation_policy — when/how the agent hands off to a human or another agent

• observability_policy — required logs, metrics, traces, audit events

• dependency_versions — required TIP/integration contract versions

• tags — role, industry, domain, risk, and discovery metadata

Optional fields may extend the manifest, but they may not weaken required policy, identity, or audit controls.

4. ROLE DESIGN MODEL

Each agent must define a clear business role rather than a vague “general AI” mandate.

A valid role definition answers:

• Who is this worker?

• What business outcome is it responsible for?

• What may it decide independently?

• What must it recommend rather than execute?

• What sources may it trust?

• What systems may it access?

• What actions require approval?

• When must it escalate?

• How is success measured?

Examples:

Marketing Manager — plans campaigns, coordinates channel strategy, recommends spend, and manages approved marketing workflows.

Content Strategist — identifies coverage gaps, builds editorial plans, and coordinates content creation.

Research Analyst — gathers and synthesizes evidence with source provenance.

Customer Success Agent — monitors approved customer signals, prepares responses/actions, and escalates risk.

Operations Manager — monitors operational workflows, exceptions, and task queues.

Executive Assistant — manages approved scheduling, briefing, communications drafting, and follow-up.

RootWork Content Agent — performs RootWork content intelligence and editorial workflows.

Kronike Interview Agent — conducts guided narrative interviews and organizes captured memories.

Prep’Pay Audit Agent — audits paycheck inputs/estimates against permitted payroll evidence and flags mismatches.

5. TIP SERVICE ACCESS

Agents consume TIP services through governed interfaces. Access is deny-by-default unless granted in the manifest/policy layer.

Intelligence

Reasoning, synthesis, ranking, classification, and recommendation.

Knowledge

Retrieval from approved sources with provenance and freshness.

Memory

Scoped durable context. Agents may not freely cross user, client, project, or organization boundaries.

Planning

Task decomposition and execution planning. Plans do not automatically authorize protected actions.

Policy & Governance

Permission checks, approval gates, privacy rules, and action constraints.

Research

Evidence gathering from approved internal/external sources.

Scheduling

Recurring or delayed runs and condition-based triggers within platform limits.

Registry

Identity, capability, dependency, status, and relationship lookup.

Orchestration

Run sequencing, retries, dependencies, handoffs, and multi-agent coordination.

Observability

Run state, errors, metrics, audit events, and health reporting.

6. TOOL ACCESS

Tools are granted explicitly.

For every tool, the agent contract must define:

• tool identity;

• permitted operations;

• credential/authentication boundary;

• data scope;

• read/write classification;

• approval requirements;

• rate/usage constraints;

• retry/failure behavior;

• audit requirements;

• prohibited operations.

Agents must not infer permission to use one tool from permission to use another.

7. KNOWLEDGE & SOURCE AUTHORITY

Every agent must operate against a source-authority model.

Sources should be classified as:

• canonical/authoritative;

• approved supporting;

• external verified;

• provisional/draft;

• historical/archive;

• untrusted/unverified.

When sources conflict, agents must prefer current canonical sources or surface the conflict for reconciliation. Brainstorming, old drafts, or conversational speculation must not silently overwrite approved/current state.

8. MEMORY MODEL

Memory types:

• run memory — temporary context for a single execution;

• working memory — short-lived context across related steps/runs;

• agent memory — durable role-specific operational memory;

• project memory — durable approved project context from PIE;

• organization memory — approved shared company knowledge;

• user memory — user-scoped durable preferences/context where permitted.

Every memory write must be governed by scope, provenance, retention, sensitivity, and authorization.

Agents may not use memory as a hidden source of truth when the canonical project/source data says otherwise.

9. PERMISSIONS & ACTION CLASSES

Permission model is least-privilege and action-specific.

Recommended action classes:

A0 — Observe / read

A1 — Analyze / recommend

A2 — Draft / prepare

A3 — Reversible low-risk write

A4 — External communication or publishing

A5 — Sensitive account, financial, legal, security, destructive, or materially consequential action

A0–A2 may generally run autonomously when access is authorized.

A3 is policy-dependent.

A4–A5 require explicit policy and often human approval.

The policy engine, not the agent’s own preference, decides whether an action may execute.

10. HUMAN APPROVAL WORKFLOWS

Approval gates may be:

• per action;

• per workflow step;

• per tool;

• per destination;

• per risk class;

• per client/project;

• temporarily delegated;

• condition-based.

Approval requests must include sufficient context for an informed decision:

• what the agent wants to do;

• why;

• relevant evidence/input;

• expected effect;

• target/destination;

• reversibility;

• associated risk/policy;

• proposed payload/content where applicable.

Approval must be recorded in the audit trail.

11. AGENT LIFECYCLE

Draft

Role and manifest are being designed. No production execution.

Configure

Tools, sources, permissions, memory, triggers, workflows, and output contracts are attached.

Validate

Static checks and scenario tests verify manifest completeness, access boundaries, policy behavior, tool compatibility, and expected outputs.

Activate

Agent may accept permitted production runs.

Execute

Runs are created with run IDs, inputs, plan/state, tool calls, outputs, approvals, and audit events.

Monitor

Health, failures, drift, stale dependencies, quality, cost/usage, and policy events are observed.

Improve / Version

Material behavior changes create a new version. Existing production agents are not silently rewritten.

Pause

New execution is suspended while preserving state and audit history.

Deprecate

Agent remains available temporarily but is scheduled for replacement/removal.

Retire

Execution disabled; retention and archival policy applied.

12. VALIDATION REQUIREMENTS

Before activation, every agent must pass at least:

• manifest completeness test;

• permission boundary test;

• unauthorized-action denial test;

• approval-gate test;

• source-authority conflict test;

• tool failure/retry test;

• missing-data test;

• escalation test;

• output-contract validation;

• observability/audit test;

• lifecycle state transition test.

High-risk agents require additional domain-specific testing.

13. RUN MODEL

Every execution creates a Run object.

Minimum run fields:

• run_id

• agent_id + agent_version

• initiating user/system/trigger

• timestamp

• objective/input

• project/client context

• plan/workflow version

• tools/services invoked

• source references

• approvals requested/received/denied

• actions executed

• outputs

• errors/retries

• escalation events

• final status

• audit record references

Run states should include queued, planning, running, waiting_for_approval, blocked, retrying, completed, failed, cancelled.

14. MULTI-AGENT COMMUNICATION

Agents may communicate only through TIP orchestration and registered message/workflow contracts.

Direct uncontrolled agent-to-agent prompting is not a production architecture.

A handoff must identify:

• sender agent/run;

• recipient agent;

• reason/objective;

• permitted context payload;

• source/provenance references;

• expected output;

• response deadline or workflow dependency where relevant.

The receiving agent does not inherit the sender’s permissions.

15. ORCHESTRATION RULES

Orchestration coordinates work; it does not grant authority.

A workflow may contain:

• sequential steps;

• parallel steps;

• conditional branches;

• retries/backoff;

• approvals;

• human tasks;

• agent handoffs;

• tool actions;

• validation checkpoints;

• rollback/compensation steps where possible.

Each step is evaluated against the acting agent’s policy and permissions.

16. OBSERVABILITY & AUDIT

Mission Control must be able to answer:

• Which agents are active?

• What are they doing now?

• What did they do?

• Why did they do it?

• What sources did they use?

• What tools did they access?

• What approvals are pending?

• What failed or drifted?

• What changed between agent versions?

Required telemetry includes run status, duration, tool/service failures, approval wait time, policy denials, source freshness, dependency health, and quality signals appropriate to the role.

17. FAILURE & ESCALATION MODEL

Agents must fail safely.

On uncertainty, missing permission, conflicting canonical sources, unavailable critical tools, repeated execution failure, policy ambiguity, or high-risk unexpected conditions, the default behavior is to stop the affected action and escalate rather than improvise authority.

Fallback behavior must be declared in the workflow or policy.

18. BUSINESS “HIRE” FLOW

The commercial experience should be role-first rather than infrastructure-first.

Phase 1 — Done-for-You

A TruaXiom operator discovers the client’s business goals, systems, workflows, risk boundaries, approval preferences, and desired roles. TruaXiom configures the agent manifests/workforce, validates it, and deploys it through TIP.

Phase 2 — Guided Builder

The client answers business questions. TIP converts answers into proposed roles, responsibilities, tools, permissions, approval gates, data connections, and workflows. The client reviews the proposed workforce before activation.

Recommended builder flow:

1. Define business/team context.

2. Select desired outcomes.

3. Identify roles to hire.

4. Connect approved systems/data.

5. Define what each role may do.

6. Define approval preferences.

7. Generate workforce proposal.

8. Review permissions and workflows.

9. Validate with test scenarios.

10. Activate.

The builder should hide unnecessary infrastructure complexity while never hiding consequential permissions or risk.

19. AGENT PACKAGE FORMAT

A portable TIP Agent Package should eventually contain:

• manifest;

• role description;

• workflow definitions;

• required TIP capability declarations;

• tool/integration requirements;

• input/output schemas;

• source requirements;

• policy defaults;

• approval defaults;

• memory policy;

• tests/evaluation scenarios;

• version/changelog;

• documentation;

• marketplace metadata where applicable.

Client secrets, private data, and credentials must never be embedded in reusable packages.

20. MARKETPLACE CONTRACT

Third-party marketplace publishing is allowed only after the platform supports a stable package contract, validation pipeline, permissions review, versioning, and governance.

Marketplace submission should require:

• valid package schema;

• declared permissions;

• declared tools/integrations;

• risk classification;

• automated validation suite;

• human/platform review where appropriate;

• version compatibility;

• privacy/security disclosure;

• support/ownership information;

• upgrade and deprecation policy.

Installation should create a local/client-specific configured instance. The marketplace package is a template, not a live cross-customer agent sharing private memory.

21. REFERENCE IMPLEMENTATION — ROOTWORK CONTENT AGENT

Purpose

Prove the full TIP Agent Framework end-to-end using a meaningful but manageable business role.

Role

RootWork Content Agent / Content Strategist + Editorial Operator.

Primary objective

Continuously improve RootWork’s approved content coverage and editorial pipeline without publishing unreviewed content unless policy explicitly allows autonomous publishing.

Reference capabilities

• inspect RootWork content/site inventory;

• retrieve project knowledge from PIE;

• research approved external topics where permitted;

• detect topic and audience gaps;

• recommend prioritized editorial plans;

• draft articles and supporting content;

• run duplication/quality/policy checks;

• submit drafts for review;

• publish through approved tooling after authorization/policy check;

• register published changes back into project intelligence.

Reference workflow

Trigger → refresh inventory → reconcile sources → analyze gaps → create ranked recommendations → select/approve topic → research → outline → draft → quality/policy validation → human approval if required → publish → verify publication → update PIE/audit → complete run.

Reference tests

• cannot publish when approval is required but absent;

• does not treat a draft page as canonical published content;

• detects stale/broken source access;

• records sources used for factual claims/research;

• handles duplicate-topic detection;

• surfaces conflicting brand/voice guidance;

• records successful publication back to project intelligence;

• fails safely if publishing tool or authentication is unavailable.

22. SECOND-AGENT VALIDATION REQUIREMENT

The framework is not considered proven by RootWork alone. Before declaring the Agent Framework stable, implement at least one materially different second agent—preferably a workflow such as Prep’Pay Audit Agent or Kronike Interview Agent—to expose assumptions that are accidentally content-specific.

23. SECURITY PRINCIPLES

• Least privilege by default.

• Explicit tenant/client/project isolation.

• No permission inheritance through agent handoffs.

• Secrets kept outside reusable manifests/packages.

• Protected actions require policy checks at execution time.

• Audit records are append-oriented and attributable.

• Source provenance is preserved.

• Retired agents cannot continue scheduled work.

• Version changes cannot silently expand permissions.

24. VERSIONING & CHANGE CONTROL

Changes requiring a new agent version include material modifications to role behavior, objectives, workflows, tool access, permissions, policy defaults, output contracts, or dependency compatibility.

Permission expansion must never occur through an invisible patch.

TIP platform contract changes that break existing agent packages require a migration/version compatibility plan.

25. DEFINITION OF DONE FOR AN AGENT

An agent is production-ready only when:

• its manifest is complete and registered;

• required sources and integrations are healthy;

• permissions are least-privilege and tested;

• approval gates behave correctly;

• required validation scenarios pass;

• outputs meet their contracts;

• runs are visible in Mission Control;

• errors and blocked states are actionable;

• audit records are complete;

• lifecycle controls work;

• documentation identifies owner, version, dependencies, and support path.

26. FRAMEWORK NON-NEGOTIABLES

• Role-first design, not generic autonomous AI.

• Shared TIP services, not duplicated mini-platforms.

• Explicit permissions and scoped memory.

• Human approval as a first-class workflow primitive.

• No uncontrolled agent-to-agent authority transfer.

• Every execution is a traceable run.

• Reference implementations must validate the framework rather than distort it.

• Marketplace packages are templates/configurations, never shared private agent instances.

• New agents must conform to this specification unless the architecture is deliberately revised and versioned.
