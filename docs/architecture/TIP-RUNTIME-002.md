# TIP Runtime 002 — durable governed mission lifecycle

Built on `codex/tip-runtime-001`, initial PR #8 head
`1c6d8e59c5ce15fc73f8403828fb5a5bb918229a`. Registry v1, the existing API,
Taxis resolver, canonical Agent Manifest and Neon/Postgres direction remain in use.
There is no new TIP core, task board, CRM, runner or AI provider.

## Implemented boundary

One mission owns one delegation. Repository-owned Capability Manifests resolve
capability requirements; repository-owned Agent Manifests establish execution
identity. Taxis filters active agents, exact namespaced permissions and explicit
project/capability scope, then selects deterministically. Exclusions override scope.
No wildcard grants or implicit bootstrap-agent authority are allowed.

Caller permissions and risk can strengthen but cannot weaken catalog requirements.
The existing grouped Agent Manifest grants become `read:resource`, `write:resource`
and `actions:action`. Read never implies write. All writes and actions conservatively
require approval in this first slice, including privileged actions with opaque names.
High/critical risk, configured approval policies and recognizable privileged reads
also require approval. Observe/recommend/draft workers cannot be promoted into
executors by approval. They need a different reviewed manifest or eligible handoff.

Approval is a persisted PermissionRequest with exact policy/assignment fingerprint,
operator attribution and decision time. It does not grant missing permissions.
Execution entry rechecks current manifest authority and the latest approval. A
manifest change invalidates execution; create a new mission after reconciliation.
Handoff acceptance reevaluates authority and never transfers an earlier approval.
Historical approval records remain unchanged. No side-effect execution is included.
`RUNNING` is an attributed lifecycle report, not proof that a tool actually ran.

## States and commands

Creation yields `UNROUTABLE`, `NEEDS_APPROVAL` or `ASSIGNED`.
`UNROUTABLE`, `FAILED`, `CANCELLED` and `COMPLETED` are immutable terminal states.
A changed capability catalog needs a new mission id rather than rewriting history.

| Current state | Allowed state-changing operation |
| --- | --- |
| NEEDS_APPROVAL | operator approve → ASSIGNED; reject/cancel → CANCELLED |
| ASSIGNED | start → RUNNING; block → BLOCKED; operator cancel |
| RUNNING | block → BLOCKED; propose result → REVIEW; failure → FAILED; handoff → BLOCKED; operator cancel |
| BLOCKED | resume → RUNNING after authority checks; failure → FAILED; handoff; operator cancel |
| REVIEW | operator accepts → COMPLETED; returns changes → BLOCKED; operator cancel |
| Pending handoff | operator accepts target assignment → ASSIGNED or NEEDS_APPROVAL; operator cancel |

Evidence can be attached to RUNNING/BLOCKED/REVIEW. At least one attributed artifact,
all required output evidence kinds, and a nonempty result are needed before REVIEW.
Only an operator can complete review. A rejected review clears the proposed result.
Evidence is an immutable URI + SHA-256 claim, not independently fetched or verified.
Failure stores code, message and retryability; retry scheduling is not implemented.
Handoffs keep origin, target, request and acceptance attribution. Operator acceptance
is explicit; worker authentication/recipient claims belong to Runtime 003.

Every accepted command appends a StateEvent, including same-state evidence events.
No command can directly set COMPLETED or inject an actor/approval flag.

## Persistence

`database/012_tip_runtime_002.sql` adds only `tip_runtime_missions`. It is deliberately
NOT run at startup. No existing tables, data, Registry migration or production DB
were changed. Runtime uses the existing connection pool and database URL resolution.

The table stores a versioned mission/delegation aggregate with immutable evidence,
state events, failures, handoffs, permission decisions and command replay receipts.
A single SQL insert or revision-checked update commits all those records atomically.
No partial evidence/event/delegation writes can succeed independently. One row is
the deliberate smallest coherent persistence boundary, rather than six new ledgers.
Later indexes/projections can normalize the read model without changing ownership.

Mission id provides creation idempotency; differing brief/creator returns 409.
Commands require `command_id` and `expected_revision`; receipts bind the canonical
command and authenticated principal. An exact retry returns the current aggregate
without repeating the event; a different reuse returns 409. Concurrent updates use
compare-and-swap and stale callers reload. Version starts at 1 and increments once
per accepted command. Receipts persist through restart.

Local-memory mode is explicitly ephemeral. A selected durable provider with missing
connection or migration returns an error; Runtime 002 never falls back silently.
Runtime reads/writes are authenticated even in local-memory mode. Storage exceptions
return a generic 503, without raw query or credential disclosure.

Restart tests use real PostgreSQL-compatible PGlite SQL/storage on a temporary disk
directory and fully close/reopen the database. They do not claim validation against
live Neon or a remote Postgres server. No database credentials are needed for tests.

## Contracts

Draft 2020-12 JSON Schema, canonical versioned `$id`, AJV strict validation and URI/
date-time formats are used at catalog/API boundaries and before persistence.
AgentManifest v1 keeps its existing shape and closes the previously open nested
approval-policy object. CapabilityManifest v1 is reused. DelegationEnvelope v1 is
preserved for compatibility; v2 adds authority, nullable assignment and lifecycle
states. New v1 schemas: Mission, Artifact, StateEvent, PermissionRequest,
FailureEvent, HandoffRequest, HandoffPacket and RuntimeCommand.

