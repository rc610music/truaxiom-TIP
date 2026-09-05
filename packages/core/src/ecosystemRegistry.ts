export type EcosystemSourceStatus = "healthy" | "degraded" | "offline" | "authorization_required";

export interface EcosystemSourceDefinition {
  id: string;
  name: string;
  kind: "website" | "repository" | "document_store" | "deployment";
  publicUrl?: string;
  adminUrl?: string;
  sourceUrl?: string;
  healthUrl?: string;
  syncMode: "live_check" | "oauth_required" | "manual";
}

export interface EcosystemSourceHealth extends EcosystemSourceDefinition {
  status: EcosystemSourceStatus;
  httpStatus?: number;
  latencyMs?: number;
  checkedAt: string;
  note: string;
}

export const ecosystemSources: EcosystemSourceDefinition[] = [
  {
    id: "SRC-TIP-RENDER",
    name: "TIP Render API",
    kind: "deployment",
    publicUrl: "https://truaxiom-tip-api.onrender.com",
    adminUrl: "https://dashboard.render.com/web/srv-da30t7k9v7es73cqbm60",
    healthUrl: "https://truaxiom-tip-api.onrender.com/health",
    syncMode: "live_check"
  },
  {
    id: "SRC-TIP-GITHUB",
    name: "TIP GitHub Repository",
    kind: "repository",
    publicUrl: "https://github.com/rc610music/truaxiom-TIP",
    sourceUrl: "https://github.com/rc610music/truaxiom-TIP",
    healthUrl: "https://github.com/rc610music/truaxiom-TIP",
    syncMode: "live_check"
  },
  {
    id: "SRC-GOOGLE-DRIVE",
    name: "TruaXiom Google Drive",
    kind: "document_store",
    adminUrl: "https://drive.google.com/drive/my-drive",
    syncMode: "oauth_required"
  },
  {
    id: "SRC-ROOTWORK",
    name: "RootWork",
    kind: "website",
    publicUrl: "https://restoreyour.life",
    healthUrl: "https://restoreyour.life",
    syncMode: "live_check"
  },
  {
    id: "SRC-TRUAXIOM-WEB",
    name: "TruaXiom Public Site",
    kind: "website",
    publicUrl: "https://truaxiom.llc",
    adminUrl: "https://truaxiom.llc/admin",
    healthUrl: "https://truaxiom.llc",
    syncMode: "live_check"
  },
  {
    id: "SRC-VIBN",
    name: "V!B^n",
    kind: "website",
    publicUrl: "https://vibn.social",
    adminUrl: "https://vibn.social/admin",
    healthUrl: "https://vibn.social",
    syncMode: "live_check"
  },
  {
    id: "SRC-DOTDIZZY",
    name: "DotDizzy",
    kind: "website",
    publicUrl: "https://dotdizzy.com",
    adminUrl: "https://dotdizzy.com/admin",
    healthUrl: "https://dotdizzy.com",
    syncMode: "live_check"
  }
];

async function checkSource(source: EcosystemSourceDefinition): Promise<EcosystemSourceHealth> {
  const checkedAt = new Date().toISOString();

  if (source.syncMode === "oauth_required") {
    return { ...source, status: "authorization_required", checkedAt, note: "Connect OAuth before private document ingestion can run." };
  }

  if (!source.healthUrl) {
    return { ...source, status: "degraded", checkedAt, note: "No automated health URL is configured." };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(source.healthUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "TruaXiom-TIP-Source-Health/1.0" }
    });
    const latencyMs = Date.now() - startedAt;
    void response.body?.cancel();
    const status = response.ok ? "healthy" : response.status >= 500 ? "offline" : "degraded";
    return { ...source, status, httpStatus: response.status, latencyMs, checkedAt, note: response.ok ? "Live endpoint responded successfully." : `Endpoint returned HTTP ${response.status}.` };
  } catch (error) {
    return {
      ...source,
      status: "offline",
      latencyMs: Date.now() - startedAt,
      checkedAt,
      note: error instanceof Error ? error.message : "Source health check failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEcosystemStatus() {
  const skipLiveChecks = process.env.TIP_SOURCE_HEALTH_MODE === "skip";
  const sources = skipLiveChecks
    ? ecosystemSources.map((source): EcosystemSourceHealth => ({
        ...source,
        status: source.syncMode === "oauth_required" ? "authorization_required" : "degraded",
        checkedAt: new Date().toISOString(),
        note: "Live source checks were skipped by runtime configuration."
      }))
    : await Promise.all(ecosystemSources.map(checkSource));
  return {
    checkedAt: new Date().toISOString(),
    sources,
    summary: {
      total: sources.length,
      healthy: sources.filter((source) => source.status === "healthy").length,
      degraded: sources.filter((source) => source.status === "degraded").length,
      offline: sources.filter((source) => source.status === "offline").length,
      authorizationRequired: sources.filter((source) => source.status === "authorization_required").length
    }
  };
}
