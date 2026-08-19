export interface TipServerConfig {
  port: number;
  host: string;
  environment: "local" | "development" | "production" | "test";
  apiMode: "local-static" | "api" | "supabase";
  persistenceProvider: "local-memory" | "postgres" | "neon" | "supabase";
  databaseUrl?: string;
  postgresSslMode: "auto" | "require" | "disable";
  corsOrigins: string[];
  liveCrawlerEnabled: boolean;
  aiProvider: "manual" | "openai" | "other";
}

function readCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readPersistenceProvider(value: string | undefined): TipServerConfig["persistenceProvider"] {
  if (value === "postgres" || value === "neon" || value === "supabase") return value;
  return "local-memory";
}

function readPostgresSslMode(value: string | undefined): TipServerConfig["postgresSslMode"] {
  if (value === "require" || value === "disable") return value;
  return "auto";
}

export function readTipServerConfig(env: NodeJS.ProcessEnv = process.env): TipServerConfig {
  const persistenceProvider = readPersistenceProvider(env.TIP_PERSISTENCE_PROVIDER);

  return {
    port: Number(env.PORT ?? env.TIP_API_PORT ?? 4310),
    host: env.TIP_API_HOST ?? "0.0.0.0",
    environment: (env.TIP_ENV as TipServerConfig["environment"]) ?? "local",
    apiMode: (env.TIP_API_MODE as TipServerConfig["apiMode"]) ?? "local-static",
    persistenceProvider,
    databaseUrl: env.NEON_DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DB_URL,
    postgresSslMode: readPostgresSslMode(env.POSTGRES_SSL_MODE),
    corsOrigins: readCsv(env.TIP_CORS_ORIGINS, ["http://localhost:5173", "http://127.0.0.1:5173"]),
    liveCrawlerEnabled: env.TIP_ENABLE_LIVE_CRAWLER === "true",
    aiProvider: (env.TIP_AI_PROVIDER as TipServerConfig["aiProvider"]) ?? "manual"
  };
}

export function describeServerReadiness(config: TipServerConfig): string[] {
  const notes = [
    `API mode: ${config.apiMode}`,
    `Environment: ${config.environment}`,
    `Persistence provider: ${config.persistenceProvider}`,
    `Database connection configured: ${config.databaseUrl ? "yes" : "no"}`,
    `Live crawler enabled: ${config.liveCrawlerEnabled ? "yes" : "no"}`,
    `AI provider: ${config.aiProvider}`
  ];

  if (config.persistenceProvider === "local-memory") {
    notes.push("Using in-memory review decision persistence until a Postgres/Supabase connection is available.");
  }

  if (config.persistenceProvider !== "local-memory" && !config.databaseUrl) {
    notes.push("A persistence provider was selected, but no DATABASE_URL/NEON_DATABASE_URL/SUPABASE_DB_URL is configured.");
  }

  if (!config.liveCrawlerEnabled) {
    notes.push("Live crawling remains disabled by default for safety.");
  }

  return notes;
}

export function isOriginAllowed(origin: string | undefined, config: TipServerConfig): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes("*")) return true;
  return config.corsOrigins.includes(origin);
}