No active agents/capabilities are invented. Reviewed catalog JSON belongs in
`packages/contracts/agents/` and `packages/contracts/capabilities/`. Both directories
start empty. Seed agents in the organizational snapshot remain explicitly separate
from routable manifest identities. Trusted manifests load at startup; edits require
an API restart and normal code review. No runtime registration endpoint exists.

## API

All routes require the existing `TIP_OPERATOR_SECRET` bearer/header authentication.
Attribution comes from `TIP_OPERATOR_ACTOR`; body-supplied identities are rejected.
No new secret is created or stored. Input bodies are limited to 1 MiB.

| Method | Route | Response |
| --- | --- | --- |
| POST | /v1/runtime/missions | create/replay full mission aggregate |
| GET | /v1/runtime/missions | source-labelled list of HandoffPacket read projections |
| GET | /v1/runtime/missions/:id | full aggregate/audit/evidence |
| POST | /v1/runtime/missions/:id/commands | apply/replay one validated command |
| GET | /v1/runtime/missions/:id/bridge | executive HandoffPacket projection |

Creation returns 200 both first-time and on replay. Invalid contracts return 400,
missing auth 401, authority denial 403, missing mission 404, stale/invalid lifecycle
409, storage unavailable 503. Collection reads are a small single-organization MVP;
pagination and tenant isolation must precede customer-facing SaaS use.

Mission Control adds an authenticated read panel. The operator's existing credential
is held only in component memory and cleared on disconnect; it is not embedded in
build settings or written to browser storage. The panel reports state, owner,
revision, blockers, evidence/handoff/failure counts and review/result. Lifecycle
writes are available through the API; no new mission editor or runner UI is claimed.

## Command Center bridge (interface, not live delivery)

Reconciled against `rc610music/truaxiom` PR #16. The frozen compatibility
baseline for this review is `0d3b53cba1732a7fce9f68502255b3526926126a`
(not certified). An earlier checkpoint,
`515f353634615dea2d08254f2676b8478c8dcaaf`, was current when Runtime 002
was drafted; it is not the current baseline. Source files reviewed:
`command-center/docs/TIP-OPERATIONS-001.md`, `AGENT_COMMS_ARCHITECTURE.md`, and
`server/agent-comms-model.ts`. No Command Center source or deployment was changed.

Command Center's `ops_private` ledger owns tasks, assignment/claims, blockers,
evidence, handoffs and Dot's review. TIP owns mission routing and delegation state.
The bridge is an attributed projection, not a replacement ledger or generic CRM
connector. Command Center's operator-cookie API and service-key agent API are
separate authority boundaries; this branch never impersonates either.

| HandoffPacket field | Command Center consumer meaning |
| --- | --- |
| source + mission_id + delegation_id | stable foreign runtime identity, not a new CC task id |
| project_id | explicit mapping from Registry v1 id to existing ops project id |
| revision | deduplication/ordering for TIP projection, NOT CC checkpoint_version |
| assigned_agent_id | explicit mapping to registered CC agent, not authority to claim |
| state | displayed runtime state; preserve raw state alongside any CC status |
| blockers + failures | linked attributed blocker/failure facts |
| evidence | append references as CLAIMED unless independent verifier upgrades them |
| handoffs | display runtime request/acceptance; never bypass CC owner/recipient rules |
| review_required | highlight runtime approval/review; retain CC requires_dot separately |
| completion_result | provisional in REVIEW; runtime-reviewed in COMPLETED |

Suggested CC display mapping: ASSIGNED→OPEN, RUNNING→IN_PROGRESS,
BLOCKED/NEEDS_APPROVAL/UNROUTABLE/FAILED→BLOCKED, REVIEW→IN_PROGRESS plus Needs Dot,
COMPLETED→COMPLETE plus Needs Dot, CANCELLED→RELEASED. This is a projection proposal,
not a direct status-update command. CC approval is NEVER implied by TIP completion.
CC still requires its own observed/verified evidence, no open task blockers, and
Dot's authenticated review. TIP's SHA-256 claims alone do not satisfy that gate.

A future server-side consumer polls the authenticated mission list/bridge, validates
HandoffPacket, explicitly maps project+agent ids and upserts by foreign identity.
Ignore already-applied or older revisions. Advance its cursor only after its own
checkpoint-protected transaction succeeds. Do not reuse TIP revision as CC checkpoint,
automatically dispatch privileged actions, or store CC credentials in Mission Control.
Retries use stable `(TIP, delegation_id, revision, operation)` keys and must obey CC's
existing assignment, ownership, checkpoint and Dot-review rules. Unknown mappings
are visible blockers. No outbound HTTP, sync worker, outbox or automatic publication
is implemented in Runtime 002; that is the next integration increment.

## Owner boundaries and Runtime 003

Before a real mission: review this PR, authorize applying 012 to a development Neon
branch, and approve actual agent/capability manifests with explicit scope/grants.
Production migration/deploy/merge remain separately unauthorized.

Runtime 003 should add one least-privilege authenticated worker with claim/lease,
heartbeat, deadline and retry recovery; one real read-only capability executor;
verified artifact storage/verification; and an idempotent CC candidate-side projection
consumer using explicit mappings and existing ledger APIs. Add authenticated recipient
handoff acceptance, durable policy administration, operator write UI and live Neon
integration tests. Keep SaaS tenants, billing, production promotion and generalized
AI autonomy outside that first worker slice.
