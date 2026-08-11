import type {
  Agent,
  ActivityEvent,
  ContentMap,
  DataAccessResult,
  DataCollectionName,
  GraphEdge,
  GraphNode,
  IngestionSource,
  KnowledgeObject,
  Module,
  Organization,
  Product,
  Project,
  Recommendation,
  Task,
  TipDataRepository,
  TipRepositorySnapshot
} from "@truaxiom/types";

function success<T>(data: T): DataAccessResult<T> {
  return { ok: true, data };
}

function failure<T>(error: string): DataAccessResult<T> {
  return { ok: false, error };
}

export function createInMemoryRepository(initialSnapshot: TipRepositorySnapshot): TipDataRepository {
  const state: TipRepositorySnapshot = structuredClone(initialSnapshot);

  return {
    snapshot() {
      return structuredClone(state);
    },

    list<T>(collection: DataCollectionName): DataAccessResult<T[]> {
      const records = state[collection] as T[] | undefined;
      if (!records) return failure<T[]>(`Unknown collection: ${collection}`);
      return success(structuredClone(records));
    },

    findById<T>(collection: DataCollectionName, id: string): DataAccessResult<T> {
      const records = state[collection] as Array<{ id: string }> | undefined;
      if (!records) return failure<T>(`Unknown collection: ${collection}`);

      const record = records.find((item) => item.id === id);
      if (!record) return failure<T>(`Record not found: ${collection}/${id}`);

      return success(structuredClone(record) as T);
    },

    upsert<T extends { id: string }>(collection: DataCollectionName, record: T): DataAccessResult<T> {
      const records = state[collection] as T[] | undefined;
      if (!records) return failure<T>(`Unknown collection: ${collection}`);

      const existingIndex = records.findIndex((item) => item.id === record.id);
      if (existingIndex >= 0) {
        records[existingIndex] = structuredClone(record);
      } else {
        records.push(structuredClone(record));
      }

      return success(structuredClone(record));
    }
  };
}

export function createRepositorySnapshot(input: {
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
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
  activity: ActivityEvent[];
}): TipRepositorySnapshot {
  return {
    organizations: input.organizations,
    products: input.products,
    projects: input.projects,
    modules: input.modules,
    agents: input.agents,
    knowledgeObjects: input.knowledgeObjects,
    tasks: input.tasks,
    recommendations: input.recommendations,
    ingestionSources: input.ingestionSources,
    contentMaps: input.contentMaps,
    graphNodes: input.graphNodes ?? [],
    graphEdges: input.graphEdges ?? [],
    activity: input.activity
  };
}

export function describeRepositorySnapshot(snapshot: TipRepositorySnapshot): string[] {
  return [
    `${snapshot.organizations.length} organization record(s)`,
    `${snapshot.products.length} product record(s)`,
    `${snapshot.projects.length} project record(s)`,
    `${snapshot.knowledgeObjects.length} knowledge object(s)`,
    `${snapshot.tasks.length} task(s)`,
    `${snapshot.recommendations.length} recommendation(s)`,
    `${snapshot.ingestionSources.length} ingestion source(s)`,
    `${snapshot.contentMaps.length} content map(s)`
  ];
}
