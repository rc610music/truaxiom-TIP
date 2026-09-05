import type { DataCollectionName, TipDataRepository } from "@truaxiom/types";
import { buildOrganizationContextPacket, describeContextReadiness } from "./organizationalBrain";
import { createTipBootstrapSnapshot } from "./bootstrapSnapshot";
import { createInMemoryRepository, describeRepositorySnapshot } from "./dataAccess";
import { createMockCrawlResult, summarizeCrawlResult } from "./crawlerAdapter";
import { ingestionSources } from "./seed";
import { getContentMapSummary, getPriorityContentGaps, rootWorkContentMap } from "./rootWorkContentMap";
import { createContentMapCandidatesFromExtractedRecords, proposeContentGapsFromCandidates } from "./contentMapCandidates";
import { getActiveRecommendations } from "./recommendations";
import {
  applyReviewDecision,
  buildReviewQueueForMissionControl,
  summarizeReviewQueue,
  type ReviewDecisionAction,
  type ReviewQueue
} from "./reviewQueue";
import { createInMemoryReviewDecisionRepository, type ReviewDecisionRepository } from "./reviewDecisionRepository";
import { getEcosystemStatus } from "./ecosystemRegistry";

export interface ApiGatewayResponse<T = unknown> {
  status: number;
  body: T;
}

export interface ApiGatewayRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiGatewayOptions {
  repository?: TipDataRepository;
  reviewDecisionRepository?: ReviewDecisionRepository;
  modeLabel?: string;
  persistenceLabel?: string;
}

const availableRoutes = [
  "GET /health",
  "GET /v1/snapshot",
  "GET /v1/collections/:collection",
  "GET /v1/context/organization",
  "GET /v1/rootwork/content-map",
  "GET /v1/rootwork/mock-crawl",
  "GET /v1/recommendations/active",
  "GET /v1/review-queue",
  "GET /v1/review-queue/decisions",
  "GET /v1/ecosystem/status",
  "POST /v1/review-queue/decisions"
];

function isReviewDecisionAction(value: unknown): value is ReviewDecisionAction {
  return value === "approve" || value === "reject" || value === "defer";
}

function bodyAsRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

