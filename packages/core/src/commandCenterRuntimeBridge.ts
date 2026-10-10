import { createHash } from "node:crypto";
import {
  canonicalJson,
  RuntimeError,
  validateRuntimeContract,
} from "./runtimeContracts";
import type { HandoffPacket } from "./missionRuntimeTypes";

export interface CommandCenterProjection {
  project: { id: string; checkpoint_version: number };
  tasks: Array<{ id: string }>;
  evidence: Array<{ id: string }>;
  messages: Array<{ id: string; task_id: string | null; body: string }>;
}
export interface CommandCenterTransport {
  project(id: string): Promise<CommandCenterProjection>;
  write(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<unknown>;
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const markerPrefix = "TIP_RUNTIME_COMMIT ";
/** Existing Agent Comms ledger projection. It never grants authority or performs Dot review. */
export async function synchronizeRuntimePacket(
  packet: HandoffPacket,
  mapping: {
    tipProjectId: string;
    commandCenterProjectId: string;
    env: "development" | "preview";
  },
  transport: CommandCenterTransport,
): Promise<{ task_id: string; revision: number; published: boolean }> {
  validateRuntimeContract("handoff-packet", packet);
  if (
    packet.project_id !== mapping.tipProjectId ||
    !["development", "preview"].includes(mapping.env)
  )
    throw new RuntimeError(
      400,
      "Explicit development project mapping required",
    );
  const identity = `${packet.project_id}:${packet.mission_id}:${packet.delegation_id}`;
  const task = `TIP-${digest(identity)}`;
  const encoded = canonicalJson(packet);
  const hash = digest(encoded);
  let view = await transport.project(mapping.commandCenterProjectId);
  if (view.project.id !== mapping.commandCenterProjectId)
    throw new RuntimeError(409, "Project identity mismatch");
  for (const message of view.messages.filter(
    (m) => m.task_id === task && m.body.startsWith(markerPrefix),
  )) {
    const marker = JSON.parse(message.body.slice(markerPrefix.length));
    if (marker.revision === packet.revision && marker.sha256 !== hash)
      throw new RuntimeError(409, "Conflicting TIP revision");
    if (marker.revision >= packet.revision)
      return { task_id: task, revision: marker.revision, published: false };
  }
  // Frozen Command Center baseline 0d3b53cb limits post_evidence uri to 2000.
  // Refuse before any ledger write so an overlong TIP artifact is not published.
  for (const artifact of packet.evidence) {
    if (artifact.uri.length > 2000)
      throw new RuntimeError(400, "Evidence URI exceeds Command Center limit");
  }
  const write = async (
    path: string,
    id: string,
    body: Record<string, unknown>,
  ) => {
    // Fresh Command Center checkpoint; TIP revision is a different concurrency domain.
    const payload = {
      ...body,
      id,
      project_id: mapping.commandCenterProjectId,
      env: mapping.env,
      checkpoint_version: view.project.checkpoint_version,
      requires_dot: true,
      authority_type: "DOT_APPROVAL",
    };
    // A failed response stops this attempt. Restart reads the ledger and skips committed IDs.
    await transport.write(path, payload, id);
    view = await transport.project(mapping.commandCenterProjectId);
  };
  if (!view.tasks.some((t) => t.id === task))
    await write("/tasks", task, {
      title: `TIP mission ${packet.mission_id}`.slice(0, 200),
      summary: `Runtime delegation ${packet.delegation_id}. TIP owns execution state; Dot review remains required.`,
    });
  for (const artifact of packet.evidence) {
    const id = `TIP-E-${digest(`${identity}:${artifact.artifact_id}:${artifact.sha256}`)}`;
    if (!view.evidence.some((e) => e.id === id))
      await write("/evidence", id, {
        task_id: task,
        uri: artifact.uri,
        verification_level: "CLAIMED",
        summary:
          `TIP ${artifact.kind}; sha256=${artifact.sha256}; source verification=${artifact.verification_level ?? "CLAIMED"}. ${artifact.summary}`.slice(
            0,
            4000,
          ),
      });
  }
  // Exact packet split into ledger messages, preserving blockers/failures/handoffs without
  // inventing Command Center agent assignments or accepting its handoffs on another actor's behalf.
  const chunks = encoded.match(/[\s\S]{1,3000}/gu) ?? [];
  for (let index = 0; index < chunks.length; index++) {
    const id = `TIP-P-${digest(`${identity}:${packet.revision}:${hash}:${index}`)}`;
    if (!view.messages.some((m) => m.id === id))
      await write("/messages", id, {
        task_id: task,
        message_type: "STATUS",
        body: `TIP_RUNTIME_PART ${JSON.stringify({ revision: packet.revision, sha256: hash, index, total: chunks.length })}\n${chunks[index]}`,
      });
  }
  const id = `TIP-C-${digest(`${identity}:${packet.revision}`)}`;
  if (!view.messages.some((m) => m.id === id))
    await write("/messages", id, {
      task_id: task,
      message_type: "STATUS",
      body:
        markerPrefix +
        JSON.stringify({
          revision: packet.revision,
          sha256: hash,
          parts: chunks.length,
          state: packet.state,
          assigned_agent_id: packet.assigned_agent_id,
          review_required: true,
        }),
    });
  return { task_id: task, revision: packet.revision, published: true };
}

/** Credential is supplied by the host, never persisted by TIP. Candidate host is fixed. */
export function createCommandCenterCandidateTransport(
  token: string,
  request: typeof fetch = fetch,
): CommandCenterTransport {
  if (!token || /[\r\n]/.test(token))
    throw new RuntimeError(
      503,
      "Authorized Command Center credential required",
    );
  const call = async (
    path: string,
    body?: Record<string, unknown>,
    key?: string,
  ) => {
    const response = await request(
      `https://truaxiom-command-center-candidate.onrender.com/api/agent-comms/v1${path}`,
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body
            ? { "Content-Type": "application/json", "Idempotency-Key": key! }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok)
      throw new RuntimeError(
        response.status,
        "Command Center synchronization failed",
      );
    return response.json();
  };
  return {
    project: async (id) => {
      const value = (await call(
        `/projects/${encodeURIComponent(id)}`,
      )) as Partial<CommandCenterProjection>;
      if (
        !value?.project ||
        typeof value.project.id !== "string" ||
        !Number.isInteger(value.project.checkpoint_version) ||
        !Array.isArray(value.tasks) ||
        !Array.isArray(value.evidence) ||
        !Array.isArray(value.messages)
      )
        throw new RuntimeError(502, "Invalid Command Center project response");
      return value as CommandCenterProjection;
    },
    write: call,
  };
}
