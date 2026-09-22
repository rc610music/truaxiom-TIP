import type { DataCollectionName, Task, TipDataRepository } from "@truaxiom/types";
import {
  approvedContentCollectionSource,
  buildApprovedContentRecord,
  createInMemoryApprovedContentRepository,
  rootWorkContentReviewWorkflowId,
  type ApprovedContentRecord,
  type ApprovedContentRepository
} from "./approvedContentRecord";
import { operatorSecretsMatch, type OperatorAuthConfig } from "./serverRuntime";
import { buildOrganizationContextPacket, describeContextReadiness } from "./organizationalBrain";
import { createTipBootstrapSnapshot } from "./bootstrapSnapshot";
import { createInMemoryRepository, describeRepositorySnapshot } from "./dataAccess";
import { createMockCrawlResult, summarizeCrawlResult } from "./crawlerAdapter";
import { ingestionSources } from "./seed";
import { getContentMapSummary, getPriorityContentGaps, rootWorkContentMap } from "./rootWorkContentMap";
import { createContentMapCandidatesFromExtractedRecords, proposeContentGapsFromCandidates } from "./contentMapCandidates";
import { getActiveRecommendations } from "./recommendations";
import {
  applyPersistedReviewDecisions,
  applyReviewDecision,
  buildReviewQueueForMissionControl,
  summarizeReviewQueue,
  type ReviewDecisionAction,
  type ReviewQueue
} from "./reviewQueue";
import { createInMemoryReviewDecisionRepository, type ReviewDecisionRepository } from "./reviewDecisionRepository";
import { getEcosystemStatus } from "./ecosystemRegistry";
import { registryV1Version } from "./registryV1";
import { buildTaskFromApprovedRecommendation, latestReviewDecisions } from "./approvalTaskBridge";
import {
  createInMemoryApprovalTaskRepository,
  presentTask,
  taskCollectionSource,
  type ApprovalTaskRepository
} from "./postgresTaskAdapter";

export interface ApiGatewayResponse<T = unknown> {
  status: number;
  body: T;
}

export interface ApiGatewayRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export type RegistrySource = "postgres" | "neon" | "supabase" | "in-memory-seed";

export interface RegistryMeta {
  version: typeof registryV1Version;
  source: RegistrySource;
  configuredProvider?: RegistrySource;
  error?: string;
}

export interface ApiGatewayOptions {
  repository?: TipDataRepository;
  reviewDecisionRepository?: ReviewDecisionRepository;
  approvalTaskRepository?: ApprovalTaskRepository;
  approvedContentRepository?: ApprovedContentRepository;
  operatorAuth?: OperatorAuthConfig;
  modeLabel?: string;
  persistenceLabel?: string;
  registryMeta?: RegistryMeta;
}

const availableRoutes = [
  "GET /health",
  "GET /v1/snapshot",
  "GET /v1/collections/:collection",
  "GET /v1/registry",
  "GET /v1/context/organization",
  "GET /v1/rootwork/content-map",
  "GET /v1/rootwork/approved-content",
  "GET /v1/rootwork/mock-crawl",
  "GET /v1/recommendations/active",
  "GET /v1/review-queue",
  "GET /v1/review-queue/decisions",
  "GET /v1/ecosystem/status",
  "POST /v1/review-queue/decisions"
];

const seedCollections = [
  "modules",
  "agents",
  "knowledgeObjects",
  "tasks",
  "recommendations",
  "ingestionSources",
  "contentMaps",
  "graphNodes",
  "graphEdges",
  "activity"
] as const;

