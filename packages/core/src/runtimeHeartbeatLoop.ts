import { createHash } from "node:crypto";
import { deliverNextRuntimePacket } from "./runtimeDeliveryWorker";
import { runRepositoryInspection, type GitHubReader } from "./repositoryInspector";
import type { MissionRuntime } from "./missionRuntime";
import type { ArtifactRepository } from "./runtimeArtifactRepository";
import type {
  RuntimeDelivery,
  RuntimeDeliveryMapping,
  RuntimeDeliveryRepository,
} from "./runtimeDeliveryRepository";
import type { CommandCenterProjection, CommandCenterTransport } from "./commandCenterRuntimeBridge";
import { canonicalJson, RuntimeError, validateRuntimeContract } from "./runtimeContracts";
import type {
  MissionInput,
  MissionRecord,
  MissionState,
  RuntimePrincipal,
} from "./missionRuntimeTypes";

/**
 * Composes the existing Runtime 002/003 mission, Taxis routing, repository
 * inspector, and Command Center delivery queue. It does not add a runtime,
 * registry, delegation protocol, or message bus, and it never selects the
 * candidate or production delivery transport.
 */
export const CONTROLLED_HEARTBEAT_REPOSITORY = "rc610music/truaxiom-TIP";
export const CONTROLLED_HEARTBEAT_REF =
  "e896e080de021435cd4122662a66f40c0eb650c9";
export const CONTROLLED_HEARTBEAT_AGENT = "AGENT-REPOSITORY-INSPECTOR";
export const CONTROLLED_HEARTBEAT_CAPABILITY = "repository.inspect";
const DELIVERY_PATHS = ["/tasks", "/evidence", "/messages"] as const;
const markerPrefix = "TIP_RUNTIME_COMMIT ";

export const CONTROLLED_HEARTBEAT_CONDITION = {
  source: "controlled-test-condition",
  repository: CONTROLLED_HEARTBEAT_REPOSITORY,
  ref: CONTROLLED_HEARTBEAT_REF,
  capability_id: CONTROLLED_HEARTBEAT_CAPABILITY,
  agent_id: CONTROLLED_HEARTBEAT_AGENT,
} as const;

export function controlledHeartbeatMission(
  missionId: string,
  ref = CONTROLLED_HEARTBEAT_REF,
): MissionInput {
  return {
    schema_version: "1.0",
    mission_id: missionId,
    project_id: "PRJ-TIP",
    title: "Isolated development heartbeat",
    capability_id: CONTROLLED_HEARTBEAT_CAPABILITY,
    required_permissions: [],
    risk_tier: "low",
    constraints: [
      "Read-only metadata; no source execution, production mutation, or credential use",
    ],
    evidence_required: ["repository-report"],
    inputs: { repository: CONTROLLED_HEARTBEAT_REPOSITORY, ref },
  };
}

export interface HeartbeatLedgerView extends CommandCenterProjection {
  tasks: Array<{
    id: string;
    env?: string;
    requires_dot?: boolean;
    authority_type?: string;
  }>;
  evidence: Array<{
    id: string;
    task_id?: string;
    env?: string;
    requires_dot?: boolean;
    authority_type?: string;
    verification_level?: string;
  }>;
  messages: Array<{
    id: string;
    task_id: string | null;
    body: string;
    env?: string;
    requires_dot?: boolean;
    authority_type?: string;
  }>;
}

export interface HeartbeatRun {
  executed: boolean;
  mission_status: MissionState;
  mission_id: string;
  revision: number;
  assigned_agent_id: string | null;
  capability_id: string;
  policy_fingerprint: string;
  required_permissions: string[];
  evidence_sha256: string | null;
  deliveries: Array<{
    delivery_id: string;
    status: RuntimeDelivery["status"];
    mission_revision: number;
    last_error_code: string | null;
  }>;
}

