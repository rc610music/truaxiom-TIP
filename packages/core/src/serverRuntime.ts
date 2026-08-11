export interface TipServerConfig {
  port: number;
  host: string;
  environment: "local" | "development" | "production" | "test";
  apiMode: "local-static" | "supabase";
  corsOrigins: string[];
  liveCrawlerEnabled: boolean;
  aiProvider: "manual" | "openai" | "other";
}

function readCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function readTipServerConfig(env: NodeJS.ProcessEnv = process.env): TipServerConfig {
  return {
    port: Number(env.TIP_API_PORT ?? env.PORT ?? 4310),
    host: env.TIP_API_HOST ?? "0.0.0.0",
    environment: (env.TIP_ENV as TipServerConfig["environment"]) ?? "local",
    apiMode: (env.TIP_API_MODE as TipServerConfig["apiMode"]) ?? "local-static",
    corsOrigins: readCsv(env.TIP_CORS_ORIGINS, ["http://localhost:5173", "http://127.0.0.1:5173"]),
    liveCrawlerEnabled: env.TIP_ENABLE_LIVE_CRAWLER === "true",
    aiProvider: (env.TIP_AI_PROVIDER as TipServerConfig["aiProvider"]) ?? "manual"
  };
}

export function describeServerReadiness(config: TipServerConfig): string[] {
  const notes = [
    `API mode: ${config.apiMode}`,
    `Environment: ${config.environment}`,
    `Live crawler enabled: ${config.liveCrawlerEnabled ? "yes" : "no"}`,
    `AI provider: ${config.aiProvider}`
  ];

  if (config.apiMode === "local-static") {
    notes.push("Using in-memory repository snapshot until Supabase project is available.");
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
