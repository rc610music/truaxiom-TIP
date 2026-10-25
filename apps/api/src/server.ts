import {
  createRuntimeWorkerApi,
  readWorkerCredentials,
} from "./runtimeWorkerApi";
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
  readRuntimeDeliveryMappings,
  createCommandCenterCandidateTransport,
  deliverNextRuntimePacket,
  readWakeBindings,
  createHttpsWakeSender,
  createWakeLedgerRecorder,
  dispatchRuntimeWake,
  RuntimeError,
} from "@truaxiom/core";
import { createApiPersistenceRuntime } from "./persistence";
import {
  createMissionRuntimeApi,
  loadRuntimeCatalog,
} from "./missionRuntimeApi";

const config = readTipServerConfig();
const deliveryMappings = readRuntimeDeliveryMappings(
  process.env.TIP_COMMAND_CENTER_PROJECT_MAPPINGS,
);
const persistence = createApiPersistenceRuntime(config, deliveryMappings);
const runtimeCatalog = await loadRuntimeCatalog(process.env.TIP_RUNTIME_CATALOG);
const runtime = new MissionRuntime(
  persistence.missionRepository,
  runtimeCatalog,
  undefined,
  persistence.runtimeArtifacts,
);
const runtimeApi = createMissionRuntimeApi(
  runtime,
  config.operatorAuth,
  persistence.runtimeArtifacts,
  persistence.runtimeDeliveries,
);
const deliveryEnabled = process.env.TIP_RUNTIME_DELIVERY_ENABLED;
if (deliveryEnabled && !["true", "false"].includes(deliveryEnabled))
  throw new Error("Invalid runtime delivery enable flag");
if (
  deliveryEnabled === "true" &&
  (config.environment !== "development" ||
    config.persistenceProvider === "local-memory" ||
    !config.databaseUrl ||
    !deliveryMappings.length)
)
  throw new Error(
    "Delivery scheduling requires an explicitly configured durable development runtime",
  );
const deliveryTransport =
  deliveryEnabled === "true"
    ? createCommandCenterCandidateTransport(
        process.env.TIP_CC_EXISTING_TOKEN ?? "",
      )
    : null;
let deliveryTick: Promise<unknown> | null = null;
let deliveryStopping = false;
const deliveryTimer = deliveryTransport
  ? setInterval(() => {
      if (deliveryTick || deliveryStopping) return;
      deliveryTick = deliverNextRuntimePacket(
        persistence.runtimeDeliveries,
        deliveryTransport,
      )
        .catch(() => {
          console.error(
            "Runtime delivery storage unavailable; attempt left fenced for recovery",
          );
        })
        .finally(() => {
          deliveryTick = null;
        });
    }, 10000)
  : null;
deliveryTimer?.unref();
const workerApi = createRuntimeWorkerApi(
  runtime,
  persistence.runtimeArtifacts,
  readWorkerCredentials(process.env.TIP_WORKER_CREDENTIAL_DIGESTS),
);
const wakeEnabled = process.env.TIP_RUNTIME_WAKE_ENABLED;
if (wakeEnabled && !["true", "false"].includes(wakeEnabled)) throw new Error("Invalid runtime wake enable flag");
const wakeBindings = readWakeBindings(process.env.TIP_RUNTIME_WAKE_BINDINGS);
const wakeWorkers = readWorkerCredentials(process.env.TIP_WORKER_CREDENTIAL_DIGESTS);
if (wakeEnabled === "true" && (!deliveryTransport || config.environment !== "development" || persistence.missionRepository.source !== "postgres" || !config.operatorAuth.secret || !wakeBindings.length || wakeBindings.some(b => !runtimeCatalog.agents.some(a => a.agent_id === b.agent_id && a.lifecycle_state === "active") || !wakeWorkers.some(c => c.agent_id === b.agent_id)))) throw new Error("Wake activation requires durable development, existing authorized ledger mapping, active registry agents and dedicated worker/endpoint credentials");
const wakeSenders = wakeEnabled === "true" ? new Map(wakeBindings.map(b => [b.agent_id, createHttpsWakeSender(b)])) : new Map();
const recordWake = deliveryTransport ? createWakeLedgerRecorder(deliveryTransport, deliveryMappings) : null;
let wakeTick: Promise<unknown> | null = null;
const wakeTimer = wakeEnabled === "true" ? setInterval(() => {
  if (wakeTick || deliveryStopping) return;
  wakeTick = (async () => {
    // Bounded catch-up scan. CAS prevents duplicate dispatch across concurrent scheduler replicas.
    const records = (await runtime.repository.list()).filter(r => {
      const target = runtime.wakeTarget(r);
      if (!target) return false;
      const wake = r.wake?.assignment_key === target.assignment_key ? r.wake : null;
      return !wake || (wake.status !== "DEAD_LETTER" && Date.parse(wake.due_at) <= Date.now());
    }).slice(0, 100);
    for (let i = 0; i < records.length; i += 4) await Promise.all(records.slice(i, i + 4).map(async r => {
      const mapping = deliveryMappings.find(m => m.tip_project_id === r.mission.project_id);
      if (!mapping) return; // Scope is never broadened by discovery.
      const sender = wakeSenders.get(r.delegation.assigned_agent_id!);
      await dispatchRuntimeWake(runtime, r.mission.mission_id, {
        recipient: wakeBindings.find(b => b.agent_id === r.delegation.assigned_agent_id)?.comms_recipient ?? "",
        record: recordWake!,
        wake: sender ?? (async () => { throw new RuntimeError(503, "Agent endpoint unavailable"); }),
      }, mapping);
    }));
  })().catch(() => console.error("Runtime wake scan unavailable; durable attempts retained for recovery")).finally(() => { wakeTick = null; });
}, 5000) : null;
wakeTimer?.unref();
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
    const result = await (
      url.pathname.startsWith("/v1/runtime/worker/") ? workerApi : runtimeApi
    )({
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
  deliveryStopping = true;
  if (wakeTimer) clearInterval(wakeTimer);
  if (wakeTick) await wakeTick;
  if (deliveryTimer) clearInterval(deliveryTimer);
  if (deliveryTick) await deliveryTick;
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

