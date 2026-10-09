# TIP Runtime 003: leased read-only execution and ledger projection

Continues Runtime 002 on `codex/tip-runtime-001`, PR #8. No replacement registry,
task system, database platform or Command Center implementation was introduced.

## Operational boundary

The opt-in `TIP_RUNTIME_CATALOG=repository-inspection` loads one implemented
active agent and capability: `AGENT-REPOSITORY-INSPECTOR` / `repository.inspect`.
Its only grant is `read:github:rc610music:truaxiom-TIP`. The default catalog stays
empty. Inputs declare that exact repository and a ref. The worker pins a commit
SHA, reads the Git tree and check-run metadata, and stores a report. It never
executes source code or claims to have run the reported CI jobs itself.

An agent must claim a durable lease before execution. Claim and heartbeat recheck
current manifest authority, permission namespaces, policy fingerprint, executing
autonomy and scoped approval. CAS revision updates allow one claimant. Expiry,
epoch and an unpredictable token fence stale workers. Expired leases require a
new claim; heartbeat cannot resurrect them. Pending handoffs prevent claims.
Operator cancellation remains available during a lease. Agent mutation requires
the current lease; agents cannot approve or review their own work. A recipient
may accept its pending handoff, after which governance is evaluated again.

The worker reads only the fixed GitHub host/repository using GET, rejects redirects,
bounds responses and timeouts, and rejects malformed responses. Provider failures
produce attributed FAILED events without raw provider error text. A duplicate
runner cannot fail an existing lease holder. Expired/interrupted work may be
reclaimed; failed terminal missions require a new mission in this slice.

Reports are canonical JSON, SHA-256 addressed and capped at 512 KiB. Attachment
checks mission, kind, URI and content hash. The server sets HASH_VERIFIED; clients
cannot self-assert it. Every required leased output needs stored verified evidence
before REVIEW. Hash verification proves bytes and provenance binding, not semantic
correctness. REVIEW still requires explicit operator acceptance before COMPLETED.

## Persistence and contracts

Runtime 002's `tip_runtime_missions` aggregate continues to atomically commit the
delegation, state events, approval requests, evidence references, failures,
handoffs, leases and idempotency receipts. Revision saves must increment exactly
once. Migration `013_tip_runtime_artifacts.sql` adds a content-addressed report
table with a mission foreign key. Artifact upload precedes attachment, so interrupted
uploads may leave unreferenced reports; no evidence is inferred from those rows.
There is no automatic DDL or destructive migration.

Existing v1 Mission and RuntimeCommand schemas gain optional repository inputs,
claim/heartbeat commands and lease tokens. Artifact v1 gains a server-attributed
verification level. New `stored-runtime-artifact/v1` validates persisted report
envelopes. Existing AgentManifest, CapabilityManifest, DelegationEnvelope v2,
StateEvent, PermissionRequest, HandoffRequest, FailureEvent and HandoffPacket
contracts are reused. Undeclared fields and authority remain denied.

## API and operator surface

Existing authenticated operator create/read/command/bridge endpoints remain.
Added:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/runtime/worker/missions` | Only assigned or pending-recipient missions |
| GET | `/v1/runtime/worker/missions/:id` | Redacted lease/receipt read |
| POST | `/v1/runtime/worker/missions/:id/commands` | Bound agent identity and fenced mutations |
| POST | `/v1/runtime/worker/missions/:id/artifacts` | Current lease report upload |
| GET | `/v1/runtime/missions/:id/artifacts/:sha256` | Operator retrieval of attached report |

Worker authentication uses host-provided SHA-256 credential digests in
`TIP_WORKER_CREDENTIAL_DIGESTS`; this release generates/stores no bearer keys.
Unconfigured worker/operator authentication fails closed. Mission Control can
inspect stored reports with its existing in-memory operator credential.
`scripts/run-repository-mission.mjs` executes the read-only worker locally against
an explicitly selected development database. No polling daemon or autonomous
production runner is installed.

## Command Center bridge

`synchronizeRuntimePacket` publishes through existing Agent Comms `/tasks`,
`/evidence`, `/messages` and `/projects/:id` APIs. Project mapping and development
environment are explicit. Stable hashed IDs, current Command Center checkpoints,
ledger reads and final packet commit markers support interrupted-write recovery,
replay suppression and rejection of conflicting/older TIP revisions. Exact packets
are split into bounded message parts, preserving identities, assignment, states,
blockers, failures, handoffs, review and completion result.

Command Center retains its own task ownership and workflow. The bridge's task
stays OPEN pending executive handling; it does not assign an unknown inspector
identity, accept an executive handoff, clear blockers, complete a Command Center
task or perform Dot review. TIP state appears in attributed packet messages.
Evidence is published as CLAIMED, with the TIP hash-verification attribution in
its summary. All bridge writes carry `requires_dot:true` and
`authority_type:DOT_APPROVAL`, including TIP-completed missions.

The HTTP adapter pins the candidate host and rejects redirects. Run
`node --import tsx scripts/sync-runtime-command-center.mjs <exported-packet.json>`
with explicit `TIP_SOURCE_PROJECT_ID`, `TIP_CC_PROJECT_ID`, and an authorized
host-supplied `TIP_CC_EXISTING_TOKEN`. No credential is written to disk.

This is an explicit synchronization adapter, not a background outbox. Writes
conflicting with an executive checkpoint stop safely; rerun after reading current
state. The exact candidate model at Command Center PR #16 head
`515f353634615dea2d08254f2676b8478c8dcaaf` was exercised locally without copying it
into TIP. Real candidate delivery remains blocked on credential authorization.

## Development proof and limits

See `docs/evidence/runtime-003-development-proof.json`. Isolated Neon branch
`br-small-pond-ar3y2w0l` in `tip-core` received migrations 012 and 013 only.
Mission `MISSION-REPO-INSPECT-20261009-002` reached COMPLETED at revision 7 after
ChatGPT Work reviewed the actual pinned GitHub report. It observed 163 file paths
and three successful existing check runs at Runtime 002 commit `59959a0`.
Dot approval was not inferred. An earlier transport attempt remains honestly FAILED.

The live proof used fresh remote SQL reads through the Neon connector and a new
runtime instance because direct sandbox Postgres DNS failed. Automated PGlite
tests additionally close/reopen disk storage. This is not a deployed-service
restart or production connection proof. Local tests use named fixtures; the live
report used actual GitHub metadata and remote Neon persistence.

Nothing was merged to main, manually deployed to production, or written to the
production database. The frozen Command Center build, DNS and secrets are untouched.

Next scope: authorize a development service identity and candidate project mapping,
verify actual HTTP delivery and a deployed development restart, then add a durable
delivery scheduler/outbox, bounded retries and reconciliation. Add further workers
only with explicit capabilities and authority; production release remains a separate
Dot decision.
