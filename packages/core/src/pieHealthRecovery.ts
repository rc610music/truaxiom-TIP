import { runtimeHandoffPacket } from "./runtimePacket";
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, RuntimeError } from "./runtimeContracts";
import {
  artifactHash,
  type ArtifactRepository,
} from "./runtimeArtifactRepository";
import type { MissionRuntime } from "./missionRuntime";
import type {
  MissionRecord,
  RuntimeCommand,
  RuntimePrincipal,
} from "./missionRuntimeTypes";
import {
  preparePieRecoveryMission,
  type PieRecoverySource,
  type RecoveryBinding,
} from "./pieRuntimeBridge";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
import type { RuntimeDeliveryRepository } from "./runtimeDeliveryRepository";
import {
  recoverLatestCommittedPacket,
  type CommandCenterTransport,
} from "./commandCenterRuntimeBridge";

const hash = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuntimeError(409, message);
}
type Payload<T> = T extends unknown
  ? Omit<T, "command_id" | "expected_revision">
  : never;

export interface BoundHealthOperation {
  binding: RecoveryBinding;
  /** Trusted server adapter only. Must be bounded, reversible and idempotent for
   * this key, including a crash after mutation but before evidence persistence.
   * No operation code, URLs or authority may be supplied by an HTTP client. */
  execute(input: {
    idempotencyKey: string;
    expectedBuild: string;
  }): Promise<void>;
}

/** Reuses the existing runtime lease, policy recheck, artifacts and review gate.
 * Does not approve or complete a mission and never declares target recovery. */
export async function runBoundHealthRecovery(input: {
  runtime: MissionRuntime;
  artifacts: ArtifactRepository;
  missionId: string;
  row: PieRecoverySource;
  binding: RecoveryBinding;
  operation: BoundHealthOperation;
  worker: RuntimePrincipal;
  now: () => string;
}): Promise<MissionRecord> {
  const {
    runtime,
    artifacts,
    missionId,
    row,
    binding,
    operation,
    worker,
    now,
  } = input;
  let current = await runtime.get(missionId);
  const expected = preparePieRecoveryMission({ row, binding, now: now() });
  demand(
    expected && canonicalJson(current.mission) === canonicalJson(expected),
    "Current PIE finding and mission binding required",
  );
  demand(
    canonicalJson(operation.binding) === canonicalJson(binding),
    "Operation target binding mismatch",
  );
  demand(
    worker.role === "agent" &&
      worker.actor === current.delegation.assigned_agent_id,
    "Assigned recovery worker required",
  );
  demand(
    current.permissionRequests.at(-1)?.status === "APPROVED" &&
      current.permissionRequests.at(-1)?.decided_by === "DOT",
    "Explicit Dot approval required",
  );
  if (["REVIEW", "COMPLETED"].includes(current.delegation.status))
    return current;
  const attempt = randomUUID();
  let token: string | undefined;
  async function apply(payload: Payload<RuntimeCommand>) {
    current = await runtime.command(
      missionId,
      {
        ...payload,
        command_id: `RECOVERY:${attempt}:${current.revision}`,
        expected_revision: current.revision,
        ...(token ? { lease_token: token } : {}),
      },
      worker,
    );
    return current;
  }
  // Claim is outside catch: a duplicate worker cannot fail another lease owner.
  await apply({ type: "claim", attempt_id: attempt, ttl_seconds: 120 });
  token = current.lease!.token;
  try {
    await operation.execute({
      idempotencyKey: missionId,
      expectedBuild: row.intelligence!.healthFailureEpisode!.build,
    });
    // Fence stale workers before attaching results, including expired leases.
    await apply({ type: "heartbeat", ttl_seconds: 120 });
    const sha = await artifacts.put({
      schema_version: "1.0",
      mission_id: missionId,
      kind: "recovery-report",
      content: {
        binding_sha256: hash(binding),
        registration: row.intelligence!.healthFailureEpisode!.binding,
        finding_id: row.intelligence!.healthFailureEpisode!.finding!.id,
        build: row.intelligence!.healthFailureEpisode!.build,
        operation_key: missionId,
        recorded_at: now(),
        result: "ATTEMPTED",
        verification: "NOT_RECORDED",
      },
    });
    await apply({
      type: "evidence",
      artifact_id: `RECOVERY:${current.lease!.epoch}`,
      kind: "recovery-report",
      uri: `urn:tip:artifact:${sha}`,
      sha256: sha,
      summary:
        "Bound reversible operation attempted; independent PIE health verification pending",
    });
    return await apply({
      type: "transition",
      state: "REVIEW",
      reason: "Bound recovery attempt finished; technical review required",
      result:
        "Operation attempted; target health is not verified by the executor.",
    });
  } catch {
    await apply({
      type: "failure",
      failure_id: `RECOVERY-FAILED:${current.lease!.epoch}`,
      code: "RECOVERY_UNAVAILABLE",
      message: "Bound recovery unavailable; operator review required",
      retryable: false,
    });
    throw new RuntimeError(502, "Bound recovery unavailable");
  }
}

