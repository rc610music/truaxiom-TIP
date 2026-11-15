import { createHash } from "node:crypto";
import { canonicalJson, RuntimeError } from "./runtimeContracts";
import type { MissionRuntime } from "./missionRuntime";
import type { MissionInput, MissionRecord } from "./missionRuntimeTypes";

/** Structural input from the existing PIE read model; this module never observes,
 * reconciles, approves, executes or resolves a finding. Call only from a trusted
 * server-side composition with Registry/Policy-owned bindings, never client JSON. */
export interface PieRecoverySource {
  manifest: {
    projectId: string;
    productId: string;
    source: object;
    deployments: {
      id: string;
      surface: string;
      url: string;
      healthPath: string;
      buildPath: string | null;
    }[];
  };
  intelligence: {
    projectId: string;
    checkedAt: string;
    conflicts: string[];
    facts: Record<
      string,
      {
        value: unknown;
        source: string;
        observedAt: string;
        status: string;
        conflict?: boolean;
        evidenceRef?: string;
      }
    >;
    healthFailureEpisode?: {
      binding: string;
      environment: string;
      deploymentId: string;
      build: string;
      lastReadAt: string;
      streak: {
        count: number;
        startedAt: string;
        lastAt: string;
        firstEvidenceRef: string;
        lastEvidenceRef: string;
      } | null;
      finding: {
        id: string;
        openedAt: string;
        meetsFailureThreshold: boolean;
      } | null;
    };
  } | null;
}
export interface RecoveryBinding {
  projectId: string;
  environment: string;
  deploymentId: string;
  endpoint: string;
  capabilityId: string;
  permission: string;
  active: boolean;
  actionClass: string;
  reversible: boolean;
}
const hash = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
// PIE v1 uses a different canonical encoding from runtime packets. Preserve its
// wire fingerprint exactly; runtime packet hashes continue using canonicalJson.
function pieStable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(pieStable));
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, pieStable(v)]),
    );
  return JSON.stringify(value);
}
const pieHash = (v: unknown) =>
  createHash("sha256").update(pieStable(v)).digest("hex");
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuntimeError(409, message);
}

/** Proposal identity is one mission per PIE finding episode. Runtime CAS and its
 * permission request provide persistence and idempotency; no parallel task store. */
export function preparePieRecoveryMission(input: {
  row: PieRecoverySource;
  binding: RecoveryBinding;
  now: string;
}): MissionInput | null {
  const { row, binding: b, now } = input;
  const m = row.manifest,
    intel = row.intelligence;
  demand(
    ["development", "preview"].includes(b.environment),
    "Non-production environment required",
  );
  demand(
    b.projectId === m.projectId &&
      b.active &&
      b.actionClass === "A3" &&
      b.reversible &&
      b.capabilityId === "non_prod_health_remediation" &&
      /^actions:[A-Za-z0-9._:-]+$/.test(b.permission),
    "Active reversible A3 capability binding required",
  );
  const d = m.deployments.find(
    (d) => d.id === b.deploymentId && d.surface === "candidate",
  );
  demand(
    d?.buildPath && new URL(d.healthPath, d.url).href === b.endpoint,
    "Registered target mismatch",
  );
  if (!intel) return null;
  const age = Date.parse(now) - Date.parse(intel.checkedAt);
  demand(
    Number.isFinite(age) &&
      age >= 0 &&
      age <= 15 * 60_000 &&
      !intel.conflicts.length &&
      intel.projectId === m.projectId,
    "Fresh conflict-free PIE observation required",
  );
  const e = intel.healthFailureEpisode;
  if (!e) return null;
  demand(
    e.binding ===
      `sha256:${pieHash([m.projectId, m.productId, b.environment, m.source, d])}` &&
      e.environment === b.environment &&
      e.deploymentId === d.id &&
      e.lastReadAt === intel.checkedAt,
    "PIE registration binding changed",
  );
  const health = intel.facts[`health.${d.id}.ok`],
    identity = intel.facts[`health.${d.id}.identity`],
    build = intel.facts[`deployment.${d.id}.sha`];
  for (const [fact, endpoint] of [
    [health, b.endpoint],
    [identity, b.endpoint],
    [build, new URL(d.buildPath, d.url).href],
  ] as const) {
    demand(
      fact?.status === "verified" &&
        !fact.conflict &&
        fact.observedAt === intel.checkedAt &&
        fact.source === endpoint &&
        /^sha256:[a-f0-9]{64}$/.test(fact.evidenceRef ?? ""),
      "Fresh target evidence required",
    );
  }
  demand(
    identity.value === m.projectId &&
      build.value === e.build &&
      /^[a-f0-9]{40}$/.test(e.build),
    "Target identity/build mismatch",
  );
  if (
    health.value !== false ||
    !e.finding ||
    !e.streak ||
    !e.finding.meetsFailureThreshold
  )
    return null;
  demand(
    e.streak.count >= 3 &&
      Date.parse(e.streak.lastAt) - Date.parse(e.streak.startedAt) >=
        30 * 60_000 &&
      e.streak.lastAt === intel.checkedAt,
    "Failure persistence gate not met",
  );
  const missionId = `PIE-${hash([m.projectId, b.environment, e.finding.id])}`;
  // Bind the complete operation, registration and episode into immutable mission
  // constraints. Replays with changed authority fail runtime idempotency checks.
  return {
    schema_version: "1.0",
    mission_id: missionId,
    project_id: m.projectId,
    title: "PIE proposed non-production health recovery",
    capability_id: b.capabilityId,
    required_permissions: [b.permission],
    risk_tier: "high",
    constraints: [
      canonicalJson({
        action_class: "A3",
        binding: b,
        registration: e.binding,
        finding: e.finding.id,
        build: e.build,
      }),
      "Explicit Dot approval required; handoff transfers no authority.",
      "Only the bound reversible operation; no production, deploy, DNS, source, credentials, Registry writes, scaling, configuration edits or data deletion.",
      "Mission completion cannot resolve a finding; fresh independent PIE verification required.",
    ],
    evidence_required: ["recovery-report"],
  };
}

export async function proposePieRecovery(input: {
  runtime: MissionRuntime;
  row: PieRecoverySource;
  binding: RecoveryBinding;
  now: string;
}): Promise<MissionRecord | null> {
  const mission = preparePieRecoveryMission(input);
  return mission
    ? input.runtime.create(mission, { actor: "PIE", role: "operator" })
    : null;
}
