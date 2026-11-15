import { reconcile } from "./upstream-pie-contract.ts";
import { MissionRuntime } from "../../packages/core/src/missionRuntime.ts";
import { createInMemoryMissionRepository } from "../../packages/core/src/missionRepository.ts";
export const dot = { actor: "DOT", role: "operator" };
export const worker = { actor: "FIXTURE", role: "agent" };
export const capability = "non_prod_health_remediation";
export const manifest = {
  schemaVersion: "truaxiom-app-manifest-v1",
  projectId: "PRJ-TIP",
  productId: "PROD-TIP",
  name: "Fixture",
  description: "Disposable test target",
  source: {
    provider: "github",
    repository: "rc610music/truaxiom-TIP",
    ref: "main",
    path: "",
    manifestPath: null,
  },
  deployments: [
    {
      id: "fixture",
      surface: "candidate",
      url: "https://fixture.example.com",
      healthPath: "/health",
      buildPath: "/build",
    },
  ],
  domains: [],
  capabilities: [],
  dependencies: [],
  tip: { registry: true, integrationPoints: [] },
};
export const at = (min) =>
  new Date(Date.parse("2026-11-15T12:00:00Z") + min * 60000).toISOString();
export function observation(previous, min) {
  const evidence = [
    ["health", "health.fixture.ok", "/health", false],
    ["health", "health.fixture.identity", "/health", "PRJ-TIP"],
    ["deployment", "deployment.fixture.sha", "/build", "a".repeat(40)],
  ].map(([kind, key, path, value]) => ({
    kind,
    key,
    source: "https://fixture.example.com" + path,
    status: "verified",
    observedAt: at(min),
    value,
  }));
  return reconcile(
    manifest,
    evidence,
    previous,
    at(min),
    "PRJ-TIP/development/fixture",
  );
}
export function setup() {
  const repository = createInMemoryMissionRepository();
  const catalog = {
    agents: [
      {
        agent_id: "FIXTURE",
        name: "Fixture",
        version: "1.0",
        owner: "ORG-TRUAXIOM",
        role: "research",
        description: "Test only",
        objectives: ["Test"],
        scope: ["PRJ-TIP"],
        exclusions: [],
        lifecycle_state: "active",
        capabilities: [capability],
        tools: [],
        data_sources: [],
        memory_policy: { allowed_scopes: ["run"], retention: "mission" },
        permissions: { read: [], write: [], actions: ["fixture-recover"] },
        approval_policy: { default_tier: "execute", approval_required_for: [] },
        triggers: [],
        workflows: [],
        output_contracts: ["recovery-report"],
        escalation_policy: "operator",
        observability_policy: ["events"],
        dependency_versions: {},
        tags: ["test-only"],
      },
    ],
    capabilities: [
      {
        capability_id: capability,
        name: "Fixture recovery",
        version: "1.0",
        description: "Test only",
        inputs: [],
        outputs: ["recovery-report"],
        required_permissions: ["actions:fixture-recover"],
        risk_tier: "low",
        tags: [],
      },
    ],
  };
  const runtime = new MissionRuntime(repository, catalog, () => at(31));
  const intel = [0, 10, 20, 30].reduce(observation, null);
  const binding = {
    projectId: "PRJ-TIP",
    environment: "development",
    deploymentId: "fixture",
    endpoint: "https://fixture.example.com/health",
    capabilityId: capability,
    permission: "actions:fixture-recover",
    active: true,
    actionClass: "A3",
    reversible: true,
  };
  const input = {
    runtime,
    row: { manifest, intelligence: intel },
    binding,
    now: at(30),
  };
  return { runtime, repository, input, catalog };
}
