import type {
  DataAccessResult,
  DataCollectionName,
  TipRepositorySnapshot
} from "@truaxiom/types";

type SupabaseResult = { data: unknown; error: unknown };

type SupabaseSelectQuery = PromiseLike<SupabaseResult> & {
  select(columns?: string): SupabaseSelectQuery;
  eq(column: string, value: string): SupabaseSelectQuery;
  maybeSingle(): Promise<SupabaseResult>;
};

type SupabaseTableQuery = SupabaseSelectQuery & {
  upsert(record: unknown, options?: { onConflict?: string }): Promise<{ data: unknown; error: unknown }>;
};

export interface SupabaseLikeClient {
  from(tableName: string): SupabaseTableQuery;
}

export interface SupabaseRepositoryAdapterOptions {
  schema?: string;
  organizationId?: string;
}

export interface SupabaseRepositoryAdapter {
  provider: "supabase";
  tableFor(collection: DataCollectionName): string;
  list<T>(collection: DataCollectionName): Promise<DataAccessResult<T[]>>;
  findById<T>(collection: DataCollectionName, id: string): Promise<DataAccessResult<T>>;
  upsert<T extends { id: string }>(collection: DataCollectionName, record: T): Promise<DataAccessResult<T>>;
}

export const collectionTableMap: Record<DataCollectionName, string> = {
  organizations: "organizations",
  products: "products",
  projects: "projects",
  modules: "modules",
  agents: "agents",
  knowledgeObjects: "knowledge_objects",
  tasks: "tasks",
  recommendations: "recommendations",
  ingestionSources: "ingestion_sources",
  contentMaps: "content_maps",
  graphNodes: "graph_nodes",
  graphEdges: "graph_edges",
  activity: "activity_events"
};

function success<T>(data: T): DataAccessResult<T> {
  return { ok: true, data };
}

function failure<T>(error: string): DataAccessResult<T> {
  return { ok: false, error };
}

export function createSupabaseRepositoryAdapter(
  client: SupabaseLikeClient,
  options: SupabaseRepositoryAdapterOptions = {}
): SupabaseRepositoryAdapter {
  const tableFor = (collection: DataCollectionName) => {
    const table = collectionTableMap[collection];
    return options.schema ? `${options.schema}.${table}` : table;
  };

  return {
    provider: "supabase",
    tableFor,

    async list<T>(collection: DataCollectionName): Promise<DataAccessResult<T[]>> {
      const table = tableFor(collection);
      const { data, error } = await client.from(table).select("*");
      if (error) return failure<T[]>(String(error));
      return success((data ?? []) as T[]);
    },

    async findById<T>(collection: DataCollectionName, id: string): Promise<DataAccessResult<T>> {
      const table = tableFor(collection);
      const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
      if (error) return failure<T>(String(error));
      if (!data) return failure<T>(`Record not found: ${collection}/${id}`);
      return success(data as T);
    },

    async upsert<T extends { id: string }>(collection: DataCollectionName, record: T): Promise<DataAccessResult<T>> {
      const table = tableFor(collection);
      const { error } = await client.from(table).upsert(record, { onConflict: "id" });
      if (error) return failure<T>(String(error));
      return success(record);
    }
  };
}

export function getSupabaseBootstrapOrder(): DataCollectionName[] {
  return [
    "organizations",
    "products",
    "projects",
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
  ];
}

export async function seedSupabaseFromSnapshot(
  adapter: SupabaseRepositoryAdapter,
  snapshot: TipRepositorySnapshot
): Promise<DataAccessResult<{ insertedCollections: number; insertedRecords: number }>> {
  let insertedCollections = 0;
  let insertedRecords = 0;

  for (const collection of getSupabaseBootstrapOrder()) {
    const records = snapshot[collection] as Array<{ id: string }>;
    insertedCollections += 1;

    for (const record of records) {
      const result = await adapter.upsert(collection, record);
      if (!result.ok) return failure(result.error ?? `Failed to seed ${collection}/${record.id}`);
      insertedRecords += 1;
    }
  }

  return success({ insertedCollections, insertedRecords });
}

export function describeSupabaseReadiness(options: {
  hasUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
}): string[] {
  const notes: string[] = [];

  notes.push(options.hasUrl ? "Supabase URL configured." : "Supabase URL missing.");
  notes.push(options.hasAnonKey ? "Supabase anon key configured." : "Supabase anon key missing.");
  notes.push(options.hasServiceRoleKey ? "Service role key configured for server-only operations." : "Service role key not configured yet.");

  if (options.hasUrl && options.hasAnonKey) {
    notes.push("Client-side Supabase reads can be wired once the project exists.");
  }

  return notes;
}
