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
/** A commit marker is a claim until its exact, schema-valid packet is recovered. */
function verifiedCommittedPacket(
  message: CommandCenterProjection["messages"][number],
  view: CommandCenterProjection,
  task: string,
  identity: string,
): HandoffPacket {
  const invalid = () => new RuntimeError(409, "Invalid committed TIP packet");
  try {
    const marker = JSON.parse(message.body.slice(markerPrefix.length));
    if (
      !marker ||
      !Number.isSafeInteger(marker.revision) ||
      marker.revision < 1 ||
      !Number.isSafeInteger(marker.parts) ||
      marker.parts < 1 ||
      typeof marker.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(marker.sha256) ||
      message.id !== `TIP-C-${digest(`${identity}:${marker.revision}`)}` ||
      !view.tasks.some((t) => t.id === task)
    )
      throw invalid();
    const parts = new Map<number, string>();
    for (const part of view.messages.filter(
      (m) => m.task_id === task && m.body.startsWith("TIP_RUNTIME_PART "),
    )) {
      const newline = part.body.indexOf("\n");
      if (newline < 0) throw invalid();
      const meta = JSON.parse(
        part.body.slice("TIP_RUNTIME_PART ".length, newline),
      );
      if (meta.revision !== marker.revision || meta.sha256 !== marker.sha256)
        continue;
      if (
        !Number.isSafeInteger(meta.index) ||
        meta.index < 0 ||
        meta.index >= marker.parts ||
        meta.total !== marker.parts ||
        part.id !==
          `TIP-P-${digest(`${identity}:${marker.revision}:${marker.sha256}:${meta.index}`)}` ||
        parts.has(meta.index)
      )
        throw invalid();
      parts.set(meta.index, part.body.slice(newline + 1));
    }
    if (parts.size !== marker.parts) throw invalid();
    const encoded = Array.from(
      { length: marker.parts },
      (_, i) => parts.get(i)!,
    ).join("");
    if (digest(encoded) !== marker.sha256) throw invalid();
    const committed = JSON.parse(encoded) as HandoffPacket;
    validateRuntimeContract("handoff-packet", committed);
    if (
      `${committed.project_id}:${committed.mission_id}:${committed.delegation_id}` !==
        identity ||
      committed.revision !== marker.revision ||
      committed.state !== marker.state ||
      committed.assigned_agent_id !== marker.assigned_agent_id ||
      marker.review_required !== true ||
      canonicalJson(committed) !== encoded
    )
      throw invalid();
    for (const artifact of committed.evidence) {
      const id = `TIP-E-${digest(`${identity}:${artifact.artifact_id}:${artifact.sha256}`)}`;
      if (!view.evidence.some((e) => e.id === id)) throw invalid();
    }
    return committed;
  } catch {
    throw invalid();
  }
}
/** Reread the newest schema-valid commit. A marker alone is not the packet. */
export function recoverLatestCommittedPacket(
  view: CommandCenterProjection,
  identity: string,
): {
  task_id: string;
  commit_message_id: string;
  sha256: string;
  packet: HandoffPacket;
} {
  const task = `TIP-${digest(identity)}`;
  let selected: {
    message: CommandCenterProjection["messages"][number];
    packet: HandoffPacket;
  } | null = null;
  for (const message of view.messages) {
    if (message.task_id !== task || !message.body.startsWith(markerPrefix))
      continue;
    const packet = verifiedCommittedPacket(message, view, task, identity);
    if (!selected || packet.revision >= selected.packet.revision)
      selected = { message, packet };
  }
  if (!selected) throw new RuntimeError(409, "Committed TIP packet unavailable");
  return {
    task_id: task,
    commit_message_id: selected.message.id,
    sha256: digest(canonicalJson(selected.packet)),
    packet: selected.packet,
  };
}
const addressableRecipient =
  /^(?:CHATGPT_WORK|CHATGPT|GEMINI|SUPERGROK|GROKBOT_[A-Z0-9]+)$/;
