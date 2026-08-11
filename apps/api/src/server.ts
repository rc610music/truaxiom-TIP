import { createServer } from "node:http";
import { createTipApiGateway, describeServerReadiness, isOriginAllowed, readTipServerConfig } from "@truaxiom/core";

const config = readTipServerConfig();
const gateway = createTipApiGateway();

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown, origin?: string) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": origin && isOriginAllowed(origin, config) ? origin : config.corsOrigins[0] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  response.end(payload);
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  if (request.method !== "POST" && request.method !== "PUT" && request.method !== "PATCH") return undefined;

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const body = await readJsonBody(request);

  if (typeof body === "object" && body !== null && "__invalidJson" in body) {
    sendJson(response, 400, { error: "Invalid JSON request body" }, origin);
    return;
  }

  const result = await gateway.handleAsync({
    method: request.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body
  });

  sendJson(response, result.status, result.body, origin);
});

server.listen(config.port, config.host, () => {
  console.log(`TIP API listening on http://${config.host}:${config.port}`);
  for (const note of describeServerReadiness(config)) {
    console.log(`- ${note}`);
  }
});