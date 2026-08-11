export type EntityStatus = "planned" | "active" | "paused" | "archived";
export type ConfidenceStatus = "unknown" | "low" | "medium" | "high" | "verified";
export type ApprovalStatus = "draft" | "needs_review" | "approved" | "rejected";
export type Priority = "low" | "medium" | "high" | "critical" | "urgent";
export type TaskWorkflowStatus = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done";
export type RecommendationStatus = "new" | "accepted" | "rejected" | "converted_to_task" | "implemented";
export type RecommendationType =
  | "content_gap"
  | "architecture"
  | "workflow"
  | "seo"
  | "brand"
  | "product"
  | "operations"
  | "risk";

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
  | "references"
  | "creates"
  | "updates"
  | "recommends"
  | "covers"
  | "has_gap"
  | "clusters_with"
  | "canonical_for"
  | "extracted_from"
  | "stored_in"
  | "syncs_with";

export type ContentItemType = "page" | "article" | "resource" | "practice" | "quiz" | "offer" | "podcast" | "video" | "social" | "email";
export type ContentLifecycleStatus = "discovered" | "mapped" | "needs_review" | "approved" | "stale" | "gap" | "planned";
export type ContentIntent = "awareness" | "education" | "conversion" | "retention" | "trust" | "community" | "support";
export type ContentGapType = "missing_topic" | "thin_content" | "stale_content" | "broken_path" | "weak_conversion" | "seo_opportunity" | "brand_alignment";
export type IngestionRunStatus = "queued" | "running" | "completed" | "failed";
export type DataCollectionName =
  | "organizations"
  | "products"
  | "projects"
  | "modules"
  | "agents"
  | "knowledgeObjects"
  | "tasks"
  | "recommendations"
  | "ingestionSources"
  | "contentMaps"
  | "graphNodes"
  | "graphEdges"
  | "activity";
export type CrawlStatus = "queued" | "fetching" | "extracted" | "mapped" | "failed" | "skipped";
export type ExtractedContentFormat = "html" | "markdown" | "text" | "json";

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
  priority: Priority;
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
  entityType:
    | "organization"
    | "product"
    | "project"
    | "module"
    | "agent"
    | "knowledge"
    | "task"
    | "decision"
    | "activity"
    | "recommendation"
    | "source"
    | "content_map"
    | "content_item"
    | "content_gap"
    | "ingestion_run"
    | "extracted_content"
    | "repository_collection";
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
  recommendationId?: string;
  priority: Priority;
  workflowStatus: TaskWorkflowStatus;
  dueDate?: string;
  acceptanceCriteria?: string[];
}

export interface Recommendation extends BaseEntity {
  type: RecommendationType;
  productId?: string;
  projectId?: string;
  agentId?: string;
  moduleId?: string;
  priority: Priority;
  confidence: ConfidenceStatus;
  recommendationStatus: RecommendationStatus;
  rationale: string;
  evidence: string[];
  expectedImpact: string;
  nextAction: string;
  createsTaskIds?: string[];
}

export interface Decision extends BaseEntity {
  adrId?: string;
  decision: string;
  rationale: string;
  consequences: string[];
}

export interface ActivityEvent {
  id: string;
  type: "created" | "updated" | "recommended" | "approved" | "published" | "blocked" | "completed" | "ingested";
  label: string;
  description?: string;
  entityId?: string;
  entityType?: GraphNode["entityType"];
  occurredAt: string;
}

export interface IngestionSource {
  id: string;
  productId: string;
  label: string;
  url: string;
  sourceType: "website" | "cms" | "repository" | "document_store" | "analytics";
  crawlFrequency: "manual" | "daily" | "weekly" | "event_driven";
  sections?: string[];
  enabled: boolean;
}

export interface IngestionRun {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  status: IngestionRunStatus;
  discoveredItems: number;
  createdKnowledgeObjects: number;
  notes?: string[];
}

export interface ContentMapItem {
  id: string;
  productId: string;
  sourceId?: string;
  title: string;
  type: ContentItemType;
  url?: string;
  section: string;
  intent: ContentIntent;
  lifecycleStatus: ContentLifecycleStatus;
  primaryTopic: string;
  secondaryTopics: string[];
  audience?: string;
  funnelStage?: "top" | "middle" | "bottom" | "post-conversion";
  canonicalKnowledgeObjectId?: string;
  confidence: ConfidenceStatus;
  lastObservedAt?: string;
  freshness: KnowledgeObject["freshness"];
  notes?: string[];
  tags?: string[];
}