/** Existing Agent Comms ledger projection. It never grants authority or performs Dot review. */
export async function synchronizeRuntimePacket(
  packet: HandoffPacket,
  mapping: {
    tipProjectId: string;
    commandCenterProjectId: string;
    env: "development" | "preview";
    recipient?: string;
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
  if (
    mapping.recipient !== undefined &&
    !addressableRecipient.test(mapping.recipient)
  )
    throw new RuntimeError(400, "Command Center recipient is not addressable");
  const identity = `${packet.project_id}:${packet.mission_id}:${packet.delegation_id}`;
  const task = `TIP-${digest(identity)}`;
  const encoded = canonicalJson(packet);
  const hash = digest(encoded);
  let view = await transport.project(mapping.commandCenterProjectId);
  if (view.project.id !== mapping.commandCenterProjectId)
    throw new RuntimeError(409, "Project identity mismatch");
  const expectedCommitId = `TIP-C-${digest(`${identity}:${packet.revision}`)}`;
  const existingCommit = view.messages.find((m) => m.id === expectedCommitId);
  if (
    existingCommit &&
    (existingCommit.task_id !== task ||
      !existingCommit.body.startsWith(markerPrefix))
  )
    throw new RuntimeError(409, "Conflicting TIP commit identity");
  let latestCommittedRevision = 0;
  for (const message of view.messages.filter(
    (m) => m.task_id === task && m.body.startsWith(markerPrefix),
  )) {
    let revision: unknown;
    try {
      revision = JSON.parse(message.body.slice(markerPrefix.length)).revision;
    } catch {
      throw new RuntimeError(409, "Invalid committed TIP packet");
    }
    if (!Number.isSafeInteger(revision) || Number(revision) < 1)
      throw new RuntimeError(409, "Invalid committed TIP packet");
    // Earlier revisions are historical claims, not the proof for this publication.
    if (Number(revision) < packet.revision) continue;
    const committed = verifiedCommittedPacket(message, view, task, identity);
    if (
      committed.revision === packet.revision &&
      digest(canonicalJson(committed)) !== hash
    )
      throw new RuntimeError(409, "Conflicting TIP revision");
    latestCommittedRevision = Math.max(
      latestCommittedRevision,
      committed.revision,
    );
  }
  // Frozen Command Center baseline 0d3b53cb limits post_evidence uri to 2000.
  // Refuse before any ledger write so an overlong TIP artifact is not published.
  for (const artifact of packet.evidence) {
    if (artifact.uri.length > 2000)
      throw new RuntimeError(400, "Evidence URI exceeds Command Center limit");
  }
  if (latestCommittedRevision >= packet.revision)
    return {
      task_id: task,
      revision: latestCommittedRevision,
      published: false,
    };
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
  const addressed = (body: string): Record<string, unknown> => {
    const fields: Record<string, unknown> = {
      task_id: task,
      message_type: "STATUS",
      body,
    };
    // Recipient is ledger attribution for acknowledgment. It is not execution authority.
    if (mapping.recipient) {
      fields.recipient = mapping.recipient;
      if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(packet.mission_id))
        fields.correlation_id = packet.mission_id;
    }
    return fields;
  };
  const chunks = encoded.match(/[\s\S]{1,3000}/gu) ?? [];
  for (let index = 0; index < chunks.length; index++) {
    const id = `TIP-P-${digest(`${identity}:${packet.revision}:${hash}:${index}`)}`;
    const body = `TIP_RUNTIME_PART ${JSON.stringify({ revision: packet.revision, sha256: hash, index, total: chunks.length })}\n${chunks[index]}`;
    const existing = view.messages.find((m) => m.id === id);
    if (existing && (existing.task_id !== task || existing.body !== body))
      throw new RuntimeError(409, "Conflicting TIP packet part identity");
    if (!existing) await write("/messages", id, addressed(body));
  }
  const id = `TIP-C-${digest(`${identity}:${packet.revision}`)}`;
  if (!view.messages.some((m) => m.id === id))
    await write(
      "/messages",
      id,
      addressed(
        markerPrefix +
          JSON.stringify({
            revision: packet.revision,
            sha256: hash,
            parts: chunks.length,
            state: packet.state,
            assigned_agent_id: packet.assigned_agent_id,
            review_required: true,
          }),
      ),
    );
  const committedMessage = view.messages.find((m) => m.id === id);
  if (
    !committedMessage ||
    committedMessage.task_id !== task ||
    !committedMessage.body.startsWith(markerPrefix)
  )
    throw new RuntimeError(409, "Committed TIP packet unavailable");
  const committed = verifiedCommittedPacket(
    committedMessage,
    view,
    task,
    identity,
  );
  if (
    committed.revision !== packet.revision ||
    digest(canonicalJson(committed)) !== hash
  )
    throw new RuntimeError(409, "Conflicting TIP revision");
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

/** Same Agent Comms protocol as the candidate transport, pinned to a loopback origin. */
export function createCommandCenterLoopbackTransport(
  baseUrl: string,
  token: string,
  request: typeof fetch = fetch,
): CommandCenterTransport {
  if (!token || /[\r\n]/.test(token))
    throw new RuntimeError(
      503,
      "Authorized Command Center credential required",
    );
  let origin: URL;
  try {
    origin = new URL(baseUrl);
  } catch {
    throw new RuntimeError(400, "Loopback Agent Comms URL is invalid");
  }
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname !== "/" && origin.pathname !== "")
  )
    throw new RuntimeError(
      403,
      "Agent Comms proof transport accepts only a loopback origin",
    );
  const call = async (
    path: string,
    body?: Record<string, unknown>,
    key?: string,
  ) => {
    const target = new URL(
      `/api/agent-comms/v1${path}`,
      origin.origin,
    );
    if (target.hostname !== "127.0.0.1" || target.protocol !== "http:")
      throw new RuntimeError(403, "Agent Comms proof transport left loopback");
    const response = await request(target, {
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
    });
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
