export type EntityStatus = "planned" | "active" | "paused" | "archived";
export type ConfidenceStatus = "unknown" | "low" | "medium" | "high" | "verified";
export type ApprovalStatus = "draft" | "needs_review" | "approved" | "rejected";
export type RelationshipType =
  | "owns"
  | "contains"
  | "depends_on"
  | "supports"
  | "informs"
  | "generates"
  | "measures"
  | "publishes_to"
  | "belongs_to"
  | "references";

export interface BaseEntity {
  id: string;
  name: string;
  description?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface Organization extends BaseEntity {
  mission: string;
  vision: string;
  values: string[];
  domains: string[];
}

export interface Product extends BaseEntity {
  organizationId: string;
  category: "platform" | "website" | "app" | "brand" | "service" | "content-property";
  publicUrl?: string;
  repository?: string;
  stage: "concept" | "prototype" | "mvp" | "production" | "commercial";
}

export interface Project extends BaseEntity {
  productId?: string;
  organizationId: string;
  priority: "low" | "medium" | "high" | "critical";
  sprint?: string;
  nextAction?: string;
}

export interface Module extends BaseEntity {
  systemId?: string;
  capability: string;
  installable: boolean;
}

export interface Agent extends BaseEntity {
  productId?: string;
  moduleIds: string[];
  objective: string;
  autonomyLevel: "observe" | "recommend" | "draft" | "execute_with_approval" | "execute";
}

export interface KnowledgeObject extends BaseEntity {
  sourceType: "manual" | "website" | "repository" | "document" | "conversation" | "analytics" | "system";
  sourceUri?: string;
  confidence: ConfidenceStatus;
  approvalStatus: ApprovalStatus;
  freshness: "new" | "current" | "aging" | "stale" | "unknown";
}

export interface GraphNode {
  id: string;
  entityType: "organization" | "product" | "project" | "module" | "agent" | "knowledge" | "task" | "decision" | "activity";
  entityId: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: RelationshipType;
  confidence: ConfidenceStatus;
  source?: string;
  createdAt: string;
}

export interface Task extends BaseEntity {
  assignedTo?: string;
  productId?: string;
  projectId?: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
}

export interface Decision extends BaseEntity {
  adrId?: string;
  decision: string;
  rationale: string;
  consequences: string[];
}

export interface ActivityEvent {
  id: string;
  type: "created" | "updated" | "recommended" | "approved" | "published" | "blocked" | "completed";
  label: string;
  description?: string;
  entityId?: string;
  entityType?: GraphNode["entityType"];
  occurredAt: string;
}

export interface OrganizationContextPacket {
  organization: Organization;
  activeProducts: Product[];
  activeProjects: Project[];
  activeAgents: Agent[];
  installedModules: Module[];
  recentKnowledge: KnowledgeObject[];
  recentActivity: ActivityEvent[];
  graphSummary: {
    nodes: number;
    edges: number;
    verifiedKnowledgeObjects: number;
    staleKnowledgeObjects: number;
  };
}
