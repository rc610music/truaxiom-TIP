export interface ApiHealthResponse {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
}

export interface ApiSnapshotResponse {
  organizations?: unknown[];
  products?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
  recommendations?: unknown[];
  contentMaps?: unknown[];
}

const defaultApiBaseUrl = "http://127.0.0.1:8787";

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

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  return getJson<ApiHealthResponse>("/health");
}

export async function fetchApiSnapshot(): Promise<ApiSnapshotResponse> {
  return getJson<ApiSnapshotResponse>("/v1/snapshot");
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
