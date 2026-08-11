import type { ReviewDecision } from "./reviewQueue";

export interface ReviewDecisionRepository {
  recordDecision(decision: ReviewDecision): Promise<ReviewDecision>;
  listDecisions(queueId?: string): Promise<ReviewDecision[]>;
  findDecision(id: string): Promise<ReviewDecision | undefined>;
}

export function createInMemoryReviewDecisionRepository(initialDecisions: ReviewDecision[] = []): ReviewDecisionRepository {
  const decisions = [...initialDecisions];

  return {
    async recordDecision(decision) {
      const existingIndex = decisions.findIndex((item) => item.id === decision.id);

      if (existingIndex >= 0) {
        decisions[existingIndex] = decision;
      } else {
        decisions.push(decision);
      }

      return decision;
    },

    async listDecisions(queueId) {
      return queueId ? decisions.filter((decision) => decision.queueId === queueId) : [...decisions];
    },

    async findDecision(id) {
      return decisions.find((decision) => decision.id === id);
    }
  };
}

export function describeReviewDecisionRepository(repositoryName = "in-memory"): string[] {
  return [
    `Review decisions are using ${repositoryName} repository mode.`,
    "Mission Control can exercise approve/reject/defer flows before production persistence is connected.",
    "The repository contract can be backed by Supabase, Neon, D1, or another adapter later."
  ];
}
