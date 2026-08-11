import type { ConfidenceStatus, Priority, Recommendation } from "@truaxiom/types";

const confidenceWeight: Record<ConfidenceStatus, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  verified: 4
};

const priorityWeight: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  urgent: 5
};

export function getActiveRecommendations(recommendations: Recommendation[]): Recommendation[] {
  return recommendations.filter(
    (recommendation) => recommendation.recommendationStatus === "new" || recommendation.recommendationStatus === "accepted"
  );
}

export function sortRecommendationsForMissionControl(recommendations: Recommendation[]): Recommendation[] {
  return [...recommendations].sort((a, b) => {
    const priorityDifference = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDifference !== 0) return priorityDifference;

    const confidenceDifference = confidenceWeight[b.confidence] - confidenceWeight[a.confidence];
    if (confidenceDifference !== 0) return confidenceDifference;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function summarizeRecommendationImpact(recommendations: Recommendation[]): string[] {
  return getActiveRecommendations(recommendations).map(
    (recommendation) => `${recommendation.name}: ${recommendation.expectedImpact}`
  );
}
