import {
  routeDelegation,
  type RuntimeAgent,
  type RuntimeRiskTier,
} from "./taxisRuntime";
import {
  canonicalJson,
  RuntimeError,
  validateRuntimeContract,
} from "./runtimeContracts";
import type { ArtifactRepository } from "./runtimeArtifactRepository";
import type { MissionRepository } from "./missionRepository";
import { registryV1 } from "./registryV1";

import { createHash, randomUUID } from "node:crypto";
import type {
  MissionState,
  AgentManifest,
  CapabilityManifest,
  MissionInput,
  DelegationEnvelope,
  Artifact,
  StateEvent,
  PermissionRequest,
  FailureEvent,
  HandoffRequest,
  RuntimeCommand,
  RuntimePrincipal,
  MissionRecord,
  HandoffPacket,
} from "./missionRuntimeTypes";
export type {
  MissionState,
  AgentManifest,
  CapabilityManifest,
  MissionInput,
  DelegationEnvelope,
  Artifact,
  StateEvent,
  PermissionRequest,
  FailureEvent,
  HandoffRequest,
  RuntimeCommand,
  RuntimePrincipal,
  MissionRecord,
  HandoffPacket,
} from "./missionRuntimeTypes";
const riskOrder: RuntimeRiskTier[] = ["low", "medium", "high", "critical"];
const terminal = new Set<MissionState>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "UNROUTABLE",
]);
const privileged =
  /production|promot|billing|credential|secret|destruct|delete|drop|purge|security|policy|permission|admin|privileg|dns/i;
