import type { RuntimeAgent, RuntimeRiskTier } from "./taxisRuntime";
export type MissionState =
  | "UNROUTABLE"
  | "NEEDS_APPROVAL"
  | "ASSIGNED"
  | "RUNNING"
  | "BLOCKED"
  | "REVIEW"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export interface AgentManifest {
  agent_id: string;
  lifecycle_state: RuntimeAgent["lifecycleState"];
  capabilities: string[];
  permissions: { read: string[]; write: string[]; actions: string[] };
  approval_policy: {
    default_tier: RuntimeAgent["autonomyLevel"];
    approval_required_for: string[];
  };
  output_contracts: string[];
  scope: string[];
  exclusions: string[];
  [key: string]: unknown;
}
export interface CapabilityManifest {
  capability_id: string;
  required_permissions: string[];
  risk_tier: RuntimeRiskTier;
  outputs: string[];
  [key: string]: unknown;
}
export interface MissionInput {
  schema_version: "1.0";
  mission_id: string;
  project_id: string;
  title: string;
  capability_id: string;
  required_permissions: string[];
  risk_tier: RuntimeRiskTier;
  constraints: string[];
  evidence_required: string[];
  inputs?: { repository: string; ref: string };
}
export interface DelegationEnvelope {
  schema_version: "2.0";
  mission_id: string;
  delegation_id: string;
  requested_capability: string;
  assigned_agent_id: string | null;
  requested_by: string;
  status: MissionState;
  created_at: string;
  constraints: string[];
  evidence_required: string[];
  required_permissions: string[];
  risk_tier: RuntimeRiskTier;
  policy_fingerprint: string;
}
export interface ExecutionLease {
  token: string;
  attempt_id: string;
  agent_id: string;
  epoch: number;
  expires_at: string;
}
export interface Artifact {
  schema_version: "1.0";
  mission_id: string;
  delegation_id: string;
  artifact_id: string;
  kind: string;
  uri: string;
  sha256: string;
  summary: string;
  verification_level?: "CLAIMED" | "HASH_VERIFIED";
  attached_by: string;
  created_at: string;
}
export interface StateEvent {
  schema_version: "1.0";
  mission_id: string;
  delegation_id: string;
  event_id: string;
  sequence: number;
  from_state: MissionState | null;
  to_state: MissionState;
  actor: string;
  reason: string;
  created_at: string;
}
export interface PermissionRequest {
  schema_version: "1.0";
  mission_id: string;
  delegation_id: string;
  request_id: string;
  permissions: string[];
  policy_fingerprint: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
}
export interface FailureEvent {
  schema_version: "1.0";
  mission_id: string;
  delegation_id: string;
  failure_id: string;
  code: string;
  message: string;
  retryable: boolean;
  recorded_by: string;
  created_at: string;
}
export interface HandoffRequest {
  schema_version: "1.0";
  mission_id: string;
  delegation_id: string;
  handoff_id: string;
  from_agent_id: string;
  to_agent_id: string;
  reason: string;
  status: "PENDING" | "ACCEPTED";
  requested_by: string;
  accepted_by: string | null;
  created_at: string;
  accepted_at: string | null;
}
export type RuntimeCommand = {
  command_id: string;
  expected_revision: number;
  lease_token?: string;
} & (
  | { type: "claim"; attempt_id: string; ttl_seconds: number }
  | { type: "heartbeat"; ttl_seconds: number }
  | {
      type: "transition";
      state: "RUNNING" | "BLOCKED" | "REVIEW" | "CANCELLED";
      reason: string;
      result?: string;
    }
  | { type: "approve" | "reject"; note: string }
  | { type: "review"; accepted: boolean; note: string }
  | {
      type: "evidence";
      artifact_id: string;
      kind: string;
      uri: string;
      sha256: string;
      summary: string;
    }
  | {
      type: "failure";
      failure_id: string;
      code: string;
      message: string;
      retryable: boolean;
    }
  | { type: "handoff"; handoff_id: string; to_agent_id: string; reason: string }
  | { type: "accept_handoff"; handoff_id: string }
);
export interface RuntimePrincipal {
  actor: string;
  role: "operator" | "agent";
}
export interface MissionRecord {
  mission: MissionInput;
  delegation: DelegationEnvelope;
  revision: number;
  createdBy: string;
  events: StateEvent[];
  evidence: Artifact[];
  failures: FailureEvent[];
  handoffs: HandoffRequest[];
  permissionRequests: PermissionRequest[];
  blockers: string[];
  completionResult: string | null;
  lease?: ExecutionLease;
  receipts: Record<string, { input: string; revision: number }>;
}

export interface HandoffPacket {
  schema_version: "1.0";
  source: "TIP";
  mission_id: string;
  delegation_id: string;
  project_id: string;
  revision: number;
  assigned_agent_id: string | null;
  state: MissionState;
  blockers: string[];
  evidence: Artifact[];
  handoffs: HandoffRequest[];
  failures: FailureEvent[];
  review_required: boolean;
  completion_result: string | null;
  updated_at: string;
}