export interface ContentCluster {
  id: string;
  productId: string;
  name: string;
  description: string;
  topic: string;
  itemIds: string[];
  targetAudience?: string;
  strategicRole: "pillar" | "supporting" | "conversion" | "retention" | "trust";
  coverageScore: number;
}

export interface ContentGap {
  id: string;
  productId: string;
  gapType: ContentGapType;
  title: string;
  description: string;
  priority: Priority;
  relatedItemIds: string[];
  recommendedAction: string;
  expectedImpact: string;
  status: "open" | "planned" | "in_progress" | "resolved";
}

export interface ContentMap {
  id: string;
  productId: string;
  sourceIds: string[];
  generatedAt: string;
  updatedAt: string;
  items: ContentMapItem[];
  clusters: ContentCluster[];
  gaps: ContentGap[];
  summary: {
    totalItems: number;
    mappedItems: number;
    needsReview: number;
    openGaps: number;
    staleItems: number;
  };
}

export interface RepositoryRecord<T> {
  collection: DataCollectionName;
  id: string;
  data: T;
  version: number;
  storedAt: string;
}

export interface DataAccessResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface TipRepositorySnapshot {
  organizations: Organization[];
  products: Product[];
  projects: Project[];
  modules: Module[];
  agents: Agent[];
  knowledgeObjects: KnowledgeObject[];
  tasks: Task[];
  recommendations: Recommendation[];
  ingestionSources: IngestionSource[];
  contentMaps: ContentMap[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  activity: ActivityEvent[];
}

export interface TipDataRepository {
  snapshot(): TipRepositorySnapshot;
  list<T>(collection: DataCollectionName): DataAccessResult<T[]>;
  findById<T>(collection: DataCollectionName, id: string): DataAccessResult<T>;
  upsert<T extends { id: string }>(collection: DataCollectionName, record: T): DataAccessResult<T>;
}

export interface CrawlRequest {
  id: string;
  sourceId: string;
  productId: string;
  rootUrl: string;
  includePaths: string[];
  excludePaths?: string[];
  maxDepth: number;
  requestedAt: string;
}

export interface ExtractedContentRecord {
  id: string;
  sourceId: string;
  productId: string;
  url: string;
  title: string;
  format: ExtractedContentFormat;
  rawText?: string;
  excerpt?: string;
  detectedType?: ContentItemType;
  detectedIntent?: ContentIntent;
  detectedTopics: string[];
  status: CrawlStatus;
  httpStatus?: number;
  canonicalUrl?: string;
  discoveredAt: string;
  metadata?: Record<string, unknown>;
}

export interface CrawlResult {
  requestId: string;
  sourceId: string;
  status: IngestionRunStatus;
  startedAt: string;
  completedAt: string;
  records: ExtractedContentRecord[];
  errors: string[];
  summary: {
    requestedPaths: number;
    fetchedRecords: number;
    skippedRecords: number;
    failedRecords: number;
  };
}

export interface CrawlerAdapterContract {
  id: string;
  name: string;
  version: string;
  sourceTypes: IngestionSource["sourceType"][];
  createRequest(source: IngestionSource): CrawlRequest;
  crawl(request: CrawlRequest): Promise<CrawlResult>;
}

export interface MissionControlViewState {
  organizationId: string;
  activeProductId: string;
  activeSprintId: string;
  navItems: string[];
  metrics: Array<{
    label: string;
    value: string | number;
    description?: string;
  }>;
  panels: Array<{
    id: string;
    title: string;
    eyebrow: string;
    status?: string;
    priority?: Priority;
  }>;
  systemReadiness: Array<{
    system: string;
    status: "ready" | "stubbed" | "planned" | "blocked";
    note: string;
  }>;
}

export interface OrganizationContextPacket {
  organization: Organization;
  activeProducts: Product[];
  activeProjects: Project[];
  activeAgents: Agent[];
  installedModules: Module[];
  recentKnowledge: KnowledgeObject[];
  openTasks: Task[];
  activeRecommendations: Recommendation[];
  recentActivity: ActivityEvent[];
  graphSummary: {
    nodes: number;
    edges: number;
    verifiedKnowledgeObjects: number;
    staleKnowledgeObjects: number;
  };
}