export interface PieFindingVerification {
  schema_version: "1.0";
  verification_id: string;
  mission_id: string;
  finding_id: string;
  project_id: string;
  environment: string;
  finding_state: "VERIFIED_RESOLVED" | "STILL_FAILING";
  observer_actor: string;
  executing_agent_id: string;
  completion_actor: string;
  completed_at: string;
  observed_at: string;
  packet_sha256: string;
  evidence_sha256: string;
  observation_sha256: string;
  binding_sha256: string;
  health_evidence_ref: string;
}
export interface PieFindingVerifications {
  get(missionId: string): Promise<PieFindingVerification | null>;
  insert(record: PieFindingVerification): Promise<boolean>;
}
/** PIE-owned append-only outcomes in the same database; not executor packet data. */
export function createPostgresPieFindingVerifications(
  query: PostgresQueryExecutor,
): PieFindingVerifications {
  return {
    async get(id) {
      const rows = await query<{ body: PieFindingVerification }>(
        "select body from tip_pie_finding_verifications where mission_id=$1",
        [id],
      );
      const record = rows[0]?.body ?? null;
      if (record) {
        const { verification_id, ...body } = record;
        demand(
          verification_id === hash(body),
          "Persisted PIE verification hash mismatch",
        );
      }
      return record;
    },
    async insert(r) {
      const rows = await query(
        "insert into tip_pie_finding_verifications (mission_id,verification_id,body) values ($1,$2,$3::jsonb) on conflict (mission_id) do nothing returning mission_id",
        [r.mission_id, r.verification_id, JSON.stringify(r)],
      );
      return rows.length === 1;
    },
  };
}

/** Calls a fresh independent PIE observation only AFTER terminal evidence and
 * its existing Agent Comms packet publication are reread and validated. */