export interface HeartbeatRecheck {
  result: "PASSED";
  mission_id: string;
  mission_status: "COMPLETED" | "FAILED";
  revision: number;
  assigned_agent_id: string;
  capability_id: string;
  policy_fingerprint: string;
  evidence_sha256: string | null;
  packet_sha256: string;
  ledger_task_id: string;
  delivered_revisions: number[];
  delivery_environments: ["development"];
  write_permissions: [];
  packet_independent_verification: "NOT_RECORDED";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function nextAction(status: MissionState): "execute" | "review" | "stop" {
  switch (status) {
    case "ASSIGNED":
    case "RUNNING":
      return "execute";
    case "REVIEW":
      return "review";
    case "UNROUTABLE":
    case "NEEDS_APPROVAL":
    case "BLOCKED":
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED":
      return "stop";
    default: {
      const unexpected: never = status;
      throw new RuntimeError(500, `Unhandled mission state ${unexpected}`);
    }
  }
}

/** Development-only guard for this proof path. Preview remains a separate delivery mapping. */
export function assertIsolatedDevelopmentHeartbeat(
  env: string,
  mappings: readonly RuntimeDeliveryMapping[],
  mission: MissionInput,
) {
  if (env !== "development" || process.env.TIP_ENV === "production")
    throw new RuntimeError(403, "Isolated heartbeat runs only in development");
  if (
    mission.capability_id !== CONTROLLED_HEARTBEAT_CAPABILITY ||
    mission.inputs?.repository !== CONTROLLED_HEARTBEAT_REPOSITORY ||
    !mission.inputs.ref
  )
    throw new RuntimeError(
      400,
      "Heartbeat requires the pinned read-only repository inspection",
    );
  if (!mappings.length)
    throw new RuntimeError(400, "Isolated development delivery mapping required");
  for (const mapping of mappings) {
    validateRuntimeContract("runtime-delivery-mapping", mapping);
    if (
      mapping.environment !== "development" ||
      mapping.tip_project_id !== mission.project_id
    )
      throw new RuntimeError(
        403,
        "Heartbeat delivery mapping must stay on the isolated development target",
      );
  }
}

function snapshot(record: MissionRecord, executed: boolean, deliveries: RuntimeDelivery[]): HeartbeatRun {
  return {
    executed,
    mission_status: record.delegation.status,
    mission_id: record.mission.mission_id,
    revision: record.revision,
    assigned_agent_id: record.delegation.assigned_agent_id,
    capability_id: record.delegation.requested_capability,
    policy_fingerprint: record.delegation.policy_fingerprint,
    required_permissions: record.delegation.required_permissions,
    evidence_sha256:
      record.evidence.find((item) => item.kind === "repository-report")?.sha256 ??
      null,
    deliveries: deliveries
      .filter((row) => row.mission_id === record.mission.mission_id)
      .map((row) => ({
        delivery_id: row.delivery_id,
        status: row.status,
        mission_revision: row.mission_revision,
        last_error_code: row.last_error_code,
      })),
  };
}

async function drain(
  deliveries: RuntimeDeliveryRepository,
  transport: CommandCenterTransport,
  now: () => string,
) {
  const guarded: CommandCenterTransport = {
    project: (id) => transport.project(id),
    write: async (path, body, key) => {
      if (
        !DELIVERY_PATHS.includes(path as (typeof DELIVERY_PATHS)[number]) ||
        body.env !== "development"
      )
        throw new RuntimeError(403, "Heartbeat delivery path denied");
      return transport.write(path, body, key);
    },
  };
  for (let attempt = 0; attempt < 32; attempt++) {
    const step = await deliverNextRuntimePacket(deliveries, guarded, now);
    switch (step.status) {
      case "DELIVERED":
        continue;
      case "IDLE":
      case "PAUSED":
      case "FENCED":
      case "RETRY_PENDING":
        return;
      default: {
        const unexpected: never = step;
        throw new RuntimeError(500, `Unexpected delivery result ${JSON.stringify(unexpected)}`);
      }
    }
  }
  throw new RuntimeError(409, "Delivery drain exceeded bounded attempt budget");
}

export async function runGovernedHeartbeat(input: {
  env: string;
  runtime: MissionRuntime;
  artifacts: ArtifactRepository;
  deliveries: RuntimeDeliveryRepository;
  transport: CommandCenterTransport;
  mappings: readonly RuntimeDeliveryMapping[];
  mission: MissionInput;
  operator: RuntimePrincipal;
  read: GitHubReader;
  now?: () => string;
  reviewNote?: string;
}): Promise<HeartbeatRun> {
  assertIsolatedDevelopmentHeartbeat(input.env, input.mappings, input.mission);
  if (input.operator.role !== "operator")
    throw new RuntimeError(403, "Only operators dispatch the isolated heartbeat");
  const now = input.now ?? (() => new Date().toISOString());
  let executed = false;
  let record = await input.runtime.create(input.mission, input.operator);
  try {
    if (nextAction(record.delegation.status) === "execute") {
      executed = true;
      try {
        record = await runRepositoryInspection(
          input.runtime,
          input.artifacts,
          record.mission.mission_id,
          input.read,
        );
      } catch (error) {
        record = await input.runtime.get(record.mission.mission_id);
        if (record.delegation.status !== "FAILED") throw error;
      }
    }
    if (record.delegation.status === "REVIEW" && input.reviewNote) {
      record = await input.runtime.command(
        record.mission.mission_id,
        {
          command_id: `HB-REVIEW:${record.revision}`,
          expected_revision: record.revision,
          type: "review",
          accepted: true,
          note: input.reviewNote,
        },
        input.operator,
      );
    }
  } finally {
    await drain(input.deliveries, input.transport, now);
  }
  record = await input.runtime.get(record.mission.mission_id);
  return snapshot(record, executed, await input.deliveries.list());
}

function marker(body: string) {
  if (!body.startsWith(markerPrefix)) return null;
  const parsed: unknown = JSON.parse(body.slice(markerPrefix.length));
  if (!parsed || typeof parsed !== "object") return null;
  const marker = parsed as {
    revision?: unknown;
    sha256?: unknown;
    state?: unknown;
  };
  if (
    typeof marker.revision !== "number" ||
    typeof marker.sha256 !== "string" ||
    typeof marker.state !== "string"
  )
    return null;
  return {
    revision: marker.revision,
    sha256: marker.sha256,
    state: marker.state,
  };
}

function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuntimeError(409, message);
}

