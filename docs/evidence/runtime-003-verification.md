# Runtime 003 verification and change inventory

Development continuation of Runtime 002 commit `59959a0fccc34503a89950f20724d9bd34559cd2`, same branch and draft PR #8.

## Exact checks

| Check | Result |
|---|---|
| `npm run test:runtime-001` | PASS: Taxis assertions and foundation schemas |
| `npm run test:runtime-002` | 34 passed; 0 failed, skipped or cancelled |
| `npm run test:runtime-003` | 24 passed; 0 failed, skipped or cancelled |
| `npm run typecheck` | PASS: API, Mission Control, core and types |
| `npm run test:postgres-adapter` | PASS |
| `npm run test:registry` | PASS |
| `npm run test:safety-stack` | PASS: operator gate, approved content, RootWork workflow and approval tasks |
| `npm run check:foundation` | PASS: structure, foundation contracts and Mission Control preview build |
| `npm run build:api` | PASS |
| `npm run build:mission-control-preview` | PASS |
| `npm run test:api` | PASS: all existing smoke routes and review write loop |
| `npm run lint` | PASS (no workspace lint script exists; typecheck and tests provide validation) |
| `git diff --check` | PASS |
| Actual candidate Agent Comms ledger model | PASS: task, evidence, packet parts, commit marker and duplicate suppression; Dot gate retained |
| Actual GitHub + Neon development mission | COMPLETED revision 7; report and aggregate recovered through a new runtime and fresh remote SQL reads |

The candidate model integration was an additional temporary harness using fetched
Command Center source. The frozen compatibility baseline is
`0d3b53cba1732a7fce9f68502255b3526926126a`. The harness originally used earlier
checkpoint `515f353634615dea2d08254f2676b8478c8dcaaf`.
It did not send candidate requests or modify Command Center. The reusable four
bridge tests are committed; no external model copy was added to TIP.

The 20 worker tests include persistent close/reopen, competing claims, stale leases,
heartbeat expiry, authorization revocation, required stored evidence, malformed
provider responses, recipient handoff acceptance, operator cancellation, evidence
retrieval, failure recording, bounded repository access, worker authentication and
explicit review. Existing Runtime 002 tests were retained unchanged.

The live run proves repository metadata inspection and remote development persistence.
It does not prove code execution, live candidate synchronization, production health,
production deployment, or a deployed service restart. The report describes these
limits and records ChatGPT Work review separately from Dot approval.

## Exact files changed in this continuation

- `.github/workflows/ci.yml`
- `apps/api/src/missionRuntimeApi.ts`
- `apps/api/src/persistence.ts`
- `apps/api/src/runtimeWorkerApi.ts`
- `apps/api/src/server.ts`
- `apps/mission-control/src/RuntimeMissions.tsx`
- `database/013_tip_runtime_artifacts.sql`
- `docs/architecture/TIP-RUNTIME-003.md`
- `docs/evidence/runtime-003-development-proof.json`
- `docs/evidence/runtime-003-verification.md`
- `package.json`
- `packages/contracts/runtime-003/agents/repository-inspector.json`
- `packages/contracts/runtime-003/capabilities/repository-inspection.json`
- `packages/contracts/schemas/artifact.schema.json`
- `packages/contracts/schemas/mission.schema.json`
- `packages/contracts/schemas/runtime-command.schema.json`
- `packages/contracts/schemas/stored-runtime-artifact.schema.json`
- `packages/core/src/commandCenterRuntimeBridge.ts`
- `packages/core/src/index.ts`
- `packages/core/src/missionRepository.ts`
- `packages/core/src/missionRuntime.ts`
- `packages/core/src/missionRuntimeTypes.ts`
- `packages/core/src/repositoryInspector.ts`
- `packages/core/src/runtimeArtifactRepository.ts`
- `packages/core/src/runtimeContracts.ts`
- `scripts/run-repository-mission.mjs`
- `scripts/sync-runtime-command-center.mjs`
- `scripts/test-command-center-runtime.mjs`
- `scripts/test-runtime-worker.mjs`