export async function recordPieHealthVerification(input: {
  runtime: MissionRuntime;
  artifacts: ArtifactRepository;
  deliveries: RuntimeDeliveryRepository;
  transport: CommandCenterTransport;
  outcomes: PieFindingVerifications;
  missionId: string;
  row: PieRecoverySource;
  binding: RecoveryBinding;
  observer: { actor: string; role: "pie-observer" };
  observe: () => Promise<PieRecoverySource>;
  now: () => string;
}): Promise<PieFindingVerification> {
  const {
    runtime,
    artifacts,
    deliveries,
    transport,
    outcomes,
    missionId,
    row,
    binding,
    observer,
    observe,
    now,
  } = input;
  const before = await runtime.get(missionId),
    packet = runtime.packet(before);
  demand(
    before.delegation.status === "COMPLETED",
    "Terminal mission required before health verification",
  );
  const completion = before.events.find((e) => e.to_state === "COMPLETED");
  const worker = before.delegation.assigned_agent_id;
  demand(
    completion &&
      worker &&
      observer.role === "pie-observer" &&
      observer.actor &&
      !["DOT", "TIP", worker, completion.actor].includes(observer.actor),
    "Independent PIE observer required",
  );
  const approved = before.permissionRequests.at(-1);
  demand(
    approved?.status === "APPROVED" &&
      approved.decided_by === "DOT" &&
      approved.policy_fingerprint === before.delegation.policy_fingerprint,
    "Policy-bound Dot approval required",
  );
  // Validate the original proposal against its original PIE evidence, using that
  // observation time. Freshness is separately required for the new observation.
  const expected = preparePieRecoveryMission({
    row,
    binding,
    now: row.intelligence?.checkedAt ?? "",
  });
  demand(
    expected && canonicalJson(expected) === canonicalJson(before.mission),
    "Original PIE proposal binding mismatch",
  );
  const report = before.evidence.find(
    (e) =>
      e.kind === "recovery-report" && e.verification_level === "HASH_VERIFIED",
  );
  demand(report, "Persisted verified recovery evidence required");
  const stored = await artifacts.get(report.sha256);
  demand(
    stored &&
      artifactHash(stored) === report.sha256 &&
      stored.mission_id === missionId &&
      stored.kind === "recovery-report" &&
      stored.content.binding_sha256 === hash(binding) &&
      stored.content.finding_id ===
        row.intelligence!.healthFailureEpisode!.finding!.id &&
      stored.content.build === row.intelligence!.healthFailureEpisode!.build,
    "Recovery evidence missing or mismatched",
  );
  const delivery = (await deliveries.list()).find(
    (d) =>
      d.mission_id === missionId &&
      d.mission_revision === before.revision &&
      d.status === "DELIVERED",
  );
  demand(
    delivery &&
      delivery.target.environment === binding.environment &&
      delivery.target.tip_project_id === binding.projectId &&
      canonicalJson(delivery.packet) === canonicalJson(packet),
    "Delivered terminal evidence required",
  );
  const view = await transport.project(
    delivery.target.command_center_project_id,
  );
  const recovered = recoverLatestCommittedPacket(
    view,
    `${packet.project_id}:${packet.mission_id}:${packet.delegation_id}`,
  );
  demand(
    canonicalJson(recovered.packet) === canonicalJson(packet),
    "Terminal publication drifted from runtime",
  );
  // Idempotent reread still rechecks terminal evidence. It does not replace a
  // mission's first terminal observation or revive a stale finding episode.
  const prior = await outcomes.get(missionId);
  if (prior) {
    demand(
      prior.packet_sha256 === hash(packet) &&
        prior.binding_sha256 === hash(binding),
      "Conflicting recorded verification",
    );
    const observation = await artifacts.get(prior.observation_sha256);
    demand(
      observation &&
        observation.kind === "pie-health-observation" &&
        observation.mission_id === missionId &&
        artifactHash(observation) === prior.observation_sha256,
      "Recorded PIE observation missing or altered",
    );
    return prior;
  }
  const started = Date.parse(now());
  demand(
    Number.isFinite(started) && started > Date.parse(completion.created_at),
    "Verification must start after completion",
  );
  const fresh = await observe(),
    intel = fresh.intelligence;
  demand(
    canonicalJson(fresh.manifest) === canonicalJson(row.manifest) &&
      intel?.projectId === row.manifest.projectId &&
      !intel.conflicts.length,
    "Fresh observation registration/identity mismatch",
  );
  const observed = Date.parse(intel.checkedAt),
    finished = Date.parse(now());
  demand(
    Number.isFinite(observed) &&
      observed >= started &&
      observed > Date.parse(completion.created_at) &&
      finished >= observed &&
      finished - observed <= 15 * 60_000,
    "Fresh post-completion PIE observation required",
  );
  const d = fresh.manifest.deployments.find(
    (d) => d.id === binding.deploymentId && d.surface === "candidate",
  );
  demand(d?.buildPath, "Registered candidate health contract required");
  const health = intel.facts[`health.${d.id}.ok`],
    identity = intel.facts[`health.${d.id}.identity`],
    build = intel.facts[`deployment.${d.id}.sha`];
  for (const [fact, endpoint] of [
    [health, binding.endpoint],
    [identity, binding.endpoint],
    [build, new URL(d.buildPath, d.url).href],
  ] as const)
    demand(
      fact?.status === "verified" &&
        !fact.conflict &&
        fact.source === endpoint &&
        fact.observedAt === intel.checkedAt &&
        /^sha256:[a-f0-9]{64}$/.test(fact.evidenceRef ?? ""),
      "Fresh verified health, identity and build facts required",
    );
  demand(
    identity.value === binding.projectId &&
      build.value === row.intelligence!.healthFailureEpisode!.build &&
      typeof health.value === "boolean",
    "Target identity/build changed or health unknown",
  );
  const observationSha = await artifacts.put({
    schema_version: "1.0",
    mission_id: missionId,
    kind: "pie-health-observation",
    content: { observer_actor: observer.actor, project: fresh },
  });
  const body = {
    schema_version: "1.0" as const,
    mission_id: missionId,
    finding_id: row.intelligence!.healthFailureEpisode!.finding!.id,
    project_id: binding.projectId,
    environment: binding.environment,
    finding_state: health.value
      ? ("VERIFIED_RESOLVED" as const)
      : ("STILL_FAILING" as const),
    observer_actor: observer.actor,
    executing_agent_id: worker,
    completion_actor: completion.actor,
    completed_at: completion.created_at,
    observed_at: intel.checkedAt,
    packet_sha256: hash(packet),
    evidence_sha256: report.sha256,
    observation_sha256: observationSha,
    binding_sha256: hash(binding),
    health_evidence_ref: health.evidenceRef!,
  };
  const record = { ...body, verification_id: hash(body) };
  const after = await runtime.get(missionId);
  demand(
    after.revision === before.revision &&
      canonicalJson(runtime.packet(after)) === canonicalJson(packet),
    "Executor mission changed during verification",
  );
  const inserted = await outcomes.insert(record),
    saved = inserted ? record : await outcomes.get(missionId);
  demand(
    saved && canonicalJson(saved) === canonicalJson(record),
    "Conflicting independent health outcome",
  );
  return saved;
}

/** Read-only projection for the existing Command Center; executor COMPLETE is
 * always AWAITING_VERIFICATION until correlated independent evidence exists. */
export function pieRecoveryProjection(
  mission: MissionRecord,
  outcome: PieFindingVerification | null,
) {
  const completion = mission.events.find((e) => e.to_state === "COMPLETED");
  const correlated =
    outcome &&
    mission.delegation.status === "COMPLETED" &&
    completion &&
    outcome.mission_id === mission.mission.mission_id &&
    outcome.packet_sha256 ===
      hash({
        // Use the same immutable runtime packet projection as publication.
        ...runtimeHandoffPacket(mission),
      }) &&
    outcome.completed_at === completion.created_at &&
    Date.parse(outcome.observed_at) > Date.parse(outcome.completed_at);
  return {
    mission_id: mission.mission.mission_id,
    execution_status: mission.delegation.status,
    approval: mission.permissionRequests.at(-1)?.status ?? "NOT_RECORDED",
    finding_state: correlated
      ? outcome.finding_state
      : mission.delegation.status === "COMPLETED"
        ? "AWAITING_VERIFICATION"
        : "MISSION_PROPOSED",
    verification: correlated ? outcome : null,
  };
}