function demand(ok: unknown, message: string, status = 409): asserts ok {
  if (!ok) throw new RuntimeError(status, message);
}
function runtimeAgent(a: AgentManifest): RuntimeAgent {
  // Prefixes preserve read/write/action namespaces; a read grant never implies a write.
  return {
    agentId: a.agent_id,
    lifecycleState: a.lifecycle_state,
    capabilities: a.capabilities,
    permissions: Object.entries(a.permissions).flatMap(([kind, values]) =>
      values.map((v: string) => `${kind}:${v}`),
    ),
    autonomyLevel: a.approval_policy.default_tier,
  };
}
export class MissionRuntime {
  constructor(
    public repository: MissionRepository,
    private catalog: {
      agents: AgentManifest[];
      capabilities: CapabilityManifest[];
    },
    private now = () => new Date().toISOString(),
    private artifacts?: ArtifactRepository,
  ) {
    const agents = new Set<string>(),
      caps = new Set<string>();
    for (const a of catalog.agents) {
      validateRuntimeContract("agent-manifest", a);
      demand(!agents.has(a.agent_id), "Duplicate agent manifest", 400);
      agents.add(a.agent_id);
    }
    for (const c of catalog.capabilities) {
      validateRuntimeContract("capability-manifest", c);
      demand(!caps.has(c.capability_id), "Duplicate capability manifest", 400);
      caps.add(c.capability_id);
      demand(
        c.required_permissions.every((p) =>
          /^(read|write|actions):[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(p),
        ),
        "Capability permissions must be namespaced read:/write:/actions:",
        400,
      );
    }
    for (const a of catalog.agents) {
      demand(
        a.approval_policy.approval_required_for.every(
          (selector) =>
            caps.has(selector) ||
            /^(read|write|actions):[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(
              selector,
            ),
        ),
        "Ambiguous approval-policy selector",
        400,
      );
    }
  }
  private policy(m: MissionInput, onlyAgent?: string) {
    const cap = this.catalog.capabilities.find(
      (c) => c.capability_id === m.capability_id,
    );
    if (!cap) return null;
    validateRuntimeContract("capability-manifest", cap);
    for (const agent of this.catalog.agents)
      validateRuntimeContract("agent-manifest", agent);
    const permissions = [
      ...new Set([...cap.required_permissions, ...m.required_permissions]),
    ].sort();
    const risk =
      riskOrder[
        Math.max(
          riskOrder.indexOf(cap.risk_tier),
          riskOrder.indexOf(m.risk_tier),
        )
      ];
    const agents = this.catalog.agents.filter(
      (a) =>
        (!onlyAgent || a.agent_id === onlyAgent) &&
        cap.outputs.every((output) => a.output_contracts.includes(output)) &&
        (a.scope.includes(m.project_id) || a.scope.includes(m.capability_id)) &&
        !a.exclusions.some(
          (x) =>
            x === m.project_id ||
            x === m.capability_id ||
            permissions.includes(x),
        ),
    );
    const decision = routeDelegation(agents.map(runtimeAgent), {
      missionId: m.mission_id,
      requestedBy: "runtime",
      requirement: {
        capabilityId: m.capability_id,
        requiredPermissions: permissions,
        riskTier: risk,
      },
    });
    const agent = agents.find((a) => a.agent_id === decision.assignedAgentId);
    const gated =
      decision.status === "needs_approval" ||
      privileged.test([m.capability_id, ...permissions].join(" ")) ||
      permissions.some(
        (p) => p.startsWith("write:") || p.startsWith("actions:"),
      ) ||
      Boolean(
        agent?.approval_policy.approval_required_for.some(
          (x) => x === m.capability_id || permissions.includes(x),
        ),
      );
    return {
      cap,
      agent,
      permissions,
      risk,
      state: !agent ? "UNROUTABLE" : gated ? "NEEDS_APPROVAL" : "ASSIGNED",
      fingerprint: createHash("sha256")
        .update(
          canonicalJson({
            cap,
            agent: agent ?? null,
            permissions,
            risk,
            project: m.project_id,
          }),
        )
        .digest("hex"),
    };
  }
  private base(r: MissionRecord) {
    return {
      schema_version: "1.0" as const,
      mission_id: r.mission.mission_id,
      delegation_id: r.delegation.delegation_id,
    };
  }
  private event(
    r: MissionRecord,
    to: MissionState,
    actor: string,
    reason: string,
  ) {
    const sequence = r.events.length + 1;
    r.events.push({
      ...this.base(r),
      event_id: `${r.delegation.delegation_id}:E${sequence}`,
      sequence,
      from_state: r.events.length ? r.delegation.status : null,
      to_state: to,
      actor,
      reason,
      created_at: this.now(),
    });
    r.delegation.status = to;
  }
  private permission(r: MissionRecord) {
    r.permissionRequests.push({
      ...this.base(r),
      request_id: `${r.delegation.delegation_id}:P${r.permissionRequests.length + 1}`,
      permissions: r.delegation.required_permissions,
      policy_fingerprint: r.delegation.policy_fingerprint,
      status: "PENDING",
      requested_at: this.now(),
      decided_by: null,
      decided_at: null,
      note: null,
    });
  }
  private validateRecord(r: MissionRecord) {
    validateRuntimeContract("mission", r.mission);
    validateRuntimeContract("delegation-envelope", r.delegation, "v2");
    for (const [name, records] of [
      ["artifact", r.evidence],
      ["state-event", r.events],
      ["permission-request", r.permissionRequests],
      ["failure-event", r.failures],
      ["handoff-request", r.handoffs],
    ] as const)
      for (const item of records) validateRuntimeContract(name, item);
    validateRuntimeContract("handoff-packet", this.packet(r));
  }
  async create(
    input: unknown,
    principal: RuntimePrincipal,
  ): Promise<MissionRecord> {
    demand(
      principal.role === "operator",
      "Only operators create missions",
      403,
    );
    validateRuntimeContract("mission", input);
    const m = structuredClone(input as MissionInput);
    demand(
      registryV1.projects.some((p) => p.id === m.project_id),
      "Unknown Registry v1 project",
      400,
    );
    demand(
      m.required_permissions.every((p) =>
        /^(read|write|actions):[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(p),
      ),
      "Mission permissions require namespaces",
      400,
    );
    const existing = await this.repository.get(m.mission_id);
    if (existing) {
      demand(
        canonicalJson(existing.mission) === canonicalJson(m) &&
          existing.createdBy === principal.actor,
        "Mission idempotency conflict",
      );
      return existing;
    }
    const p = this.policy(m),
      delegationId = `D:${m.mission_id}`;
    const r: MissionRecord = {
      mission: m,
      createdBy: principal.actor,
      revision: 1,
      delegation: {
        schema_version: "2.0",
        mission_id: m.mission_id,
        delegation_id: delegationId,
        requested_capability: m.capability_id,
        assigned_agent_id: p?.agent?.agent_id ?? null,
        requested_by: principal.actor,
        status: (p?.state ?? "UNROUTABLE") as MissionState,
        created_at: this.now(),
        constraints: m.constraints,
        evidence_required: [
          ...new Set([...(p?.cap.outputs ?? []), ...m.evidence_required]),
        ].sort(),
        required_permissions: p?.permissions ?? m.required_permissions,
        risk_tier: p?.risk ?? m.risk_tier,
        policy_fingerprint: p?.fingerprint ?? "unknown-capability",
      },
      events: [],
      evidence: [],
      failures: [],
      handoffs: [],
      permissionRequests: [],
      blockers: [],
      completionResult: null,
      receipts: {},
    };
    this.event(
      r,
      r.delegation.status,
      principal.actor,
      p?.agent
        ? "Capability and permission routing evaluated"
        : "No eligible declared agent/capability",
    );
    if (r.delegation.status === "UNROUTABLE")
      r.blockers = ["No eligible declared agent/capability"];
    if (r.delegation.status === "NEEDS_APPROVAL") this.permission(r);
    this.validateRecord(r);
    if (!(await this.repository.save(r, 0))) return this.create(m, principal);
    return r;
  }
  async get(id: string) {
    const r = await this.repository.get(id);
    demand(r, "Mission not found", 404);
    return r;
  }
  packet(r: MissionRecord): HandoffPacket {
    return {
      schema_version: "1.0",
      source: "TIP",
      mission_id: r.mission.mission_id,
      delegation_id: r.delegation.delegation_id,
      project_id: r.mission.project_id,
      revision: r.revision,
      assigned_agent_id: r.delegation.assigned_agent_id,
      state: r.delegation.status,
      blockers: r.blockers,
      evidence: r.evidence,
      handoffs: r.handoffs,
      failures: r.failures,
      review_required:
        r.delegation.status === "REVIEW" ||
        r.delegation.status === "NEEDS_APPROVAL",
      completion_result: r.completionResult,
      updated_at: r.events.at(-1)!.created_at,
    };
  }
  async command(
    id: string,
    input: unknown,
    principal: RuntimePrincipal,
  ): Promise<MissionRecord> {
    validateRuntimeContract("runtime-command", input);
    const c = input as RuntimeCommand,
      r = await this.get(id),
      d = r.delegation;
    const receiptInput = canonicalJson({ command: c, principal });
    const prior = Object.hasOwn(r.receipts, c.command_id)
      ? r.receipts[c.command_id]
      : undefined;
    if (prior) {
      demand(prior.input === receiptInput, "Command idempotency conflict");
      return r;
    }
    demand(r.revision === c.expected_revision, "Stale mission revision");
    demand(!terminal.has(d.status), "Terminal mission is immutable");
    const pending = r.handoffs.find((h) => h.status === "PENDING");
    demand(
      principal.role === "operator" ||
        principal.actor === d.assigned_agent_id ||
        (c.type === "accept_handoff" &&
          pending?.to_agent_id === principal.actor),
      "Agent does not own delegation",
      403,
    );
    const requireLease = () => {
      const currentPolicy = this.policy(r.mission, principal.actor);
      demand(
        currentPolicy?.agent &&
          currentPolicy.fingerprint === d.policy_fingerprint,
        "Worker authority revoked",
        403,
      );
      demand(
        r.lease &&
          r.lease.agent_id === principal.actor &&
          r.lease.token === c.lease_token &&
          Date.parse(r.lease.expires_at) > Date.parse(this.now()),
        "Valid execution lease required",
        403,
      );
    };
    if (
      principal.role === "agent" &&
      !["claim", "accept_handoff", "approve", "reject", "review"].includes(
        c.type,
      )
    )
      requireLease();
    if (
      principal.role === "operator" &&
      r.lease &&
      Date.parse(r.lease.expires_at) > Date.parse(this.now()) &&
      !(c.type === "transition" && c.state === "CANCELLED") &&
      c.type !== "review"
    )
      demand(
        false,
        "Worker owns a live execution lease; cancel or await expiry",
      );
    const operator = () =>
      demand(
        principal.role === "operator",
        "Operator review/approval required",
        403,
      );
    if (c.type === "claim") {
      demand(
        principal.role === "agent" && principal.actor === d.assigned_agent_id,
        "Only assigned worker can claim",
        403,
      );
      demand(
        !pending && ["ASSIGNED", "BLOCKED", "RUNNING"].includes(d.status),
        "Mission not claimable",
      );
      demand(
        !r.lease || Date.parse(r.lease.expires_at) <= Date.parse(this.now()),
        "Execution lease already held",
      );
      const p = this.policy(r.mission, principal.actor);
      demand(
        p?.agent && p.fingerprint === d.policy_fingerprint,
        "Authority changed; execution denied",
        403,
      );
      demand(
        ["execute", "execute_with_approval"].includes(
          p.agent.approval_policy.default_tier,
        ),
        "Non-executing autonomy",
        403,
      );
      if (p.state === "NEEDS_APPROVAL")
        demand(
          r.permissionRequests.at(-1)?.status === "APPROVED" &&
            r.permissionRequests.at(-1)?.policy_fingerprint === p.fingerprint,
          "Approval required",
          403,
        );
      r.lease = {
        token: randomUUID(),
        attempt_id: c.attempt_id,
        agent_id: principal.actor,
        epoch: (r.lease?.epoch ?? 0) + 1,
        expires_at: new Date(
          Date.parse(this.now()) + c.ttl_seconds * 1000,
        ).toISOString(),
      };
      r.blockers = [];
      this.event(
        r,
        "RUNNING",
        principal.actor,
        "Worker claimed execution lease",
      );
    } else if (c.type === "heartbeat") {
      requireLease();
      r.lease!.expires_at = new Date(
        Date.parse(this.now()) + c.ttl_seconds * 1000,
      ).toISOString();
      this.event(r, d.status, principal.actor, "Worker lease heartbeat");
    } else if (c.type === "approve" || c.type === "reject") {
      operator();
      demand(d.status === "NEEDS_APPROVAL", "No approval pending");
      const p = this.policy(r.mission, d.assigned_agent_id ?? "");
      demand(
        p?.agent && p.fingerprint === d.policy_fingerprint,
        "Authority changed; create a new mission",
        403,
      );
      const req = r.permissionRequests.at(-1)!;
      demand(req.status === "PENDING", "No permission request pending");
      req.status = c.type === "approve" ? "APPROVED" : "REJECTED";
      req.decided_by = principal.actor;
      req.decided_at = this.now();
      req.note = c.note;
      this.event(
        r,
        c.type === "approve" ? "ASSIGNED" : "CANCELLED",
        principal.actor,
        c.note,
      );
    } else if (c.type === "transition") {
      if (c.state === "CANCELLED") operator();
      const allowed: Record<string, MissionState[]> = {
        ASSIGNED: ["RUNNING", "BLOCKED", "CANCELLED"],
        NEEDS_APPROVAL: ["CANCELLED"],
        RUNNING: ["BLOCKED", "REVIEW", "CANCELLED"],
        BLOCKED: ["RUNNING", "CANCELLED"],
        REVIEW: ["CANCELLED"],
      };
      demand(
        allowed[d.status]?.includes(c.state),
        `Invalid transition ${d.status} -> ${c.state}`,
      );
      demand(!pending || c.state === "CANCELLED", "Handoff acceptance pending");
      if (c.state === "RUNNING") {
        demand(
          principal.role === "operator",
          "Workers must claim a lease before execution",
          403,
        );
        const p = this.policy(r.mission, d.assigned_agent_id ?? "");
        demand(
          p?.agent && p.fingerprint === d.policy_fingerprint,
          "Authority changed; execution denied",
          403,
        );
        demand(
          ["execute", "execute_with_approval"].includes(
            p.agent.approval_policy.default_tier,
          ),
          "Non-executing autonomy cannot be elevated by approval",
          403,
        );
        if (p.state === "NEEDS_APPROVAL")
          demand(
            r.permissionRequests.at(-1)?.status === "APPROVED" &&
              r.permissionRequests.at(-1)?.policy_fingerprint === p.fingerprint,
            "Execution requires policy-bound approval",
            403,
          );
      }
      if (c.state === "REVIEW") {
        demand(
          r.evidence.length > 0 &&
            d.evidence_required.every((k) =>
              r.evidence.some((e) => e.kind === k),
            ),
          "Required evidence missing",
        );
        demand(c.result, "Completion result required", 400);
        if (r.lease)
          demand(
            r.evidence.some((e) => e.verification_level === "HASH_VERIFIED") &&
              d.evidence_required.every((kind) =>
                r.evidence.some(
                  (e) =>
                    e.kind === kind && e.verification_level === "HASH_VERIFIED",
                ),
              ),
            "Worker result requires stored verified evidence for every required output",
          );
        r.completionResult = c.result;
      }
      r.blockers = c.state === "BLOCKED" ? [c.reason] : [];
      this.event(r, c.state, principal.actor, c.reason);
    } else if (c.type === "evidence") {
      demand(
        ["RUNNING", "BLOCKED", "REVIEW"].includes(d.status),
        "Evidence requires started work",
      );
      demand(
        !r.evidence.some((e) => e.artifact_id === c.artifact_id),
        "Duplicate artifact id",
      );
      let verification: "CLAIMED" | "HASH_VERIFIED" = "CLAIMED";
      if (c.uri.startsWith("urn:tip:artifact:")) {
        demand(this.artifacts, "Artifact storage unavailable", 503);
        const body = await this.artifacts.get(c.sha256);
        demand(
          body &&
            c.uri === `urn:tip:artifact:${c.sha256}` &&
            body.kind === c.kind &&
            body.mission_id === id &&
            createHash("sha256").update(canonicalJson(body)).digest("hex") ===
              c.sha256,
          "Stored artifact verification failed",
          400,
        );
        verification = "HASH_VERIFIED";
      }
      r.evidence.push({
        ...this.base(r),
        artifact_id: c.artifact_id,
        kind: c.kind,
        uri: c.uri,
        sha256: c.sha256,
        summary: c.summary,
        verification_level: verification,
        attached_by: principal.actor,
        created_at: this.now(),
      });
      this.event(
        r,
        d.status,
        principal.actor,
        verification === "HASH_VERIFIED"
          ? "Stored artifact hash verified"
          : "Evidence reference attached (content not independently verified)",
      );
    } else if (c.type === "failure") {
      demand(
        ["RUNNING", "BLOCKED"].includes(d.status),
        "Failure requires started work",
      );
      demand(
        !r.failures.some((f) => f.failure_id === c.failure_id),
        "Duplicate failure id",
      );
      r.failures.push({
        ...this.base(r),
        failure_id: c.failure_id,
        code: c.code,
        message: c.message,
        retryable: c.retryable,
        recorded_by: principal.actor,
        created_at: this.now(),
      });
      r.blockers = [c.message];
      this.event(r, "FAILED", principal.actor, c.message);
    } else if (c.type === "handoff") {
      demand(
        ["RUNNING", "BLOCKED"].includes(d.status) && !pending,
        "Handoff requires started work and no pending handoff",
      );
      demand(
        !r.handoffs.some((h) => h.handoff_id === c.handoff_id),
        "Duplicate handoff id",
      );
      demand(
        c.to_agent_id !== d.assigned_agent_id,
        "Handoff must change agent",
        400,
      );
      demand(
        this.policy(r.mission, c.to_agent_id)?.agent,
        "Target agent not eligible",
        403,
      );
      r.handoffs.push({
        ...this.base(r),
        handoff_id: c.handoff_id,
        from_agent_id: d.assigned_agent_id!,
        to_agent_id: c.to_agent_id,
        reason: c.reason,
        status: "PENDING",
        requested_by: principal.actor,
        accepted_by: null,
        created_at: this.now(),
        accepted_at: null,
      });
      r.blockers = [c.reason];
      this.event(r, "BLOCKED", principal.actor, "Awaiting handoff acceptance");
    } else if (c.type === "accept_handoff") {
      demand(
        principal.role === "operator" ||
          pending?.to_agent_id === principal.actor,
        "Only recipient or operator can accept",
        403,
      );
      demand(
        pending && pending.handoff_id === c.handoff_id,
        "Handoff not pending",
      );
      const p = this.policy(r.mission, pending.to_agent_id);
      demand(p?.agent, "Target agent authority revoked", 403);
      pending.status = "ACCEPTED";
      pending.accepted_by = principal.actor;
      pending.accepted_at = this.now();
      d.assigned_agent_id = p.agent.agent_id;
      d.required_permissions = p.permissions;
      d.risk_tier = p.risk;
      d.policy_fingerprint = p.fingerprint;
      // Approval is scoped to assignment, never carried across a handoff.
      if (p.state === "NEEDS_APPROVAL") this.permission(r);
      r.blockers = [];
      this.event(
        r,
        p.state as MissionState,
        principal.actor,
        "Handoff accepted; governance reevaluated",
      );
    } else if (c.type === "review") {
      operator();
      demand(d.status === "REVIEW", "Mission is not in review");
      demand(
        d.evidence_required.every((k) =>
          r.evidence.some((e) => e.kind === k),
        ) && r.completionResult,
        "Completion evidence/result missing",
      );
      if (!c.accepted) {
        r.blockers = [c.note];
        r.completionResult = null;
      }
      this.event(
        r,
        c.accepted ? "COMPLETED" : "BLOCKED",
        principal.actor,
        c.note,
      );
    }
    if (r.lease && d.status !== "RUNNING") r.lease.expires_at = this.now();
    r.revision++;
    r.receipts[c.command_id] = { input: receiptInput, revision: r.revision };
    this.validateRecord(r);
    if (!(await this.repository.save(r, c.expected_revision))) {
      const latest = await this.get(id);
      if (
        Object.hasOwn(latest.receipts, c.command_id) &&
        latest.receipts[c.command_id].input === receiptInput
      )
        return latest;
      throw new RuntimeError(409, "Concurrent mission update; reload revision");
    }
    return r;
  }
}
