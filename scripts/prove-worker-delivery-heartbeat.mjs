import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { MissionRuntime } from "../packages/core/src/missionRuntime.ts";
import { createPostgresMissionRepository } from "../packages/core/src/missionRepository.ts";
import { createPostgresRuntimeArtifacts } from "../packages/core/src/runtimeArtifactRepository.ts";
import { createPostgresRuntimeDeliveries } from "../packages/core/src/runtimeDeliveryRepository.ts";
import { createGitHubMetadataReader } from "../packages/core/src/repositoryInspector.ts";
import {
  CONTROLLED_HEARTBEAT_REF,
  controlledHeartbeatMission,
  recheckGovernedHeartbeat,
  runGovernedHeartbeat,
} from "../packages/core/src/runtimeHeartbeatLoop.ts";
import { loadRuntimeCatalog } from "../apps/api/src/missionRuntimeApi.ts";

const missionId = "MISSION-DEV-HEARTBEAT-20261025";
const operator = { actor: "OPERATOR-DEV-HEARTBEAT", role: "operator" };
const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: "CC-TIP-DEV-HEARTBEAT",
  environment: "development",
};
const reviewNote =
  "Operator accepted the isolated heartbeat report. This is not Dot approval.";
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(url);
  const method = init?.method ?? "GET";
  calls.push({ method, host: target.host, path: target.pathname });
  if (target.host !== "api.github.com" || method !== "GET")
    throw new Error("Heartbeat blocked a non-read or non-GitHub request");
  return originalFetch(url, init);
};

const view = {
  project: { id: mapping.command_center_project_id, checkpoint_version: 0 },
  tasks: [],
  evidence: [],
  messages: [],
};
const transport = {
  project: async () => structuredClone(view),
  write: async (path, body) => {
    if (body.env !== "development") throw new Error("Non-development delivery");
    view[path.slice(1)].push(structuredClone(body));
    view.project.checkpoint_version += 1;
  },
};

const dir = await mkdtemp(join(tmpdir(), "tip-heartbeat-live-"));
let db = new PGlite(dir);
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const startedAt = new Date().toISOString();
try {
  if ((process.env.TIP_ENV ?? "development") !== "development")
    throw new Error("Refusing heartbeat proof outside development");
  for (const file of [
    "012_tip_runtime_002.sql",
    "013_tip_runtime_artifacts.sql",
    "014_tip_runtime_deliveries.sql",
  ])
    await db.exec(
      await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
    );
  const catalog = await loadRuntimeCatalog("repository-inspection");
  const reader = createGitHubMetadataReader();
  const open = () =>
    new MissionRuntime(
      createPostgresMissionRepository(query, [mapping]),
      catalog,
      undefined,
      createPostgresRuntimeArtifacts(query),
    );
  const first = await runGovernedHeartbeat({
    env: "development",
    runtime: open(),
    artifacts: createPostgresRuntimeArtifacts(query),
    deliveries: createPostgresRuntimeDeliveries(query),
    transport,
    mappings: [mapping],
    mission: controlledHeartbeatMission(missionId),
    operator,
    read: reader,
    reviewNote,
  });
  const reads = calls.length;
  await db.close();
  db = new PGlite(dir);
  const runtime = open();
  const artifacts = createPostgresRuntimeArtifacts(query);
  const deliveries = createPostgresRuntimeDeliveries(query);
  const check = await recheckGovernedHeartbeat({
    runtime,
    artifacts,
    deliveries,
    ledger: view,
    missionId,
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
  const second = await runGovernedHeartbeat({
    env: "development",
    runtime,
    artifacts,
    deliveries,
    transport,
    mappings: [mapping],
    mission: controlledHeartbeatMission(missionId),
    operator,
    read: reader,
    reviewNote,
  });
  if (second.executed || second.revision !== first.revision || calls.length !== reads)
    throw new Error("Duplicate heartbeat execution or delivery was observed");
  const report = await artifacts.get(check.evidence_sha256);
  const proof = {
    status: "LIVE_EXECUTED",
    condition: "controlled-test-condition",
    mission_id: missionId,
    repository: report.content.repository,
    ref: CONTROLLED_HEARTBEAT_REF,
    commit_sha: report.content.commit_sha,
    commit_message: String(report.content.commit_message ?? "").slice(0, 240),
    path_count: report.content.paths.length,
    includes_readme: report.content.paths.includes("README.md"),
    check_run_count: report.content.check_runs.length,
    sample_paths: report.content.paths.slice(0, 15),
    worker: check.assigned_agent_id,
    capability: check.capability_id,
    revision: check.revision,
    evidence_sha256: check.evidence_sha256,
    packet_sha256: check.packet_sha256,
    ledger_task_id: check.ledger_task_id,
    delivered_revisions: check.delivered_revisions,
    ledger_messages: view.messages.length,
    ledger_evidence: view.evidence.length,
    github_gets: calls,
    duplicate_execution: false,
    duplicate_delivery: false,
    recheck: check.result,
    restarted_before_recheck: true,
    production_mutation: false,
    command_center_candidate_contacted: false,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
  if (
    proof.commit_sha !== CONTROLLED_HEARTBEAT_REF ||
    proof.includes_readme !== true ||
    calls.some((call) => call.method !== "GET" || call.host !== "api.github.com")
  )
    throw new Error("Live observation did not match the pinned read-only repository");
  const body = JSON.stringify(proof, null, 2) + "\n";
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await writeFile("/opt/cursor/artifacts/heartbeat-proof.json", body);
  await writeFile(
    new URL("../docs/evidence/runtime-heartbeat-20261025.json", import.meta.url),
    body,
  );
  console.log(body);
} finally {
  globalThis.fetch = originalFetch;
  await db.close();
  await rm(dir, { recursive: true, force: true });
}