export function createTipApiGateway(options: ApiGatewayOptions = {}) {
  const repository = options.repository ?? createInMemoryRepository(createTipBootstrapSnapshot());
  const reviewDecisionRepository = options.reviewDecisionRepository ?? createInMemoryReviewDecisionRepository();
  const modeLabel = options.modeLabel ?? "local-simulated";
  const persistenceLabel = options.persistenceLabel ?? "in-memory-review-decision-repository";
  let latestReviewQueue: ReviewQueue | null = null;

  function json<T>(status: number, body: T): ApiGatewayResponse<T> {
    return { status, body };
  }

  function buildRootWorkCrawlPackage() {
    const source = ingestionSources.find((item) => item.id === "SRC-ROOTWORK-WEBSITE");
    if (!source) return null;

    const crawl = createMockCrawlResult(source);
    const candidates = createContentMapCandidatesFromExtractedRecords(crawl.records);
    const proposedGaps = proposeContentGapsFromCandidates(candidates, "PROD-ROOTWORK");

    return {
      source,
      crawl,
      summary: summarizeCrawlResult(crawl),
      candidates,
      proposedGaps
    };
  }

  function getReviewQueue() {
    if (latestReviewQueue) return latestReviewQueue;

    const snapshot = repository.snapshot();
    const packageResult = buildRootWorkCrawlPackage();
    if (!packageResult) return null;

    latestReviewQueue = buildReviewQueueForMissionControl({
      candidates: packageResult.candidates,
      proposedGaps: packageResult.proposedGaps,
      recommendations: snapshot.recommendations,
      tasks: snapshot.tasks,
      extractedRecords: packageResult.crawl.records
    });

    return latestReviewQueue;
  }

  return {
    repository,
    reviewDecisionRepository,

    async handleAsync(request: ApiGatewayRequest): Promise<ApiGatewayResponse> {
      if (request.method === "GET" && request.path === "/v1/ecosystem/status") {
        return json(200, await getEcosystemStatus());
      }

      if (request.method === "POST" && request.path === "/v1/review-queue/decisions") {
        const queue = getReviewQueue();
        if (!queue) return json(404, { error: "Review queue could not be generated" });

        const body = bodyAsRecord(request.body);
        const itemId = typeof body.itemId === "string" ? body.itemId : undefined;
        const action = body.action;

        if (!itemId) {
          return json(400, { error: "Missing required field: itemId" });
        }

        if (!isReviewDecisionAction(action)) {
          return json(400, { error: "Invalid action. Use approve, reject, or defer." });
        }

        try {
          const result = applyReviewDecision(queue, {
            itemId,
            action,
            decidedBy: typeof body.decidedBy === "string" ? body.decidedBy : "founder-local",
            note: typeof body.note === "string" ? body.note : undefined
          });

          if (!persistenceLabel.startsWith("in-memory")) {
            result.decision.mode = "persistent";
          }

          await reviewDecisionRepository.recordDecision(result.decision);
          const decisions = await reviewDecisionRepository.listDecisions(queue.id);
          latestReviewQueue = result.queue;

          return json(200, {
            ...result,
            decisions,
            mode: modeLabel,
            persistence: persistenceLabel
          });
        } catch (error) {
          return json(500, {
            error: error instanceof Error ? error.message : "Review decision failed",
            persistence: persistenceLabel
          });
        }
      }

      if (request.method === "GET" && request.path === "/v1/review-queue/decisions") {
        const queue = getReviewQueue();
        const decisions = await reviewDecisionRepository.listDecisions(queue?.id);

        return json(200, {
          decisions,
          count: decisions.length,
          mode: modeLabel,
          persistence: persistenceLabel
        });
      }

      return this.handle(request);
    },

    handle(request: ApiGatewayRequest): ApiGatewayResponse {
      if (request.method === "POST" && request.path === "/v1/review-queue/decisions") {
        return json(409, {
          error: "Synchronous handler cannot persist async review decisions. Use handleAsync for this route."
        });
      }

      if (request.method !== "GET") {
        return json(405, { error: "Method not allowed", method: request.method, availableRoutes });
      }

      if (request.path === "/health") {
        const snapshot = repository.snapshot();
        return json(200, {
          status: "ok",
          service: "TIP API Gateway",
          environment: modeLabel,
          mode: modeLabel,
          persistence: persistenceLabel,
          timestamp: new Date().toISOString(),
          summary: describeRepositorySnapshot(snapshot),
          availableRoutes
        });
      }

      if (request.path === "/v1/snapshot") {
        return json(200, repository.snapshot());
      }

      if (request.path.startsWith("/v1/collections/")) {
        const collection = request.path.replace("/v1/collections/", "") as DataCollectionName;
        const result = repository.list(collection);
        return result.ok ? json(200, result.data) : json(404, { error: result.error });
      }

      if (request.path === "/v1/context/organization") {
        const snapshot = repository.snapshot();
        const organization = snapshot.organizations[0];
        if (!organization) return json(404, { error: "No organization record available" });

        const packet = buildOrganizationContextPacket({
          organization,
          products: snapshot.products,
          projects: snapshot.projects,
          agents: snapshot.agents,
          modules: snapshot.modules,
          knowledgeObjects: snapshot.knowledgeObjects,
          tasks: snapshot.tasks,
          recommendations: snapshot.recommendations,
          activity: snapshot.activity,
          graph: {
            nodes: snapshot.graphNodes,
            edges: snapshot.graphEdges,
            knowledgeObjects: snapshot.knowledgeObjects
          }
        });

        return json(200, {
          packet,
          readiness: describeContextReadiness(packet)
        });
      }

      if (request.path === "/v1/rootwork/content-map") {
        return json(200, {
          contentMap: rootWorkContentMap,
          summary: getContentMapSummary(rootWorkContentMap),
          priorityGaps: getPriorityContentGaps(rootWorkContentMap)
        });
      }

      if (request.path === "/v1/rootwork/mock-crawl") {
        const packageResult = buildRootWorkCrawlPackage();
        if (!packageResult) return json(404, { error: "RootWork ingestion source not found" });
        return json(200, packageResult);
      }

      if (request.path === "/v1/recommendations/active") {
        const snapshot = repository.snapshot();
        return json(200, getActiveRecommendations(snapshot.recommendations));
      }

      if (request.path === "/v1/review-queue") {
        const queue = getReviewQueue();
        if (!queue) return json(404, { error: "RootWork ingestion source not found" });

        return json(200, {
          queue,
          summary: summarizeReviewQueue(queue),
          mode: modeLabel,
          persistence: persistenceLabel
        });
      }

      return json(404, {
        error: "Route not found",
        path: request.path,
        availableRoutes
      });
    }
  };
}
