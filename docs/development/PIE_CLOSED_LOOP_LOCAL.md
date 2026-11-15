# PIE Closed Loop 001: local integration proof

The isolated integration branch now composes the existing PIE reconciler, governed
TIP mission runtime, execution lease, artifact storage, durable delivery queue,
Agent Comms packet bridge, and a separate PIE health outcome. No second runtime,
approval system, registry, scheduler, or dashboard is introduced.

The recovery worker accepts only a trusted server-side operation adapter matching
the immutable A3 binding. It claims the existing policy-bound lease after DOT
approval, records a hashed recovery attempt, and stops at REVIEW. Technical review
can complete the mission; it does not resolve the finding.

The observer first rereads terminal execution evidence and its committed ledger
packet. Only then does it request a new PIE observation of the same registration,
project, health endpoint and build, after completion. It stores the full observation
as a separate hashed artifact and an append-only PIE outcome in the existing
runtime database. The executor packet remains unchanged. Healthy becomes
VERIFIED_RESOLVED; unhealthy becomes STILL_FAILING. Missing or stale evidence cannot
produce either outcome.

## Reproduce

Run `npm ci`, then `npm run test:pie-runtime-bridge` and
`npm run test:pie-closed-loop`.

To write a fresh, inspectable proof packet:

```bash
TIP_PIE_PROOF_OUTPUT=docs/evidence/pie-closed-loop-local-20261115.json npm run prove:pie-closed-loop
```

The proof file contains the executor packet, execution artifact, independent
observation artifact, correlated outcome and restart checks. The test removes its
disposable database and HTTP target afterwards.

## Existing API integration

Authenticated `GET /v1/runtime/missions/:missionId/pie` returns the read projection
and stored independent observation. It uses the existing operator authentication;
POST cannot set a finding outcome. Persistence is wired into the existing Postgres
API runtime. A missing migration returns storage unavailable, rather than falling
back to a fabricated verified result. Local-memory mode does not pretend to have
durable verification storage.

Migration `database/016_pie_finding_verifications.sql` is additive and manual.
Nothing applies it to a hosted database or enables dispatch at startup.

## What this proves

The local harness uses actual HTTP GETs against a disposable loopback health/build
target and a pinned test-only copy of the existing PIE reconciler. It proves the
failure persistence gate, one proposal, approval/rejection, bounded-operation
binding, existing execution lease, hashed evidence, terminal packet publication,
fresh independent health observation, immutable completion packet, durable result
across database reopen, and authenticated read projection.

Regression coverage includes still-unhealthy completion, rejection, missing
publication/evidence, lost packet parts, stale observations, executor
self-verification, mismatched operations, failed operations and competing workers.
The preceding bridge tests also cover production and capability/registration drift.

## Remaining acceptance limits

- Observation time is accelerated; this is not a real 30-minute scheduling soak.
- DOT approval is a simulated test principal, not live approval by Dot.
- The ledger transport is an in-process adapter exercising the real delivery
  worker and packet validator, not the live Agent Comms HTTP service.
- The recovery operation changes disposable fixture state. A hosted target still
  needs a reviewed, bounded, reversible, idempotent adapter with an enforced
  build precondition and a trusted Policy/Registry binding loader.
- Deployed PIE does not yet call this bridge. No hosted migration, recovery
  catalog installation, dispatch activation, or deployment occurred.
- Command Center has a read API projection; its frontend is not wired to it yet.

Issue #16 remains open. A local passing proof does not close the deployed
acceptance gate or advance the Manifest/self-registration milestone.
