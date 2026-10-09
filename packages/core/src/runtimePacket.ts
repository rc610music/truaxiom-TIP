import type { HandoffPacket, MissionRecord } from "./missionRuntimeTypes";

/** One projection definition for API, manual synchronization and durable delivery. */
export function runtimeHandoffPacket(r: MissionRecord): HandoffPacket {
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
    review_required: ["REVIEW", "NEEDS_APPROVAL"].includes(r.delegation.status),
    completion_result: r.completionResult,
    updated_at: r.events.at(-1)!.created_at,
  };
}
