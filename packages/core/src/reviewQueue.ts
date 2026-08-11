import type { ContentGap, ExtractedContentRecord, Recommendation, Task } from "@truaxiom/types";
import type { ContentMapCandidate } from "./contentMapCandidates";

export type ReviewQueueItemType =
  | "content_map_candidate"
  | "content_gap_candidate"
  | "recommendation"
  | "task_candidate";

export type ReviewQueueStatus = "needs_review" | "approved" | "rejected" | "deferred" | "implemented";

export interface ReviewQueueItem {
  id: string;
  type: ReviewQueueItemType;
  title: string;
  description: string;
  status: ReviewQueueStatus;
  priority: "low" | "medium" | "high" | "critical" | "urgent";
  source: string;
  entityId?: string;
  productId?: string;
  recommendedAction: string;
  evidence: string[];
  createdAt: string;
}

export interface ReviewQueue {
  id: string;
  generatedAt: string;
  status: "open" | "cleared";
  items: ReviewQueueItem[];
  summary: {
    total: number;
    needsReview: number;
    critical: number;
    contentCandidates: number;
    gaps: number;
    recommendations: number;
    tasks: number;
  };
}

const generatedAt = "2026-08-11T17:31:00-04:00";

function normalizePriority(priority?: string): ReviewQueueItem["priority"] {
  if (priority === "low" || priority === "medium" || priority === "high" || priority === "critical" || priority === "urgent") {
    return priority;
  }

  return "medium";
}

export function buildReviewQueueForMissionControl(input: {
  candidates: ContentMapCandidate[];
  proposedGaps: ContentGap[];
  recommendations: Recommendation[];
  tasks: Task[];
  extractedRecords: ExtractedContentRecord[];
}): ReviewQueue {
  const candidateItems: ReviewQueueItem[] = input.candidates.map((candidate) => ({
    id: `REV-${candidate.id}`,
    type: "content_map_candidate",
    title: candidate.title,
    description: `Review extracted ${candidate.type} candidate for ${candidate.section}.`,
    status: "needs_review",
    priority: "medium",
    source: "crawler-to-content-map",
    entityId: candidate.id,
    productId: candidate.productId,
    recommendedAction: "Approve, edit, or reject this candidate before it becomes part of the official content map.",
    evidence: [
      `Detected topic: ${candidate.primaryTopic}`,
      `Detected intent: ${candidate.intent}`,
      `Source record: ${candidate.sourceRecordId}`
    ],
    createdAt: generatedAt
  }));

  const gapItems: ReviewQueueItem[] = input.proposedGaps.map((gap) => ({
    id: `REV-${gap.id}`,
    type: "content_gap_candidate",
    title: gap.title,
    description: gap.description,
    status: "needs_review",
    priority: normalizePriority(gap.priority),
    source: "content-gap-analysis",
    entityId: gap.id,
    productId: gap.productId,
    recommendedAction: gap.recommendedAction,
    evidence: [`Expected impact: ${gap.expectedImpact}`],
    createdAt: generatedAt
  }));

  const recommendationItems: ReviewQueueItem[] = input.recommendations
    .filter((recommendation) => recommendation.recommendationStatus === "new" || recommendation.recommendationStatus === "accepted")
    .map((recommendation) => ({
      id: `REV-${recommendation.id}`,
      type: "recommendation",
      title: recommendation.name,
      description: recommendation.rationale,
      status: recommendation.recommendationStatus === "accepted" ? "approved" : "needs_review",
      priority: normalizePriority(recommendation.priority),
      source: recommendation.agentId ?? recommendation.moduleId ?? "recommendation-engine",
      entityId: recommendation.id,
      productId: recommendation.productId,
      recommendedAction: recommendation.nextAction,
      evidence: recommendation.evidence,
      createdAt: recommendation.createdAt
    }));

  const taskItems: ReviewQueueItem[] = input.tasks
    .filter((task) => task.workflowStatus === "ready" || task.workflowStatus === "backlog")
    .map((task) => ({
      id: `REV-${task.id}`,
      type: "task_candidate",
      title: task.name,
      description: task.description ?? "Task is ready for review and prioritization.",
      status: "needs_review",
      priority: normalizePriority(task.priority),
      source: task.recommendationId ? "recommendation-to-task" : "sprint-task-queue",
      entityId: task.id,
      productId: task.productId,
      recommendedAction: "Confirm priority, acceptance criteria, and whether this task should enter active work.",
      evidence: task.acceptanceCriteria ?? [],
      createdAt: task.createdAt
    }));

  const extractedItemsWithoutCandidates = input.extractedRecords
    .filter((record) => !input.candidates.some((candidate) => candidate.sourceRecordId === record.id))
    .map((record) => ({
      id: `REV-${record.id}`,
      type: "content_map_candidate" as const,
      title: record.title,
      description: record.excerpt,
      status: "needs_review" as const,
      priority: "medium" as const,
      source: "extracted-content-record",
      entityId: record.id,
      productId: record.productId,
      recommendedAction: "Decide whether this extracted record should become a mapped content item.",
      evidence: [`Detected type: ${record.detectedType}`, `Detected intent: ${record.detectedIntent}`, `URL: ${record.url}`],
      createdAt: record.discoveredAt
    }));

  const items = [...gapItems, ...recommendationItems, ...taskItems, ...candidateItems, ...extractedItemsWithoutCandidates];

  return {
    id: "REVQ-MISSION-CONTROL-SPRINT-002",
    generatedAt,
    status: items.some((item) => item.status === "needs_review") ? "open" : "cleared",
    items,
    summary: {
      total: items.length,
      needsReview: items.filter((item) => item.status === "needs_review").length,
      critical: items.filter((item) => item.priority === "critical" || item.priority === "urgent").length,
      contentCandidates: items.filter((item) => item.type === "content_map_candidate").length,
      gaps: items.filter((item) => item.type === "content_gap_candidate").length,
      recommendations: items.filter((item) => item.type === "recommendation").length,
      tasks: items.filter((item) => item.type === "task_candidate").length
    }
  };
}

export function summarizeReviewQueue(queue: ReviewQueue): string[] {
  return [
    `${queue.summary.total} total review item(s)`,
    `${queue.summary.needsReview} needing review`,
    `${queue.summary.critical} critical/urgent item(s)`,
    `${queue.summary.contentCandidates} content candidate(s)`,
    `${queue.summary.gaps} gap candidate(s)`
  ];
}
