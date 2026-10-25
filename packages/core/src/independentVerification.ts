import { createHash } from "node:crypto";
import { artifactHash, type ArtifactRepository } from "./runtimeArtifactRepository";
import { canonicalJson, RuntimeError } from "./runtimeContracts";
import type { MissionRuntime } from "./missionRuntime";
import type { MissionState } from "./missionRuntimeTypes";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
import type { RuntimeDeliveryRepository } from "./runtimeDeliveryRepository";

/**
 * Post-completion re-observation. It does not change mission status, revision,
 * the executor packet, Dot approval, finding resolution, or dispatch.
 */
export interface PieObserver {
  actor: string;
  role: "pie-observer";
}
export interface ObservedDelivery {
  acknowledged: boolean;
  sender: string;
  recipient: string | null;
  task_id: string | null;
  acknowledgment: { actor: string } | null;
}
export interface IndependentVerification {
  schema_version: "1.0";
  verification_id: string;
  mission_id: string;
  finding_id: string | null;
  finding_fingerprint: string | null;
  lifecycle: "RECORDED";
  result: "MATCH" | "MISMATCH";
  observer_actor: string;
  executing_agent_id: string;
  completion_actor: string;
  task_id: string;
  packet_sha256: string;
  evidence_sha256: string;
  observed_packet_sha256: string;
  observed_evidence_sha256: string;
  acknowledgment_actor: string;
  ledger_sender: "TIP";
  ledger_verifier: string | null;
  ledger_verification_id: string | null;
  observed_at: string;
  dot_approval: "NOT_RECORDED";
  finding_resolution: "NOT_RECORDED";
  dispatch_enabled: false;
}
export interface MissionVerificationLifecycle {
  mission_id: string;
  execution_status: MissionState;
  independent_verification: "NOT_RECORDED" | "RECORDED";
  result: "MATCH" | "MISMATCH" | null;
  dot_approval: "NOT_RECORDED";
  finding_resolution: "NOT_RECORDED";
  dispatch_enabled: false;
}
export interface IndependentVerificationRepository {
  get(missionId: string): Promise<IndependentVerification | null>;
  insert(record: IndependentVerification): Promise<boolean>;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const addressable = /^(?:CHATGPT_WORK|CHATGPT|GEMINI|SUPERGROK|GROKBOT_[A-Z0-9]+)$/;
const findingIdPattern = /^project:PRJ-[A-Z0-9-]+$/;
const fingerprintPattern = /^[a-f0-9]{64}$/;
const ledgerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;

function demand(ok: unknown, message: string, status = 409): asserts ok {
  if (!ok) throw new RuntimeError(status, message);
}

function comparable(record: IndependentVerification) {
  const { observed_at: _observedAt, ...rest } = record;
  return canonicalJson(rest);
}

export function missionVerificationLifecycle(
  missionId: string,
  executionStatus: MissionState,
  record: IndependentVerification | null,
): MissionVerificationLifecycle {
  if (!record) {
    return {
      mission_id: missionId,
      execution_status: executionStatus,
      independent_verification: "NOT_RECORDED",
      result: null,
      dot_approval: "NOT_RECORDED",
      finding_resolution: "NOT_RECORDED",
      dispatch_enabled: false,
    };
  }
  return {
    mission_id: missionId,
    execution_status: executionStatus,
    independent_verification: "RECORDED",
    result: record.result,
    dot_approval: "NOT_RECORDED",
    finding_resolution: "NOT_RECORDED",
    dispatch_enabled: false,
  };
}

export function createMemoryIndependentVerifications(): IndependentVerificationRepository {
  const records = new Map<string, IndependentVerification>();
  return {
    async get(missionId) {
      return structuredClone(records.get(missionId) ?? null);
    },
    async insert(record) {
      if (records.has(record.mission_id)) return false;
      records.set(record.mission_id, structuredClone(record));
      return true;
    },
  };
}

export function createPostgresIndependentVerifications(
  query: PostgresQueryExecutor,
): IndependentVerificationRepository {
  return {
    async get(missionId) {
      const rows = await query<{ body: IndependentVerification | string }>(
        "select body from tip_runtime_independent_verifications where mission_id=$1",
        [missionId],
      );
      const body = rows[0]?.body;
      if (!body) return null;
      const parsed = typeof body === "string" ? JSON.parse(body) as IndependentVerification : body;
      return parsed;
    },
    async insert(record) {
      const rows = await query<{ mission_id: string }>(
        `insert into tip_runtime_independent_verifications (mission_id, verification_id, body)
         values ($1,$2,$3::jsonb) on conflict (mission_id) do nothing returning mission_id`,
        [record.mission_id, record.verification_id, JSON.stringify(record)],
      );
      return rows.length === 1;
    },
  };
}

/** Records a fresh observer result. The completed mission aggregate stays immutable. */
export async function recordIndependentVerification(input: {
  runtime: MissionRuntime;
  artifacts: ArtifactRepository;
  deliveries: RuntimeDeliveryRepository;
  verifications: IndependentVerificationRepository;
  observer: PieObserver;
  missionId: string;
  observedPacketSha256: string;
  observedEvidenceSha256: string;
  delivery: ObservedDelivery;
  ledgerVerifier: string | null;
  ledgerVerificationId: string | null;
  findingId?: string | null;
  findingFingerprint?: string | null;
  now?: string;
}): Promise<IndependentVerification> {
  demand(input.observer.role === "pie-observer", "PIE observer required", 403);
  demand(
    input.observer.actor && input.observer.actor !== "TIP",
    "Observer identity is required",
    403,
  );
  const before = await input.runtime.get(input.missionId);
  const status = before.delegation.status;
  switch (status) {
    case "COMPLETED":
      break;
    case "UNROUTABLE":
    case "NEEDS_APPROVAL":
    case "ASSIGNED":
    case "RUNNING":
    case "BLOCKED":
    case "REVIEW":
    case "FAILED":
    case "CANCELLED":
      throw new RuntimeError(409, "Independent verification follows completion");
    default: {
      const unexpected: never = status;
      throw new RuntimeError(500, `Unhandled mission state ${unexpected}`);
    }
  }
  const completion = before.events.find((event) => event.to_state === "COMPLETED");
  const worker = before.delegation.assigned_agent_id;
  demand(completion && worker, "Completed assignment was not persisted");
  demand(
    completion.actor !== worker && completion.actor !== input.observer.actor,
    "Observer cannot be the executing agent or the completing operator",
    403,
  );
  demand(input.observer.actor !== worker, "Observer cannot be the executing agent", 403);
  const rows = (await input.deliveries.list()).filter(
    (row) => row.mission_id === input.missionId,
  );
  demand(
    rows.length > 0 && rows.every((row) => row.status === "DELIVERED"),
    "Independent verification requires a delivered publication",
  );
  const packet = input.runtime.packet(before);
  demand(
    packet.operations?.independent_verification === "NOT_RECORDED",
    "Executor packet claimed an independent verification",
  );
  const report = before.evidence.find((item) => item.kind === "repository-report");
  demand(
    report?.verification_level === "HASH_VERIFIED" && report.sha256,
    "Completed mission is missing its verified report",
  );
  const stored = await input.artifacts.get(report.sha256);
  demand(
    stored && artifactHash(stored) === report.sha256,
    "Stored report hash does not match the mission evidence",
  );
  const identity = `${packet.project_id}:${packet.mission_id}:${packet.delegation_id}`;
  const taskId = `TIP-${digest(identity)}`;
  const packetSha = digest(canonicalJson(packet));
  const current = rows.find((row) => row.mission_revision === before.revision);
  demand(
    current && digest(canonicalJson(current.packet)) === packetSha,
    "Persisted delivery packet drifted from the stored mission",
  );
  const delivery = input.delivery;
  demand(
    delivery.acknowledged === true &&
      delivery.sender === "TIP" &&
      delivery.task_id === taskId &&
      delivery.recipient !== null &&
      addressable.test(delivery.recipient) &&
      delivery.acknowledgment?.actor === delivery.recipient,
    "Recipient acknowledgment was not observed",
  );
  demand(
    delivery.recipient !== worker &&
      delivery.recipient !== completion.actor &&
      delivery.recipient !== input.observer.actor,
    "Acknowledgment actor is not an independent recipient",
    403,
  );
  const findingId = input.findingId ?? null;
  const findingFingerprint = input.findingFingerprint ?? null;
  demand(
    (findingId === null && findingFingerprint === null) ||
      (findingId !== null &&
        findingIdPattern.test(findingId) &&
        findingFingerprint !== null &&
        fingerprintPattern.test(findingFingerprint)),
    "Finding attachment needs both an id and a fingerprint",
    400,
  );
  const ledgerVerifier = input.ledgerVerifier;
  const ledgerVerificationId = input.ledgerVerificationId;
  demand(
    (ledgerVerifier === null && ledgerVerificationId === null) ||
      (ledgerVerifier !== null &&
        addressable.test(ledgerVerifier) &&
        ledgerVerifier !== "TIP" &&
        ledgerVerifier !== worker &&
        ledgerVerifier !== completion.actor &&
        ledgerVerifier !== input.observer.actor &&
        ledgerVerificationId !== null &&
        ledgerIdPattern.test(ledgerVerificationId)),
    "Ledger verification must be a separate Agent Comms actor",
    403,
  );
  const packetMatch = input.observedPacketSha256 === packetSha;
  const evidenceMatch = input.observedEvidenceSha256 === report.sha256;
  const result: IndependentVerification["result"] =
    packetMatch && evidenceMatch ? "MATCH" : "MISMATCH";
  switch (result) {
    case "MATCH":
    case "MISMATCH":
      break;
    default: {
      const unexpected: never = result;
      throw new RuntimeError(500, `Unhandled verification result ${unexpected}`);
    }
  }
  const record: IndependentVerification = {
    schema_version: "1.0",
    verification_id: digest(canonicalJson({
      mission_id: input.missionId,
      task_id: taskId,
      packet_sha256: packetSha,
      evidence_sha256: report.sha256,
      result,
      observer_actor: input.observer.actor,
    })),
    mission_id: input.missionId,
    finding_id: findingId,
    finding_fingerprint: findingFingerprint,
    lifecycle: "RECORDED",
    result,
    observer_actor: input.observer.actor,
    executing_agent_id: worker,
    completion_actor: completion.actor,
    task_id: taskId,
    packet_sha256: packetSha,
    evidence_sha256: report.sha256,
    observed_packet_sha256: input.observedPacketSha256,
    observed_evidence_sha256: input.observedEvidenceSha256,
    acknowledgment_actor: delivery.recipient,
    ledger_sender: "TIP",
    ledger_verifier: ledgerVerifier,
    ledger_verification_id: ledgerVerificationId,
    observed_at: input.now ?? new Date().toISOString(),
    dot_approval: "NOT_RECORDED",
    finding_resolution: "NOT_RECORDED",
    dispatch_enabled: false,
  };
  const inserted = await input.verifications.insert(record);
  const saved = inserted ? record : await input.verifications.get(input.missionId);
  demand(saved && comparable(saved) === comparable(record), "Conflicting independent verification");
  const after = await input.runtime.get(input.missionId);
  demand(
    after.revision === before.revision &&
      after.delegation.status === "COMPLETED" &&
      canonicalJson(input.runtime.packet(after)) === canonicalJson(packet),
    "Independent verification mutated the completed mission",
  );
  return saved;
}
