import type { Recommendation, Task } from "@truaxiom/types";

export interface RecommendationTaskConversionResult {
  recommendationId: string;
  task: Task;
  convertedAt: string;
  notes: string[];
}

export function convertRecommendationToTask(recommendation: Recommendation): RecommendationTaskConversionResult {
  const convertedAt = new Date().toISOString();

  const task: Task = {
    id: `TASK-FROM-${recommendation.id}`,
    name: recommendation.nextAction,
    description: recommendation.description ?? recommendation.rationale,
    status: "active",
    createdAt: convertedAt,
    updatedAt: convertedAt,
    productId: recommendation.productId,
    projectId: recommendation.projectId,
    recommendationId: recommendation.id,
    priority: recommendation.priority,
    workflowStatus: "ready",
    acceptanceCriteria: [
      "Recommendation has been reviewed for fit and safety.",
      "Task has a clear implementation owner or next execution step.",
      "Result can be validated inside Mission Control or repository artifacts."
    ],
    tags: ["generated-from-recommendation", recommendation.type]
  };

  return {
    recommendationId: recommendation.id,
    task,
    convertedAt,
    notes: [
      "Recommendation converted into a reviewable task.",
      "Human approval remains required before automated execution."
    ]
  };
}

export function convertRecommendationsToTasks(recommendations: Recommendation[]): RecommendationTaskConversionResult[] {
  return recommendations
    .filter((recommendation) => recommendation.recommendationStatus === "new" || recommendation.recommendationStatus === "accepted")
    .map(convertRecommendationToTask);
}

export function summarizeRecommendationTaskConversions(results: RecommendationTaskConversionResult[]): string[] {
  return [
    `${results.length} recommendation(s) converted to task candidates`,
    `${results.filter((result) => result.task.priority === "critical" || result.task.priority === "urgent").length} high-urgency task candidate(s)`,
    "All converted tasks remain reviewable before execution"
  ];
}
