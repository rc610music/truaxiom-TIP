# Isolated worker and delivery heartbeat

This is a composition of Runtime 002/003, Taxis routing, the repository
inspector, and the existing Command Center delivery queue. It does not add a
runtime, registry, delegation protocol, message bus, or scheduler.

The missing link was that mission routing, leased inspection, durable delivery,
and an independent recheck existed as separate suites. Nothing ran one governed
mission through worker execution and delivery, then reread the stored records
from a fresh runtime handle.

`runGovernedHeartbeat` is that path. It accepts only the pinned read-only
`repository.inspect` mission for `rc610music/truaxiom-TIP`, only an operator,
and only `development` delivery mappings. Preview and production targets are
rejected. The worker remains `AGENT-REPOSITORY-INSPECTOR`. Operator review is
an explicit command; the worker cannot complete the mission. A second call
after `COMPLETED` or `FAILED` does not inspect or publish again.

`recheckGovernedHeartbeat` ignores the dispatcher return value. It rereads the
mission, stored report, delivery rows, and ledger commit markers.

The controlled condition is not a PIE dispatch. PIE proposal dispatch stays
disabled in Command Center. The live proof reads public GitHub metadata with
GET and publishes only to an in-process development ledger. It does not call
the Command Center candidate host.

Run the deterministic suite with `npm run test:runtime-heartbeat`. Run the
live read with `npm run prove:runtime-heartbeat`. The live observation, when
it succeeds, is `docs/evidence/runtime-heartbeat-20261025.json`.

Still not proven: a PIE finding creating this mission, delivery to the live
Agent Comms ledger, a deployed development host restart, external agent wake
endpoints, and Dot approval. The packet keeps
`independent_verification` as `NOT_RECORDED`.
