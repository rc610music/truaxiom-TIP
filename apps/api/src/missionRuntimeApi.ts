import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  MissionRuntime,
  RuntimeError,
  operatorSecretsMatch,
  type AgentManifest,
  type CapabilityManifest,
  type OperatorAuthConfig,
  type ArtifactRepository,
  type RuntimeDeliveryRepository,
} from "@truaxiom/core";

/** Repository-owned manifests only. An HTTP caller cannot register or elevate an agent. */
export async function loadRuntimeCatalog(profile = "default") {
  if (!["default", "repository-inspection"].includes(profile))
    throw new RuntimeError(400, "Unknown trusted runtime catalog profile");
  async function load(directory: string): Promise<unknown[]> {
    const url = new URL(
      `../../../packages/contracts/${profile === "repository-inspection" ? "runtime-003/" : ""}${directory}/`,
      import.meta.url,
    );
    const files = (await readdir(fileURLToPath(url)))
      .filter((f) => f.endsWith(".json"))
      .sort();
    return Promise.all(
      files.map((f) => readFile(new URL(f, url), "utf8").then(JSON.parse)),
    );
  }
  return {
    agents: (await load("agents")) as AgentManifest[],
    capabilities: (await load("capabilities")) as CapabilityManifest[],
  };
}
export interface RuntimeApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}
export function createMissionRuntimeApi(
  runtime: MissionRuntime,
  auth: OperatorAuthConfig,
  artifacts?: ArtifactRepository,
  deliveries?: RuntimeDeliveryRepository,
) {
  return async (
    request: RuntimeApiRequest,
  ): Promise<{ status: number; body: unknown }> => {
    // All runtime records (including evidence links) require authentication, even local memory.
    const secret =
      request.headers?.["x-tip-operator-secret"] ??
      request.headers?.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!auth.secret || !secret || !operatorSecretsMatch(secret, auth.secret))
      return {
        status: 401,
        body: { error: "Runtime operator authentication required" },
      };
    const principal = { actor: auth.actor, role: "operator" as const };
    try {
      if (
        request.path === "/v1/runtime/deliveries" &&
        request.method === "GET"
      ) {
        return {
          status: 200,
          body: {
            source: runtime.repository.source,
            deliveries: ((await deliveries?.list()) ?? []).map(
              ({ lease_token, ...row }) => row,
            ),
          },
        };
      }
      const retryPath = request.path.match(
        /^\/v1\/runtime\/deliveries\/([a-f0-9]{64})\/retry$/,
      );
      if (retryPath && request.method === "POST") {
        if (
          !request.body ||
          typeof request.body !== "object" ||
          Array.isArray(request.body) ||
          Object.keys(request.body).length
        )
          throw new RuntimeError(400, "Empty retry payload required");
        const row = (await deliveries?.list())?.find(
          (r) => r.delivery_id === retryPath[1],
        );
        if (!row) throw new RuntimeError(404, "Delivery not found");
        if (!["PAUSED", "PENDING"].includes(row.status))
          throw new RuntimeError(409, "Only paused deliveries can be requeued");
        await deliveries!.retry(
          row.delivery_id,
          new Date().toISOString(),
          principal.actor,
        );
        return {
          status: 200,
          body: {
            delivery_id: row.delivery_id,
            status: (await deliveries!.list()).find(
              (r) => r.delivery_id === row.delivery_id,
            )!.status,
          },
        };
      }
      if (request.path === "/v1/runtime/missions") {
        if (request.method === "GET")
          return {
            status: 200,
            body: {
              schema_version: "1.0",
              source: runtime.repository.source,
              missions: (await runtime.repository.list()).map((r) =>
                runtime.packet(r),
              ),
            },
          };
        if (request.method === "POST")
          return {
            status: 200,
            body: await runtime.create(request.body, principal),
          };
      }
      const evidencePath = request.path.match(
        /^\/v1\/runtime\/missions\/([^/]+)\/artifacts\/([a-f0-9]{64})$/,
      );
      if (evidencePath && request.method === "GET") {
        const record = await runtime.get(decodeURIComponent(evidencePath[1]));
        if (!record.evidence.some((e) => e.sha256 === evidencePath[2]))
          throw new RuntimeError(404, "Artifact not attached to mission");
        const body = await artifacts?.get(evidencePath[2]);
        if (!body || body.mission_id !== record.mission.mission_id)
          throw new RuntimeError(404, "Stored artifact not found");
        return {
          status: 200,
          body: { sha256: evidencePath[2], artifact: body },
        };
      }
      const match = request.path.match(
        /^\/v1\/runtime\/missions\/([^/]+)(?:\/(commands|bridge))?$/,
      );
      if (match) {
        let id: string;
        try {
          id = decodeURIComponent(match[1]);
        } catch {
          throw new RuntimeError(400, "Invalid mission path encoding");
        }
        if (request.method === "GET" && !match[2])
          return { status: 200, body: await runtime.get(id) };
        if (request.method === "GET" && match[2] === "bridge")
          return { status: 200, body: runtime.packet(await runtime.get(id)) };
        if (request.method === "POST" && match[2] === "commands")
          return {
            status: 200,
            body: await runtime.command(id, request.body, principal),
          };
      }
      return { status: 404, body: { error: "Runtime route not found" } };
    } catch (error) {
      if (error instanceof RuntimeError)
        return { status: error.status, body: { error: error.message } };
      // Never expose query errors, connection strings or evidence payloads.
      return {
        status: 503,
        body: {
          error:
            "Runtime storage/catalog unavailable; verify migration and configuration",
        },
      };
    }
  };
}
