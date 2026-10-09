# TIP → Command Center durable delivery v1

Continuation of Runtime 002–003 on the existing development branch and draft PR #8.
This closes the gap between a saved mission update and its later publication to
the existing Command Center Agent Comms ledger. No Command Center source or
production deployment was changed.

## Atomic boundary and authority

An explicitly mapped mission save uses one Postgres statement: a revision-CAS
mission insert/update and dependent outbox insert in data-modifying CTEs. Both
commit or both roll back. A stale revision inserts no packet. The queue stores the
exact existing HandoffPacket and a versioned, strict development/preview target
mapping. Missions without a mapping save normally and publish nothing.

Memory preview has the same save/queue behavior but remains ephemeral. Configured
durable persistence without a database fails closed. No startup DDL or separate
database pool is introduced. Manual additive migration
`014_tip_runtime_deliveries.sql` adds the queue and retry history beside existing
mission/artifact tables. The database stores no bearer delivery credential.

Mappings use `runtime-delivery-mapping/v1` and require explicit TIP project,
Command Center project and environment. Unknown fields, ambiguous project targets
and production environments are denied. The shared `runtimeHandoffPacket`
function serves API reads, manual exports and queue records, avoiding parallel
projection definitions.

## Delivery lifecycle

`PENDING → DELIVERING → DELIVERED` with `PAUSED` for permanent failures or exhausted
retries. Atomic claims use `FOR UPDATE SKIP LOCKED`; live attempts carry a random
fencing token and a 120-second lease. Each external ledger operation renews the
lease first. An expired owner cannot finish or record failure for a reclaimed row.
Unfinished work is reclaimed after expiry. A later revision of the same mission
and target cannot overtake an earlier undelivered revision, including a paused one.

Network errors, HTTP 408/409/429 and server errors retry with bounded exponential
backoff. Authentication, missing-project and validation failures pause. Eight
failed attempts pause; repeated crashes cannot bypass that budget. Storage faults
leave the row recoverable by lease expiry. Diagnostic codes exclude remote error
text and credentials. Operator requeue records actor and time in retry history.

Delivery is **at least once**, not a distributed exactly-once transaction. The
existing bridge's stable IDs, ledger reads, packet parts and final commit markers
recover uncertain writes without adding duplicate records. A ledger commit can
precede local acknowledgment; replay reconciles it. No queue status changes a
mission's execution authority, approval, assigned agent or completion status.

The bridge continues to mark records `requires_dot:true / DOT_APPROVAL`, publish
evidence as attributed CLAIMED, and preserve TIP state inside packet messages.
It neither grants authority to a Command Center agent nor completes/reviews its
tasks. The HTTP destination remains the fixed candidate host with redirects denied.

## API, UI and activation

| Method | Endpoint | Behavior |
|---|---|---|
| GET | `/v1/runtime/deliveries` | Existing operator auth; status, attempts, diagnostics and retry history; lease tokens removed |
| POST | `/v1/runtime/deliveries/:delivery_id/retry` | Existing operator auth; empty object body; paused row requeued with operator attribution; repeated pending request is harmless |

Mission Control displays delivery states alongside its existing runtime surface.
Worker credentials cannot read or requeue this operator-only endpoint.

Host configuration, deliberately **not activated** in this checkpoint:

- `TIP_COMMAND_CENTER_PROJECT_MAPPINGS`: JSON array of approved v1 mappings.
- `TIP_RUNTIME_DELIVERY_ENABLED=true`: enables one bounded attempt every 10 seconds
  while the development API is awake. Defaults to off; invalid flag values fail.
- `TIP_ENV=development`, a configured durable database, and nonempty mappings are
  required. Production or memory-preview scheduling is refused.
- `TIP_CC_EXISTING_TOKEN`: authorized host-supplied candidate credential. No key
  is created, retrieved, persisted or exposed by this change.

Graceful shutdown stops scheduling and waits for the current attempt before
closing the existing pool. Render free-service sleep still stops scheduling;
there is no always-on-service or billing claim. A resumed process recovers leases.

Existing mission history is not retroactively published. Approved mappings affect
future saves; the existing manual packet export/synchronization script remains
available for a deliberate historical publication. A broader reconciliation/backfill
policy and customer isolation are subsequent platform work.

## Verification checkpoint

- 11 new automated tests pass: atomic persistence/rollback, CAS, duplicate suppression,
  retry/backoff, pause/requeue, concurrency, stale fencing, mapping restrictions,
  redacted operator authentication, unavailable database and disk close/reopen.
- Existing Runtime 002 (34) and Runtime 003 (24) tests pass unchanged.
- Existing Runtime 001, Postgres adapter, registry, safety stack, API loop,
  foundation checks, workspace typecheck and builds pass.
- Migration 014 applied only to verified non-primary/non-default Neon development
  branch `br-small-pond-ar3y2w0l` (`tip-core`). The original completed mission is
  still COMPLETED at revision 7. Delivery count is zero because no live project
  mapping or service credential was invented.
- Latest Command Center candidate deployment independently checked via Render:
  `dep-db405un5jdgc73docvug`, commit `515f353634615dea2d08254f2676b8478c8dcaaf`.
  Public `/health` returned 200 with the same commit and process-liveness scope.

Still awaiting owner configuration: authorized candidate service identity and
project/environment mapping, then deploy/verify the separate development runtime
and perform a real delivery. No production migration, DNS edit, frozen-build change,
main merge, new stored secret or GrokBot involvement occurred.
