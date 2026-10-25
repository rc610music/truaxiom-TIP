import type { HandoffPacket, MissionRecord } from "./missionRuntimeTypes";

/** One projection definition for API, manual synchronization and durable delivery. */
export function runtimeHandoffPacket(r: MissionRecord): HandoffPacket {
  const permission = r.permissionRequests.at(-1);
  return {
    operations: {
      title: r.mission.title,
      required_capabilities: [r.mission.capability_id],
      required_permissions: r.delegation.required_permissions,
      routing: r.routingDecision ?? null,
      latest_event: r.events.at(-1)!,
      approval_status: permission?.status === "APPROVED" ? "OPERATOR_APPROVED" : permission?.status ?? "NOT_REQUIRED",
      verification_status: r.evidence.length && r.evidence.every(e => e.verification_level === "HASH_VERIFIED") ? "HASH_VERIFIED" : r.evidence.length ? "CLAIMED" : "UNVERIFIED",
      // The executor packet cannot certify an independent re-observation.
      independent_verification: "NOT_RECORDED",
      next_action: r.handoffs.some(h => h.status === "PENDING") ? "Recipient must accept the handoff; governance is re-evaluated." : ({ UNROUTABLE: "Review missing capability, scope or permissions.", NEEDS_APPROVAL: "Operator permission decision required.", ASSIGNED: "Selected agent must claim its delegation.", RUNNING: "Execute within the current lease and attach evidence.", BLOCKED: "Resolve the recorded blocker.", REVIEW: "Review the output; content hashes do not establish correctness.", COMPLETED: "Independently verify the result; Dot approval remains separate.", FAILED: "Inspect failure evidence before creating a retry mission.", CANCELLED: "No execution authorized." })[r.delegation.status],
    },
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
    review_required: ["REVIEW", "NEEDS_APPROVAL"].includes(r.delegation.status),
    completion_result: r.completionResult,
    updated_at: r.events.at(-1)!.created_at,
  };
}
