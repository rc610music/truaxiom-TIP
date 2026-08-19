export interface ApiHealthResponse {
  status: string;
  service: string;
  environment: string;
  mode?: string;
  timestamp: string;
  summary?: string[];
  availableRoutes?: string[];
}

export interface ApiSnapshotResponse {
  organizations?: unknown[];
  products?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
  recommendations?: unknown[];
  contentMaps?: unknown[];
  activity?: unknown[];
}

export interface ApiOrganizationContextResponse {
  packet?: Record<string, unknown>;
  readiness?: string[];
}

export interface ApiRootWorkContentMapResponse {
  contentMap?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  priorityGaps?: unknown[];
}

export interface ApiMockCrawlResponse {
  crawl?: {
    records?: unknown[];
    summary?: Record<string, unknown>;
  };
  summary?: string[];
  candidates?: unknown[];
  proposedGaps?: unknown[];
}

export interface ApiReviewQueueResponse {
  queue?: {
    id?: string;
    status?: string;
    items?: unknown[];
    summary?: Record<string, unknown>;
  };
  summary?: string[];
  mode?: string;
  persistence?: string;
}

export type ReviewDecisionAction = "approve" | "reject" | "defer";

export interface ApiReviewDecisionResponse {
  decision?: Record<string, unknown>;
  item?: Record<string, unknown>;
  queue?: ApiReviewQueueResponse["queue"];
  summary?: string[];
  mode?: string;
  persistence?: string;
}

export interface MissionControlApiBridge {
  connected: boolean;
  error?: string;
  health?: ApiHealthResponse;
  snapshot?: ApiSnapshotResponse;
  organizationContext?: ApiOrganizationContextResponse;
  rootWorkContentMap?: ApiRootWorkContentMapResponse;
  mockCrawl?: ApiMockCrawlResponse;
  activeRecommendations?: unknown[];
  reviewQueue?: ApiReviewQueueResponse;
}

const defaultApiBaseUrl = "http://127.0.0.1:4310";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_TIP_API_BASE_URL || defaultApiBaseUrl;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`);

  if (!response.ok) {
    throw new Error(`TIP API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TIP API request failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  return getJson<ApiHealthResponse>("/health");
}

export async function fetchApiSnapshot(): Promise<ApiSnapshotResponse> {
  return getJson<ApiSnapshotResponse>("/v1/snapshot");
}

export async function fetchOrganizationContext(): Promise<ApiOrganizationContextResponse> {
  return getJson<ApiOrganizationContextResponse>("/v1/context/organization");
}

export async function fetchRootWorkContentMap(): Promise<ApiRootWorkContentMapResponse> {
  return getJson<ApiRootWorkContentMapResponse>("/v1/rootwork/content-map");
}

export async function fetchRootWorkMockCrawl(): Promise<ApiMockCrawlResponse> {
  return getJson<ApiMockCrawlResponse>("/v1/rootwork/mock-crawl");
}

export async function fetchActiveRecommendations(): Promise<unknown[]> {
  return getJson<unknown[]>("/v1/recommendations/active");
}

export async function fetchReviewQueue(): Promise<ApiReviewQueueResponse> {
  return getJson<ApiReviewQueueResponse>("/v1/review-queue");
}

export async function decideReviewQueueItem(input: {
  itemId: string;
  action: ReviewDecisionAction;
  note?: string;
}): Promise<ApiReviewDecisionResponse> {
  return postJson<ApiReviewDecisionResponse>("/v1/review-queue/decisions", {
    ...input,
    decidedBy: "founder-local"
  });
}

export async function loadMissionControlApiBridge(): Promise<MissionControlApiBridge> {
  try {
    const [health, snapshot, organizationContext, rootWorkContentMap, mockCrawl, activeRecommendations, reviewQueue] = await Promise.all([
      fetchApiHealth(),
      fetchApiSnapshot(),
      fetchOrganizationContext(),
      fetchRootWorkContentMap(),
      fetchRootWorkMockCrawl(),
      fetchActiveRecommendations(),
      fetchReviewQueue()
    ]);

    return {
      connected: true,
      health,
      snapshot,
      organizationContext,
      rootWorkContentMap,
      mockCrawl,
      activeRecommendations,
      reviewQueue
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown TIP API connection error"
    };
  }
}

export function summarizeSnapshot(snapshot: ApiSnapshotResponse): string[] {
  return [
    `${snapshot.organizations?.length ?? 0} organization(s)`,
    `${snapshot.products?.length ?? 0} product(s)`,
    `${snapshot.projects?.length ?? 0} project(s)`,
    `${snapshot.tasks?.length ?? 0} task(s)`,
    `${snapshot.recommendations?.length ?? 0} recommendation(s)`,
    `${snapshot.contentMaps?.length ?? 0} content map(s)`
  ];
}