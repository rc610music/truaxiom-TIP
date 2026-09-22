import type { Recommendation, Task, TaskWorkflowRun } from "@truaxiom/types";
import { convertRecommendationToTask } from "./recommendationToTask";
import type { ReviewDecision } from "./reviewQueue";

const seedProjectId = "PRJ-SPRINT-002";

export interface ApprovedRecommendationSource {
  decidedBy: string;
  decidedAt: string;
  itemId: string;
}

export function registryProjectIdForRecommendation(recommendation: Pick<Recommendation, "productId" | "projectId">): string {
  const productId = recommendation.productId?.trim();
  if (productId?.startsWith("PROD-")) {
    const projectId = `PRJ-${productId.slice("PROD-".length)}`;
    if (projectId === seedProjectId) {
      throw new Error(`Refusing seed project id ${seedProjectId} for ${productId}.`);
    }
    return projectId;
  }

  const projectId = recommendation.projectId?.trim();
  if (projectId && projectId !== seedProjectId) return projectId;

  throw new Error(`Recommendation is not linked to a Registry project. Product ${productId ?? "missing"} still points at ${projectId ?? "no project"}.`);
}

export function latestReviewDecisions(decisions: ReviewDecision[]): ReviewDecision[] {
  const latestByItem = new Map<string, ReviewDecision>();

  for (const decision of decisions) {
    const current = latestByItem.get(decision.itemId);
    if (!current || Date.parse(decision.decidedAt) >= Date.parse(current.decidedAt)) {
      latestByItem.set(decision.itemId, decision);
    }
  }

  return [...latestByItem.values()];
}

export function buildTaskFromApprovedRecommendation(
  recommendation: Recommendation,
  source: ApprovedRecommendationSource
): Task {
  const converted = convertRecommendationToTask(recommendation);
  const projectId = registryProjectIdForRecommendation(recommendation);
  const owner = source.decidedBy.trim() || "founder-local";
  const evidenceLink = `/v1/review-queue/decisions#${source.itemId}`;
  const evidence = [...new Set([...recommendation.evidence, evidenceLink])];
  const workflow: TaskWorkflowRun = {
    id: `WF-${converted.task.id}`,
    name: converted.task.name,
    status: "started",
    startedAt: source.decidedAt,
    owner,
    entryStepId: "execute-approved-recommendation",
    evidence
  };

  return {
    ...converted.task,
    createdAt: source.decidedAt,
    updatedAt: source.decidedAt,
    productId: recommendation.productId,
    projectId,
    assignedTo: owner,
    workflowStatus: "in_progress",
    evidence,
    workflow
  };
}
