import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, RuntimeError } from "./runtimeContracts";
import type { MissionRuntime } from "./missionRuntime";
import type { MissionRecord, RuntimeWake } from "./missionRuntimeTypes";
import type { CommandCenterTransport } from "./commandCenterRuntimeBridge";
import { synchronizeRuntimePacket } from "./commandCenterRuntimeBridge";
import type { RuntimeDeliveryMapping } from "./runtimeDeliveryRepository";

export interface WakeEnvelope {
  schema_version: "1.0";
  event: "AgentComms.assignment.recorded";
  sender: "TIP";
  recipient: string;
  runtime_agent_id: string;
  mission_id: string;
  task_id: string;
  message_id: string;
  correlation_id: string;
  handoff_id: string | null;
  required_capability: string;
  priority: "normal";
  authority_scope: { project_id: string; permissions: string[]; policy_fingerprint: string };
  deadline: string;
  expected_response: "authenticated-wake-acknowledgment";
  evidence_requirements: string[];
  wake_id: string;
}
export interface WakeTransport {
  /** Explicit, host-authorized ledger identity binding; never inferred from display names. */
  recipient: string;
  /** Must durably record the exact addressed assignment on the existing bus first. */
  record(envelope: WakeEnvelope, record: MissionRecord): Promise<void>;
  /** HTTP acceptance is transport receipt only. Recipient acknowledges through worker API. */
  wake(envelope: WakeEnvelope, signal: AbortSignal): Promise<void>;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function wakeTaskId(record: MissionRecord, mapping: RuntimeDeliveryMapping) {
  return `TIP-${hash(`${record.mission.project_id}:${record.mission.mission_id}:${record.delegation.delegation_id}`)}`;
}
/** No second ledger, no identity impersonation, and no checkpoint-conflict auto-rebase. */
export function createWakeLedgerRecorder(transport: CommandCenterTransport, mappings: readonly RuntimeDeliveryMapping[]) {
  return async (envelope: WakeEnvelope, record: MissionRecord) => {
    const mapping = mappings.find(m => m.tip_project_id === record.mission.project_id);
    if (!mapping) throw new RuntimeError(403, "No authorized wake project mapping");
    const preflight = await transport.project(mapping.command_center_project_id) as Awaited<ReturnType<CommandCenterTransport["project"]>> & { viewer?: { agent?: string; permissions?: string[] } };
    if (preflight.project.id !== mapping.command_center_project_id || preflight.viewer?.agent !== "TIP" || !["read", "post_status", "post_evidence", "post_message"].every(p => preflight.viewer?.permissions?.includes(p))) throw new RuntimeError(403, "Dedicated TIP ledger identity and scoped delivery grants required");
    const result = await synchronizeRuntimePacket(recordToPacket(record), {
      tipProjectId: mapping.tip_project_id,
      commandCenterProjectId: mapping.command_center_project_id,
      env: mapping.environment,
    }, transport);
    if (result.task_id !== envelope.task_id) throw new RuntimeError(409, "Wake task identity mismatch");
    const view = await transport.project(mapping.command_center_project_id);
    const body = `TIP_WAKE ${canonicalJson(envelope)}`;
    if (body.length > 4000) throw new RuntimeError(400, "Wake envelope exceeds ledger limit");
    const prior = view.messages.find(m => m.id === envelope.message_id);
    if (prior) {
      const addressed = prior as typeof prior & { recipient?: string; correlation_id?: string };
      if (prior.task_id !== envelope.task_id || prior.body !== body || addressed.recipient !== envelope.recipient || addressed.correlation_id !== envelope.correlation_id) throw new RuntimeError(409, "Conflicting wake message");
      return;
    }
    await transport.write("/messages", {
      id: envelope.message_id, project_id: mapping.command_center_project_id,
      env: mapping.environment, checkpoint_version: view.project.checkpoint_version,
      task_id: envelope.task_id, recipient: envelope.recipient,
      correlation_id: envelope.correlation_id, message_type: "HANDOFF", body,
    }, `tip-wake-${envelope.wake_id}`);
  };
}
import { runtimeHandoffPacket as recordToPacket } from "./runtimePacket";

/** One bounded attempt per mission. Parallel schedulers fence through the existing mission CAS. */
export async function dispatchRuntimeWake(
  runtime: MissionRuntime,
  missionId: string,
  transport: WakeTransport,
  mapping: RuntimeDeliveryMapping,
  now: () => string = () => new Date().toISOString(),
) {
  const record = await runtime.get(missionId);
  const target = runtime.wakeTarget(record);
  if (!target) return { status: "INELIGIBLE" as const };
  if (mapping.tip_project_id !== record.mission.project_id) throw new RuntimeError(403, "Wake mapping outside project");
  if (!/^(?:CHATGPT_WORK|CHATGPT|TIP|GEMINI|SUPERGROK|GROKBOT_[A-Z0-9]+)$/.test(transport.recipient)) {
    if (record.wake?.status === "DEAD_LETTER") return { status: "DEAD_LETTER" as const };
    if (record.wake) (record.wake_history ??= []).push(structuredClone(record.wake));
    record.wake = { wake_id: hash(target.assignment_key), recipient: target.recipient, comms_recipient: "", assignment_key: target.assignment_key,
      status: "DEAD_LETTER", attempts: 0, lease_token: null, due_at: now(), recorded_at: null, sent_at: null,
      acknowledged_at: null, acknowledged_by: null, error_code: "AGENT_ENDPOINT_UNBOUND", history: [{ at: now(), event: "AGENT_ENDPOINT_UNBOUND", attempt: 0 }] };
    const expected = record.revision++;
    return { status: await runtime.repository.save(record, expected) ? "DEAD_LETTER" as const : "FENCED" as const };
  }
  const existing = record.wake?.assignment_key === target.assignment_key ? record.wake : undefined;
  if (existing?.status === "DEAD_LETTER") return { status: "DEAD_LETTER" as const };
  if (existing && existing.comms_recipient !== transport.recipient) throw new RuntimeError(409, "Recipient binding changed; review existing delivery before retry");
  if (existing && Date.parse(existing.due_at) > Date.parse(now())) return { status: "WAITING" as const };
  const save = async (r: MissionRecord) => {
    const expected = r.revision;
    r.revision++;
    return runtime.repository.save(r, expected);
  };
  // Acknowledgment without execution is independently timed out, never redelivered as fresh work.
  if (existing?.status === "ACKNOWLEDGED" || (existing && (existing.attempts >= 3 || Date.parse(existing.history[0]?.at ?? existing.due_at) + 600_000 <= Date.parse(now())))) {
    existing.status = "DEAD_LETTER";
    existing.lease_token = null;
    existing.error_code = existing.acknowledged_at ? "START_TIMEOUT" : existing.attempts >= 3 ? "ACK_TIMEOUT_OR_ATTEMPT_LIMIT" : "STALE_ASSIGNMENT";
    existing.history.push({ at: now(), event: existing.error_code, attempt: existing.attempts });
    return { status: await save(record) ? "DEAD_LETTER" as const : "FENCED" as const };
  }
  const token = randomUUID();
  const wake: RuntimeWake = existing ?? {
    wake_id: hash(target.assignment_key), recipient: target.recipient, comms_recipient: transport.recipient, assignment_key: target.assignment_key,
    status: "DISPATCHING", attempts: 0, lease_token: null, due_at: now(),
    recorded_at: null, sent_at: null, acknowledged_at: null, acknowledged_by: null,
    error_code: null, history: [],
  };
  if (!existing && record.wake) (record.wake_history ??= []).push(structuredClone(record.wake));
  const first = wake.history[0]?.at ?? now();
  // Envelope remains byte-identical across retries and lost responses; delivery lease is separate.
  const envelope: WakeEnvelope = {
    schema_version: "1.0", event: "AgentComms.assignment.recorded", sender: "TIP",
    recipient: transport.recipient, runtime_agent_id: target.recipient, mission_id: missionId, task_id: wakeTaskId(record, mapping),
    message_id: `TIP-W-${wake.wake_id}`, correlation_id: missionId,
    handoff_id: record.handoffs.filter(h => h.status === "ACCEPTED").at(-1)?.handoff_id ?? null,
    required_capability: record.mission.capability_id, priority: "normal",
    authority_scope: { project_id: record.mission.project_id, permissions: record.delegation.required_permissions, policy_fingerprint: record.delegation.policy_fingerprint },
    deadline: new Date(Date.parse(first) + 600_000).toISOString(),
    expected_response: "authenticated-wake-acknowledgment", evidence_requirements: record.delegation.evidence_required,
    wake_id: wake.wake_id,
  };
  wake.status = "DISPATCHING";
  wake.attempts++;
  wake.lease_token = token;
  wake.due_at = new Date(Date.parse(now()) + 30_000).toISOString();
  wake.history.push({ at: now(), event: "DISPATCHING", attempt: wake.attempts });
  record.wake = wake;
  if (!(await save(record))) return { status: "FENCED" as const };
  const owned = async () => {
    const latest = await runtime.get(missionId);
    return latest.wake?.lease_token === token && latest.wake.status === "DISPATCHING" && Date.parse(latest.wake.due_at) > Date.parse(now()) && runtime.wakeTarget(latest)?.assignment_key === target.assignment_key ? latest : null;
  };
  try {
    await transport.record(envelope, record);
    let latest = await owned();
    if (!latest) return { status: "FENCED" as const };
    latest.wake!.recorded_at ??= now();
    latest.wake!.history.push({ at: now(), event: "RECORDED", attempt: wake.attempts });
    if (!(await save(latest))) return { status: "FENCED" as const };
    // Recheck authority and assignment immediately before the irreversible external send.
    latest = await owned();
    if (!latest) return { status: "FENCED" as const };
    await transport.wake(envelope, AbortSignal.timeout(10_000));
    latest = await owned();
    if (!latest) return { status: "FENCED" as const };
    latest.wake!.status = "SENT";
    latest.wake!.sent_at = now();
    latest.wake!.lease_token = null;
    latest.wake!.error_code = null;
    // Bounded acknowledgment wait plus exponential backoff: 35s, 40s, 50s.
    latest.wake!.due_at = new Date(Date.parse(now()) + (30 + 5 * 2 ** (wake.attempts - 1)) * 1000).toISOString();
    latest.wake!.history.push({ at: now(), event: "SENT", attempt: wake.attempts });
    return { status: await save(latest) ? "SENT" as const : "FENCED" as const };
  } catch (error) {
    const latest = await owned();
    if (!latest) return { status: "FENCED" as const };
    const status = error instanceof RuntimeError ? error.status : 503;
    const pause = (status >= 400 && status < 500 && ![408, 429].includes(status)) || wake.attempts >= 3;
    latest.wake!.status = pause ? "DEAD_LETTER" : "RETRY_PENDING";
    latest.wake!.lease_token = null;
    latest.wake!.error_code = `WAKE_HTTP_${status}`;
    latest.wake!.due_at = new Date(Date.parse(now()) + 5000 * 2 ** (wake.attempts - 1)).toISOString();
    latest.wake!.history.push({ at: now(), event: pause ? "DEAD_LETTER" : "RETRY_PENDING", attempt: wake.attempts });
    return { status: !(await save(latest)) ? "FENCED" as const : pause ? "DEAD_LETTER" as const : "RETRY_PENDING" as const };
  }
}

/** Compact operator projection; no lease tokens or raw discussion on the primary surface. */
export function runtimeWakeSummary(r: MissionRecord) {
  return {
    mission_id: r.mission.mission_id, title: r.mission.title, status: r.delegation.status,
    owner: r.delegation.assigned_agent_id, current_step: r.delegation.status,
    wake_status: r.wake?.status ?? "NOT_DISPATCHED", attempts: r.wake?.attempts ?? 0,
    approval_required: r.delegation.status === "NEEDS_APPROVAL",
    blockers: [...r.blockers, ...(r.wake?.status === "DEAD_LETTER" ? [r.wake.error_code ?? "WAKE_DEAD_LETTER"] : [])],
    result: r.completionResult, independent_verification: "NOT_RECORDED",
  };
}

/** Projected notices only; delivery requires a separately configured owner notification channel. */
export function runtimeExecutiveNotice(r: MissionRecord) {
  const kind = r.delegation.status === "NEEDS_APPROVAL" ? "APPROVAL_REQUIRED" :
    r.wake?.status === "DEAD_LETTER" || r.delegation.status === "FAILED" || r.delegation.status === "UNROUTABLE" ? "MATERIAL_BLOCKER" : null;
  if (!kind) return null;
  return { event_id: hash(canonicalJson([r.mission.mission_id, kind, r.wake?.wake_id ?? r.events.at(-1)?.event_id])),
    kind, mission_id: r.mission.mission_id, title: r.mission.title,
    summary: kind === "APPROVAL_REQUIRED" ? "Execution is waiting at its permission boundary." : r.wake?.error_code ?? r.blockers.join("; "),
    dot_action_required: kind === "APPROVAL_REQUIRED" };
}
