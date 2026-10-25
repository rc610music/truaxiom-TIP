import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.env.TIP_COMMAND_CENTER_SOURCE;
if (!root) {
  console.error("TIP_COMMAND_CENTER_SOURCE is required");
  process.exit(1);
}
const loaded = await import(pathToFileURL(join(root, "server/agent-comms.ts")).href);
const dispatchAgentComms = loaded.dispatchAgentComms;
const agentCommsFailure = loaded.agentCommsFailure;
if (typeof dispatchAgentComms !== "function" || typeof agentCommsFailure !== "function") {
  console.error("Command Center agent-comms.ts did not export the HTTP dispatcher");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2_000_000) {
      response.writeHead(413, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Request body is too large.", code: "VALIDATION" }));
      return;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Request body must be JSON.", code: "VALIDATION" }));
      return;
    }
  }
  try {
    const result = await dispatchAgentComms({
      method: request.method ?? "GET",
      pathname: url.pathname,
      url,
      body,
      idempotencyKey: String(request.headers["idempotency-key"] ?? ""),
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
    });
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  } catch (error) {
    const failure = agentCommsFailure(error);
    if (failure) {
      response.writeHead(failure.status, { "content-type": "application/json" });
      response.end(JSON.stringify(failure.body));
      return;
    }
    console.error(error instanceof Error ? error.message : "Agent Comms request failed");
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Agent Comms request failed.", code: "INTERNAL" }));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Loopback listener did not bind an address");
    process.exit(1);
  }
  console.log(`AGENT_COMMS_READY ${address.port}`);
});