/** Read-only recheck. It does not accept the dispatcher return value as proof. */
export async function recheckGovernedHeartbeat(input: {
  runtime: MissionRuntime;
  artifacts: ArtifactRepository;
  deliveries: RuntimeDeliveryRepository;
  ledger: HeartbeatLedgerView;
  missionId: string;
  expect: "COMPLETED" | "FAILED";
  operatorActor: string;
}): Promise<HeartbeatRecheck> {
  const record = await input.runtime.get(input.missionId);
  const rows = (await input.deliveries.list()).filter(
    (row) => row.mission_id === input.missionId,
  );
  demand(record.delegation.status === input.expect, "Mission terminal state mismatch");
  demand(
    record.delegation.assigned_agent_id === CONTROLLED_HEARTBEAT_AGENT,
    "Unexpected worker selected",
  );
  demand(
    record.routingDecision?.selected_agent === CONTROLLED_HEARTBEAT_AGENT,
    "Stored routing decision does not match the assignment",
  );
  demand(
    record.delegation.requested_capability === CONTROLLED_HEARTBEAT_CAPABILITY,
    "Capability mismatch",
  );
  demand(
    record.delegation.required_permissions.length > 0 &&
      record.delegation.required_permissions.every((item) => item.startsWith("read:")) &&
      !record.delegation.required_permissions.some(
        (item) => item.startsWith("write:") || item.startsWith("actions:"),
      ),
    "Heartbeat grant is not read-only",
  );
  demand(
    rows.length > 0 &&
      rows.every(
        (row) =>
          row.status === "DELIVERED" && row.target.environment === "development",
      ),
    "Development delivery did not reach a terminal delivered state",
  );
  const current = rows.find((row) => row.mission_revision === record.revision);
  const packet = input.runtime.packet(record);
  demand(
    current && canonicalJson(current.packet) === canonicalJson(packet),
    "Persisted delivery packet drifted from the stored mission",
  );
  demand(
    packet.operations?.independent_verification === "NOT_RECORDED",
    "Packet must not claim an independent verification it did not record",
  );
  const identity = `${packet.project_id}:${packet.mission_id}:${packet.delegation_id}`;
  const taskId = `TIP-${digest(identity)}`;
  const task = input.ledger.tasks.find((item) => item.id === taskId);
  demand(
    task?.requires_dot === true &&
      task.env === "development" &&
      task.authority_type === "DOT_APPROVAL",
    "Ledger task is not a development Dot-gated record",
  );
  const messages = input.ledger.messages.filter((item) => item.task_id === taskId);
  demand(
    messages.every(
      (item) =>
        item.requires_dot === true &&
        item.env === "development" &&
        item.authority_type === "DOT_APPROVAL",
    ),
    "Ledger message lost its development Dot gate",
  );
  for (const row of rows) {
    const hash = digest(canonicalJson(row.packet));
    const committed = messages
      .map((item) => marker(item.body))
      .find((item) => item?.revision === row.mission_revision);
    demand(
      committed?.sha256 === hash && committed.state === row.packet.state,
      "Ledger commit marker does not match the stored delivery packet",
    );
  }
  const report = record.evidence.find((item) => item.kind === "repository-report");
  if (input.expect === "COMPLETED") {
    const completed = record.events.find((event) => event.to_state === "COMPLETED");
    demand(
      completed?.actor === input.operatorActor &&
        completed.actor !== CONTROLLED_HEARTBEAT_AGENT,
      "Worker cannot complete its own mission",
    );
    demand(
      record.events.some((event) => event.to_state === "ASSIGNED") &&
        !record.events.some((event) => event.to_state === "NEEDS_APPROVAL"),
      "Completion skipped governed assignment",
    );
    if (
      report?.verification_level !== "HASH_VERIFIED" ||
      report.attached_by !== CONTROLLED_HEARTBEAT_AGENT ||
      record.evidence.filter((item) => item.kind === "repository-report").length !== 1
    )
      throw new RuntimeError(409, "Completed heartbeat is missing its single verified report");
    const stored = await input.artifacts.get(report.sha256);
    const pinned = record.mission.inputs?.ref;
    demand(
      stored?.mission_id === input.missionId &&
        stored.kind === "repository-report" &&
        stored.content.repository === CONTROLLED_HEARTBEAT_REPOSITORY &&
        typeof stored.content.commit_sha === "string" &&
        /^[a-f0-9]{40}$/.test(stored.content.commit_sha) &&
        (!pinned || !/^[a-f0-9]{40}$/.test(pinned) || stored.content.commit_sha === pinned) &&
        Array.isArray(stored.content.paths),
      "Stored report does not match the pinned repository observation",
    );
    demand(record.completionResult, "Completion result was not persisted");
  } else {
    demand(
      !record.events.some((event) => event.to_state === "COMPLETED") &&
        record.completionResult === null &&
        record.failures.length === 1 &&
        record.failures[0]?.retryable === true,
      "Failed heartbeat recorded an inconsistent completion",
    );
  }
  return {
    result: "PASSED",
    mission_id: record.mission.mission_id,
    mission_status: input.expect,
    revision: record.revision,
    assigned_agent_id: CONTROLLED_HEARTBEAT_AGENT,
    capability_id: CONTROLLED_HEARTBEAT_CAPABILITY,
    policy_fingerprint: record.delegation.policy_fingerprint,
    evidence_sha256: report?.sha256 ?? null,
    packet_sha256: digest(canonicalJson(packet)),
    ledger_task_id: taskId,
    delivered_revisions: rows.map((row) => row.mission_revision),
    delivery_environments: ["development"],
    write_permissions: [],
    packet_independent_verification: "NOT_RECORDED",
  };
}
