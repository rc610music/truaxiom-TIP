export type RuntimeRiskTier = "low" | "medium" | "high" | "critical";

export interface RuntimeAgent {
  agentId: string;
  lifecycleState: "draft" | "validating" | "active" | "paused" | "deprecated" | "retired";
  capabilities: string[];
  permissions: string[];
  autonomyLevel: "observe" | "recommend" | "draft" | "execute_with_approval" | "execute";
  priority?: number;
}

export interface CapabilityRequirement {
  capabilityId: string;
  requiredPermissions?: string[];
  riskTier?: RuntimeRiskTier;
}

export interface DelegationRequest {
  missionId: string;
  requestedBy: string;
  requirement: CapabilityRequirement;
  constraints?: string[];
  evidenceRequired?: string[];
}

export interface DelegationDecision {
  missionId: string;
  assignedAgentId: string | null;
  status: "assigned" | "needs_approval" | "unroutable";
  reason: string;
}

function hasAll(values: string[], required: string[]): boolean {
  const set = new Set(values);
  return required.every((value) => set.has(value));
}

export function resolveAgent(
  agents: RuntimeAgent[],
  requirement: CapabilityRequirement
): RuntimeAgent | null {
  const requiredPermissions = requirement.requiredPermissions ?? [];

  const eligible = agents
    .filter((agent) => agent.lifecycleState === "active")
    .filter((agent) => agent.capabilities.includes(requirement.capabilityId))
    .filter((agent) => hasAll(agent.permissions, requiredPermissions))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.agentId.localeCompare(b.agentId));

  return eligible[0] ?? null;
}

export function routeDelegation(
  agents: RuntimeAgent[],
  request: DelegationRequest
): DelegationDecision {
  const agent = resolveAgent(agents, request.requirement);
  if (!agent) {
    return {
      missionId: request.missionId,
      assignedAgentId: null,
      status: "unroutable",
      reason: "No active agent satisfies the requested capability and permission boundary."
    };
  }

  const risk = request.requirement.riskTier ?? "low";
  const approvalRequired =
    risk === "critical" ||
    risk === "high" ||
    agent.autonomyLevel === "execute_with_approval" ||
    agent.autonomyLevel === "draft" ||
    agent.autonomyLevel === "recommend" ||
    agent.autonomyLevel === "observe";

  return {
    missionId: request.missionId,
    assignedAgentId: agent.agentId,
    status: approvalRequired ? "needs_approval" : "assigned",
    reason: approvalRequired
      ? "Capability matched, but governance requires operator approval before execution."
      : "Capability and permissions matched an active execution-authorized agent."
  };
}
