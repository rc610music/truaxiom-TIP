import { createServer } from "node:http";
import {
  MissionRuntime,
  createInMemoryRepository,
  createTipApiGateway,
  createTipBootstrapSnapshot,
  describeServerReadiness,
  isOriginAllowed,
  overlayRegistryOnSnapshot,
  readTipServerConfig,
  registryV1Version,
} from "@truaxiom/core";
import { createApiPersistenceRuntime } from "./persistence";
import {
  createMissionRuntimeApi,
  loadRuntimeCatalog,
} from "./missionRuntimeApi";

const config = readTipServerConfig();
const persistence = createApiPersistenceRuntime(config);
const runtime = new MissionRuntime(
  persistence.missionRepository,
  await loadRuntimeCatalog(),
);
const runtimeApi = createMissionRuntimeApi(runtime, config.operatorAuth);
const registryLoad = await persistence.loadRegistry();

if (registryLoad.error) {
  console.error(
    `Registry v1 stayed on the in-memory seed: ${registryLoad.error}`,
  );
}

const snapshot = registryLoad.records
  ? overlayRegistryOnSnapshot(
      createTipBootstrapSnapshot(),
      registryLoad.records,
    )
  : createTipBootstrapSnapshot();
const gateway = createTipApiGateway({
  repository: createInMemoryRepository(snapshot),
  reviewDecisionRepository: persistence.reviewDecisionRepository,
  approvalTaskRepository: persistence.approvalTaskRepository,
  approvedContentRepository: persistence.approvedContentRepository,
  operatorAuth: config.operatorAuth,
  modeLabel: config.apiMode,
  persistenceLabel: persistence.persistenceLabel,
  registryMeta: {
    version: registryV1Version,
    source: registryLoad.source,
    configuredProvider: registryLoad.configuredProvider,
    error: registryLoad.error,
  },
});

try {
  const replayed = await gateway.replayApprovedRecommendationTasks();
  if (replayed.length > 0) {
    console.log(
      `Replayed ${replayed.length} approved recommendation(s) into durable tasks.`,
    );
  }
} catch (error) {
  console.error(
    `Approved recommendation replay failed: ${error instanceof Error ? error.message : error}`,
  );
}

try {
  const replayedContent = await gateway.replayApprovedContentRecords();
  if (replayedContent.length > 0) {
    console.log(
      `Replayed ${replayedContent.length} approved content candidate(s) into durable records.`,
    );
  }
} catch (error) {
  console.error(
    `Approved content replay failed: ${error instanceof Error ? error.message : error}`,
  );
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  origin?: string,
) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin":
      origin && isOriginAllowed(origin, config)
        ? origin
        : (config.corsOrigins[0] ?? "*"),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Tip-Operator-Secret",
  });
  response.end(payload);
}

async function readJsonBody(
  request: import("node:http").IncomingMessage,
): Promise<unknown> {
  if (
    request.method !== "POST" &&
    request.method !== "PUT" &&
    request.method !== "PATCH"
  )
    return undefined;

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_048_576) throw new Error("Request body too large");
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return { __invalidJson: raw };
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin, config)) {
    sendJson(response, 403, { error: "Origin not allowed", origin }, origin);
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {}, origin);
    return;
  }

  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(
      response,
      413,
      { error: "Request body too large or unreadable" },
      origin,
    );
    return;
  }

  if (typeof body === "object" && body !== null && "__invalidJson" in body) {
    sendJson(response, 400, { error: "Invalid JSON request body" }, origin);
    return;
  }

  if (url.pathname.startsWith("/v1/runtime/")) {
    const result = await runtimeApi({
      method: request.method ?? "GET",
      path: url.pathname,
      body,
      headers: {
        authorization: request.headers.authorization,
        "x-tip-operator-secret":
          typeof request.headers["x-tip-operator-secret"] === "string"
            ? request.headers["x-tip-operator-secret"]
            : undefined,
      },
    });
    sendJson(response, result.status, result.body, origin);
    return;
  }

  const result = await gateway.handleAsync({
    method: request.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: {
      authorization:
        typeof request.headers.authorization === "string"
          ? request.headers.authorization
          : undefined,
      "x-tip-operator-secret":
        typeof request.headers["x-tip-operator-secret"] === "string"
          ? request.headers["x-tip-operator-secret"]
          : undefined,
    },
    body,
  });

  sendJson(response, result.status, result.body, origin);
});

async function shutdown() {
  await persistence.dispose();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(config.port, config.host, () => {
  console.log(`TIP API listening on http://${config.host}:${config.port}`);
  for (const note of describeServerReadiness(config)) {
    console.log(`- ${note}`);
  }
  for (const note of persistence.readinessNotes) {
    console.log(`- ${note}`);
  }
});
