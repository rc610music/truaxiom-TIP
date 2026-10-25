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
disabled in Command Center. `npm run prove:runtime-heartbeat` reads public
GitHub metadata with GET and publishes to an in-process development ledger.
It does not call the Command Center candidate host.

`npm run prove:agent-comms-heartbeat` keeps that same mission and worker, then
publishes the persisted packet through the existing Agent Comms HTTP
dispatcher on a loopback process and a disposable `ops_private` database. The
named recipient acknowledges the commit message. A restarted process rereads
the task by id, and the recovered packet and evidence hashes must match TIP.
The candidate Render host is still not contacted.

After that reread, `recordIndependentVerification` stores one observer row in
`tip_runtime_independent_verifications`. The observer is neither the worker
nor the operator who completed the mission. The row does not change the
mission revision or the executor packet. That packet keeps
`independent_verification` as `NOT_RECORDED`. The lifecycle projection can say
`RECORDED` while Dot approval, finding resolution, and PIE dispatch stay
closed.

Run `npm run test:runtime-heartbeat` and
`npm run test:independent-verification` for the deterministic suites. The
Agent Comms observation, when it succeeds, is
`docs/evidence/agent-comms-heartbeat-20261025.json`.

Still not proven: a PIE finding creating this mission, delivery to the live
candidate ledger, Command Center's runtime read model still projecting
independent verification as `NOT_RECORDED`, a deployed development host
restart, external agent wake endpoints, and Dot approval.