function registryStore(source: RegistrySource): "postgres" | "in-memory-seed" {
  switch (source) {
    case "postgres":
    case "neon":
    case "supabase":
      return "postgres";
    case "in-memory-seed":
      return "in-memory-seed";
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

function buildPersistenceMap(
  registrySource: RegistrySource,
  persistenceLabel: string,
  taskSource: "postgres" | "in-memory-seed" = "in-memory-seed",
  approvedContentSource: "postgres" | "in-memory" | "in-memory-seed" = "in-memory-seed"
): Record<string, string> {
  const registry = registryStore(registrySource);
  const reviewDecisions = persistenceLabel.startsWith("in-memory") ? "in-memory" : "postgres";
  const map: Record<string, string> = {
    organizations: registry,
    products: registry,
    projects: registry,
    reviewDecisions,
    ecosystemStatus: "live-http-check",
    rootWorkContentMap: "in-memory-seed",
    rootWorkMockCrawl: "in-memory-seed"
  };

  for (const collection of seedCollections) {
    map[collection] = "in-memory-seed";
  }

  map.tasks = taskSource;
  map.approvedContentRecords = approvedContentSource;
  return map;
}

function headerValue(headers: ApiGatewayRequest["headers"], name: string): string | undefined {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function presentedOperatorSecret(request: ApiGatewayRequest): string | undefined {
  const explicit = headerValue(request.headers, "x-tip-operator-secret");
  if (explicit) return explicit;
  const authorization = headerValue(request.headers, "authorization");
  if (!authorization) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1];
}

function isReviewDecisionAction(value: unknown): value is ReviewDecisionAction {
  return value === "approve" || value === "reject" || value === "defer";
}

function bodyAsRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

export function createTipApiGateway(options: ApiGatewayOptions = {}) {
  const repository = options.repository ?? createInMemoryRepository(createTipBootstrapSnapshot());
  const reviewDecisionRepository = options.reviewDecisionRepository ?? createInMemoryReviewDecisionRepository();
  const approvalTaskRepository = options.approvalTaskRepository ?? createInMemoryApprovalTaskRepository();
  const approvedContentRepository = options.approvedContentRepository ?? createInMemoryApprovedContentRepository();
  const operatorAuth: OperatorAuthConfig = options.operatorAuth ?? { required: false, actor: "operator" };
  const modeLabel = options.modeLabel ?? "local-simulated";
  const persistenceLabel = options.persistenceLabel ?? "in-memory-review-decision-repository";
  const registryMeta: RegistryMeta = options.registryMeta ?? {
    version: registryV1Version,
    source: "in-memory-seed"
  };
  let latestReviewQueue: ReviewQueue | null = null;
  let durableTaskCount = 0;
  let taskSource: "postgres" | "in-memory-seed" = "in-memory-seed";
  let durableContentCount = 0;
  let approvedContentSource: "postgres" | "in-memory" | "in-memory-seed" = "in-memory-seed";

  function registryPayload() {
    const snapshot = repository.snapshot();
    return {
      version: registryMeta.version,
      source: registryMeta.source,
      configuredProvider: registryMeta.configuredProvider ?? registryMeta.source,
      error: registryMeta.error,
      idPolicy: "ORG-TRUAXIOM, PROD-*, and PRJ-* ids are shared with Command Center. TIP Core is the only intelligence core.",
      tables: registryStore(registryMeta.source) === "postgres"
        ? ["organizations", "products", "projects"]
        : [],
      counts: {
        organizations: snapshot.organizations.length,
        products: snapshot.products.length,
        projects: snapshot.projects.length
      },
      organizations: snapshot.organizations,
      products: snapshot.products,
      projects: snapshot.projects
    };
  }

  function organizationId() {
    return repository.snapshot().organizations[0]?.id ?? "ORG-TRUAXIOM";
  }

  async function syncDurableTasks() {
    const durable = await approvalTaskRepository.list();
    durableTaskCount = durable.length;
    taskSource = taskCollectionSource(approvalTaskRepository, durable.length);
    for (const task of durable) {
      repository.upsert("tasks", task);
    }
    return durable;
  }

  async function persistApprovedTask(task: Task) {
    const saved = await approvalTaskRepository.save(task, { organizationId: organizationId() });
    repository.upsert("tasks", saved);
    const durable = await approvalTaskRepository.list();
    durableTaskCount = durable.length;
    taskSource = taskCollectionSource(approvalTaskRepository, durable.length);
    return saved;
  }

  async function syncDurableContent() {
    const durable = await approvedContentRepository.list();
    durableContentCount = durable.length;
    approvedContentSource = approvedContentCollectionSource(approvedContentRepository, durable.length);
    return durable;
  }

  async function persistApprovedContent(record: ApprovedContentRecord) {
    const saved = await approvedContentRepository.save(record, { organizationId: organizationId() });
    const durable = await approvedContentRepository.list();
    durableContentCount = durable.length;
    approvedContentSource = approvedContentCollectionSource(approvedContentRepository, durable.length);
    return saved;
  }

  function candidateForReviewItem(itemId: string, entityId?: string) {
    const packageResult = buildRootWorkCrawlPackage();
    if (!packageResult) return undefined;
    return packageResult.candidates.find((candidate) => candidate.id === entityId || `REV-${candidate.id}` === itemId);
  }

  function contentRecordForApproval(item: ReviewQueue["items"][number], decision: { decidedBy: string; decidedAt: string; itemId: string }) {
    return buildApprovedContentRecord({
      item,
      decision,
      candidate: candidateForReviewItem(item.id, item.entityId)
    });
  }

  function authorizeOperator(request: ApiGatewayRequest): { ok: true; actor?: string } | { ok: false; error: string } {
    if (!operatorAuth.required) return { ok: true };
    if (!operatorAuth.secret) return { ok: false, error: "Operator secret is not configured." };
    const presented = presentedOperatorSecret(request);
    if (!presented || !operatorSecretsMatch(presented, operatorAuth.secret)) {
      return { ok: false, error: "Unauthorized." };
    }
    return { ok: true, actor: operatorAuth.actor };
  }

  function presentSnapshotTasks<T extends { tasks: Task[] }>(snapshot: T): T {
    return {
      ...snapshot,
      tasks: snapshot.tasks.map(presentTask)
    };
  }

  async function healthPayload() {
    const snapshot = repository.snapshot();
    let reviewDecisionCount: number | null = null;
    let reviewDecisionError: string | undefined;

    try {
      reviewDecisionCount = (await reviewDecisionRepository.listDecisions()).length;
    } catch (error) {
      reviewDecisionError = error instanceof Error ? error.message : "Review decision count failed";
    }

    const registry = registryPayload();
    const persistenceMap = buildPersistenceMap(registryMeta.source, persistenceLabel, taskSource, approvedContentSource);

    return {
      status: "ok",
      service: "TIP API Gateway",
      environment: modeLabel,
      mode: modeLabel,
      persistence: persistenceLabel,
      timestamp: new Date().toISOString(),
      summary: describeRepositorySnapshot(snapshot),
      summarySources: [
        persistenceMap.organizations,
        persistenceMap.products,
        persistenceMap.projects,
        persistenceMap.knowledgeObjects,
        persistenceMap.tasks,
        persistenceMap.recommendations,
        persistenceMap.ingestionSources,
        persistenceMap.contentMaps
      ],
      registry,
      persistenceMap,
      reviewDecisions: {
        source: persistenceMap.reviewDecisions,
        table: persistenceMap.reviewDecisions === "postgres" ? "tip_review_decisions" : null,
        count: reviewDecisionCount,
        error: reviewDecisionError
      },
      tasks: {
        source: persistenceMap.tasks,
        table: approvalTaskRepository.table,
        durableCount: durableTaskCount
      },
      approvedContentRecords: {
        source: persistenceMap.approvedContentRecords,
        table: approvedContentRepository.table,
        durableCount: durableContentCount,
        workflowId: rootWorkContentReviewWorkflowId
      },
      availableRoutes
    };
  }

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

  async function getHydratedReviewQueue() {
    const queue = getReviewQueue();
    if (!queue) return null;

    const decisions = await reviewDecisionRepository.listDecisions(queue.id);
    latestReviewQueue = applyPersistedReviewDecisions(queue, decisions);
    return latestReviewQueue;
  }

  function taskForApprovedRecommendation(itemId: string, entityId: string | undefined, decision: { decidedBy: string; decidedAt: string; itemId: string }) {
    if (!entityId) {
      throw new Error(`Approved recommendation item is missing its entity id: ${itemId}`);
    }
    const recommendation = repository.snapshot().recommendations.find((item) => item.id === entityId);
    if (!recommendation) {
      throw new Error(`Approved recommendation not found: ${itemId}`);
    }
    return buildTaskFromApprovedRecommendation(recommendation, {
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
      itemId: decision.itemId
    });
  }

  return {
    repository,
    reviewDecisionRepository,
    approvalTaskRepository,
    approvedContentRepository,

    async replayApprovedRecommendationTasks() {
      await syncDurableTasks();
      const queue = await getHydratedReviewQueue();
      if (!queue) return [];

      const decisions = latestReviewDecisions(await reviewDecisionRepository.listDecisions(queue.id));
      const saved: Task[] = [];

      for (const decision of decisions) {
        if (decision.action !== "approve") continue;
        const item = queue.items.find((entry) => entry.id === decision.itemId);
        if (!item || item.type !== "recommendation") continue;
        saved.push(await persistApprovedTask(taskForApprovedRecommendation(item.id, item.entityId, decision)));
      }

      return saved;
    },

    async replayApprovedContentRecords() {
      await syncDurableContent();
      const queue = await getHydratedReviewQueue();
      if (!queue) return [];

      const decisions = latestReviewDecisions(await reviewDecisionRepository.listDecisions(queue.id));
      const saved: ApprovedContentRecord[] = [];

      for (const decision of decisions) {
        if (decision.action !== "approve") continue;
        const item = queue.items.find((entry) => entry.id === decision.itemId);
        if (!item || item.type !== "content_map_candidate") continue;
        saved.push(await persistApprovedContent(contentRecordForApproval(item, decision)));
      }

      return saved;
    },

    async handleAsync(request: ApiGatewayRequest): Promise<ApiGatewayResponse> {
      await syncDurableTasks();
      await syncDurableContent();

      if (request.method === "GET" && request.path === "/health") {
        return json(200, await healthPayload());
      }

      if (request.method === "GET" && request.path === "/v1/registry") {
        return json(200, registryPayload());
      }

      if (request.method === "GET" && request.path === "/v1/ecosystem/status") {
        return json(200, await getEcosystemStatus());
      }

      if (request.method === "GET" && request.path === "/v1/review-queue") {
        const queue = await getHydratedReviewQueue();
        if (!queue) return json(404, { error: "RootWork ingestion source not found" });

        return json(200, {
          queue,
          summary: summarizeReviewQueue(queue),
          mode: modeLabel,
          persistence: persistenceLabel
        });
      }

      if (request.method === "POST" && request.path === "/v1/review-queue/decisions") {
        const gate = authorizeOperator(request);
        if (!gate.ok) return json(401, { error: gate.error });

        const queue = await getHydratedReviewQueue();
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
            decidedBy: gate.actor ?? (typeof body.decidedBy === "string" ? body.decidedBy : "founder-local"),
            note: typeof body.note === "string" ? body.note : undefined
          });

          if (!persistenceLabel.startsWith("in-memory")) {
            result.decision.mode = "persistent";
          }

          await reviewDecisionRepository.recordDecision(result.decision);
          const decisions = await reviewDecisionRepository.listDecisions(queue.id);
          latestReviewQueue = result.queue;

          let task: Task | undefined;
          let contentRecord: ApprovedContentRecord | undefined;
          if (action === "approve" && result.item.type === "recommendation") {
            task = presentTask(await persistApprovedTask(taskForApprovedRecommendation(result.item.id, result.item.entityId, result.decision)));
          }
          if (action === "approve" && result.item.type === "content_map_candidate") {
            contentRecord = await persistApprovedContent(contentRecordForApproval(result.item, result.decision));
          }

          return json(200, {
            ...result,
            task,
            contentRecord,
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

      if (request.method === "GET" && request.path === "/v1/rootwork/approved-content") {
        const records = await approvedContentRepository.list();
        return json(200, {
          records,
          count: records.length,
          source: approvedContentSource,
          table: approvedContentRepository.table,
          workflowId: rootWorkContentReviewWorkflowId,
          mode: modeLabel,
          persistence: persistenceLabel
        });
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
        const registry = registryPayload();
        const persistenceMap = buildPersistenceMap(registryMeta.source, persistenceLabel, taskSource, approvedContentSource);
        return json(200, {
          status: "ok",
          service: "TIP API Gateway",
          environment: modeLabel,
          mode: modeLabel,
          persistence: persistenceLabel,
          timestamp: new Date().toISOString(),
          summary: describeRepositorySnapshot(snapshot),
          summarySources: [
            persistenceMap.organizations,
            persistenceMap.products,
            persistenceMap.projects,
            persistenceMap.knowledgeObjects,
            persistenceMap.tasks,
            persistenceMap.recommendations,
            persistenceMap.ingestionSources,
            persistenceMap.contentMaps
          ],
          registry,
          persistenceMap,
          reviewDecisions: {
            source: persistenceMap.reviewDecisions,
            table: persistenceMap.reviewDecisions === "postgres" ? "tip_review_decisions" : null,
            count: null
          },
          tasks: {
            source: persistenceMap.tasks,
            table: approvalTaskRepository.table,
            durableCount: durableTaskCount
          },
          approvedContentRecords: {
            source: persistenceMap.approvedContentRecords,
            table: approvedContentRepository.table,
            durableCount: durableContentCount,
            workflowId: rootWorkContentReviewWorkflowId
          },
          availableRoutes
        });
      }

      if (request.path === "/v1/registry") {
        return json(200, registryPayload());
      }

      if (request.path === "/v1/snapshot") {
        return json(200, presentSnapshotTasks(repository.snapshot()));
      }

      if (request.path.startsWith("/v1/collections/")) {
        const collection = request.path.replace("/v1/collections/", "") as DataCollectionName;
        const result = repository.list(collection);
        if (!result.ok) return json(404, { error: result.error });
        if (collection === "tasks") return json(200, (result.data as Task[]).map(presentTask));
        return json(200, result.data);
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
          tasks: snapshot.tasks.map(presentTask),
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
