import { Pool } from "pg";
import {
  approvalTaskSchemaStatements,
  createInMemoryApprovalTaskRepository,
  createInMemoryReviewDecisionRepository,
  createPostgresApprovalTaskRepository,
  createPostgresRegistryRepository,
  createPostgresReviewDecisionRepository,
  describePostgresReviewDecisionAdapter,
  describeReviewDecisionRepository,
  registrySchemaSql,
  registryV1,
  type ApprovalTaskRepository,
  type PostgresRegistryRepository,
  type RegistryRecords,
  type RegistrySource,
  type ReviewDecisionRepository,
  type TipServerConfig
} from "@truaxiom/core";

export interface RegistryLoadResult {
  source: RegistrySource;
  configuredProvider: RegistrySource;
  records?: RegistryRecords;
  error?: string;
}

export interface ApiPersistenceRuntime {
  reviewDecisionRepository: ReviewDecisionRepository;
  approvalTaskRepository: ApprovalTaskRepository;
  persistenceLabel: string;
  readinessNotes: string[];
  loadRegistry(): Promise<RegistryLoadResult>;
  dispose(): Promise<void>;
}

function shouldUseSsl(config: TipServerConfig): boolean {
  if (config.postgresSslMode === "disable") return false;
  if (config.postgresSslMode === "require") return true;
  return config.persistenceProvider === "neon" || config.persistenceProvider === "supabase";
}

function createPool(config: TipServerConfig): Pool {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL or NEON_DATABASE_URL is required for Postgres persistence.");
  }

  return new Pool({
    connectionString: config.databaseUrl,
    ssl: shouldUseSsl(config) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.POSTGRES_POOL_MAX ?? 4),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECTION_TIMEOUT_MS ?? 10_000)
  });
}

export function createApiPersistenceRuntime(config: TipServerConfig): ApiPersistenceRuntime {
  if (config.persistenceProvider === "local-memory" || !config.databaseUrl) {
    return {
      reviewDecisionRepository: createInMemoryReviewDecisionRepository(),
      approvalTaskRepository: createInMemoryApprovalTaskRepository(),
      persistenceLabel: "in-memory-review-decision-repository",
      readinessNotes: describeReviewDecisionRepository("in-memory"),
      async loadRegistry() {
        return {
          source: "in-memory-seed",
          configuredProvider: "in-memory-seed"
        };
      },
      async dispose() {
        return undefined;
      }
    };
  }

  const pool = createPool(config);
  const provider = config.persistenceProvider === "neon" ? "neon" : config.persistenceProvider === "supabase" ? "supabase" : "postgres";
  let schemaReady: Promise<void> | undefined;

  function ensureSchema() {
    schemaReady ??= pool.query(`
      create table if not exists tip_review_decisions (
        id text primary key,
        queue_id text not null,
        item_id text not null,
        action text not null check (action in ('approve', 'reject', 'defer')),
        decided_by text not null,
        note text,
        decided_at timestamptz not null,
        resulting_status text not null,
        mode text not null default 'persistent',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_tip_review_decisions_queue
        on tip_review_decisions(queue_id, decided_at desc);
    `).then(() => undefined);

    return schemaReady;
  }

  let registrySchemaReady: Promise<void> | undefined;

  function ensureRegistrySchema() {
    registrySchemaReady ??= pool.query(registrySchemaSql).then(() => undefined);
    return registrySchemaReady;
  }

  async function query(sql: string, params: unknown[] = []) {
    const result = await pool.query(sql, params as any[]);
    return result.rows;
  }

  const reviewDecisionRepository = createPostgresReviewDecisionRepository({
    provider,
    connectionString: config.databaseUrl,
    async query(sql, params = []) {
      await ensureSchema();
      return query(sql, params);
    }
  });

  let taskSchemaReady: Promise<void> | undefined;

  function ensureTaskSchema() {
    taskSchemaReady ??= (async () => {
      for (const statement of approvalTaskSchemaStatements) {
        await pool.query(statement);
      }
    })();
    return taskSchemaReady;
  }

  const registryRepository: PostgresRegistryRepository = createPostgresRegistryRepository({
    async query(sql, params = []) {
      await ensureRegistrySchema();
      return query(sql, params);
    }
  });

  const approvalTaskRepository = createPostgresApprovalTaskRepository({
    async query(sql, params = []) {
      await ensureRegistrySchema();
      await ensureTaskSchema();
      return query(sql, params);
    }
  });

  return {
    reviewDecisionRepository,
    approvalTaskRepository,
    persistenceLabel: `${provider}-review-decision-repository`,
    readinessNotes: [
      ...describePostgresReviewDecisionAdapter({
        provider,
        connectionString: config.databaseUrl,
        query: async () => []
      }),
      `Postgres SSL mode: ${config.postgresSslMode}`,
      "Review decisions will persist through the configured database connection.",
      "Registry v1 organizations, products, and projects reconcile to Postgres on startup.",
      "Approved recommendations are written to the tasks table with Registry project ids."
    ],
    async loadRegistry() {
      try {
        const records = await registryRepository.reconcile(registryV1);
        return {
          source: provider,
          configuredProvider: provider,
          records
        };
      } catch (error) {
        return {
          source: "in-memory-seed",
          configuredProvider: provider,
          error: error instanceof Error ? error.message : "Registry reconcile failed"
        };
      }
    },
    async dispose() {
      await pool.end();
    }
  };
}
