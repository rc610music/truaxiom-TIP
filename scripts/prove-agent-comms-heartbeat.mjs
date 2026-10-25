import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
import {
  createCommandCenterLoopbackTransport,
  recoverLatestCommittedPacket,
} from "../packages/core/src/commandCenterRuntimeBridge.ts";
import {
  createPostgresIndependentVerifications,
  missionVerificationLifecycle,
  recordIndependentVerification,
} from "../packages/core/src/independentVerification.ts";
import { loadRuntimeCatalog } from "../apps/api/src/missionRuntimeApi.ts";

const exec = promisify(execFile);
const missionId = "MISSION-DEV-HEARTBEAT-20261025";
const projectId = "CC-TIP-DEV-HEARTBEAT";
const operator = { actor: "OPERATOR-DEV-HEARTBEAT", role: "operator" };
const observer = { actor: "PIE-OBSERVER", role: "pie-observer" };
const reviewNote = "Operator accepted the isolated heartbeat report. This is not Dot approval.";
const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: projectId,
  environment: "development",
  comms_recipient: "GROKBOT_COS",
};
const ccRoot = process.env.TIP_COMMAND_CENTER_SOURCE ?? "/tmp/truaxiom-cc";
const ccRef = "refs/heads/cursor/cc-restore-s07-s10-s11-crm-a748";
const database = "tip_comms_heartbeat";
const password = randomBytes(18).toString("hex");
const secrets = {
  TIP: randomBytes(24).toString("hex"),
  GROKBOT_COS: randomBytes(24).toString("hex"),
  SUPERGROK: randomBytes(24).toString("hex"),
};
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(url);
  const method = init?.method ?? "GET";
  calls.push({ method, host: target.host, path: target.pathname });
  if (target.host !== "api.github.com" || method !== "GET")
    throw new Error(`Heartbeat blocked ${method} ${target.host}`);
  return originalFetch(url, init);
};

function fail(message) {
  throw new Error(message);
}

async function psqlAdmin(sql) {
  await exec("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

async function psql(sql) {
  await exec("psql", [
    "-h", "127.0.0.1",
    "-U", "tip_comms",
    "-d", database,
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], { env: { ...process.env, PGPASSWORD: password } });
}

async function prepareDatabase() {
  await psqlAdmin(`
    DO $$ BEGIN
      CREATE ROLE tip_comms LOGIN PASSWORD '${password}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER ROLE tip_comms PASSWORD '${password}';
    END $$;
  `);
  await psqlAdmin(`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '${database}' AND pid <> pg_backend_pid();
  `);
  await psqlAdmin(`DROP DATABASE IF EXISTS ${database}`);
  await psqlAdmin(`CREATE DATABASE ${database} OWNER tip_comms`);
  for (const file of [
    "20261007_ops_private_agent_comms.sql",
    "20261011_ops_private_message_acks.sql",
    "20261020_ops_private_gemini_identity.sql",
  ]) {
    await exec("psql", [
      "-h", "127.0.0.1",
      "-U", "tip_comms",
      "-d", database,
      "-v", "ON_ERROR_STOP=1",
      "-f", join(ccRoot, "migrations", file),
    ], { env: { ...process.env, PGPASSWORD: password } });
  }
  await psql(`
    INSERT INTO ops_private.projects
      (id, name, status, env, summary, checkpoint_version, requires_dot, created_by, updated_by)
    VALUES
      ('${projectId}', 'TIP development heartbeat', 'ACTIVE', 'development', '', 0, false, 'TIP', 'TIP');
  `);
}

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/agent-comms-loopback-host.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_PATH: join(process.cwd(), "node_modules"),
      NODE_ENV: "development",
      TIP_COMMAND_CENTER_SOURCE: ccRoot,
      AGENT_COMMS_DATABASE_URL: `postgres://tip_comms:${password}@127.0.0.1:5432/${database}`,
      AGENT_COMMS_API_KEYS: JSON.stringify([
        { agent: "TIP", secret: secrets.TIP, permissions: ["read", "post_status", "post_evidence", "post_message"] },
        { agent: "GROKBOT_COS", secret: secrets.GROKBOT_COS, permissions: ["read", "post_message"] },
        { agent: "SUPERGROK", secret: secrets.SUPERGROK, permissions: ["read", "post_verification"] },
      ]),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Agent Comms host did not start\n${logs}`)), 20000);
    child.stdout.on("data", () => {
      const match = logs.match(/AGENT_COMMS_READY (\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Agent Comms host exited ${code}\n${logs}`));
    });
  });
  return {
    child,
    ready,
    logs: () => logs,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

async function comms(base, agent, method, path, body, idempotency) {
  const response = await originalFetch(`${base}${path}`, {
    method,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${secrets[agent]}`,
      ...(body ? { "Content-Type": "application/json", "Idempotency-Key": idempotency } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  if (!response.ok) fail(`${method} ${path} returned ${response.status} ${json.code ?? ""} ${json.error ?? ""}`);
  return json;
}

const startedAt = new Date().toISOString();
const sourceHash = createHash("sha256")
  .update(await readFile(join(ccRoot, "server/agent-comms.ts")))
  .digest("hex");
let host = null;
let db = null;
try {
  if ((process.env.TIP_ENV ?? "development") !== "development")
    fail("Refusing heartbeat proof outside development");
  await prepareDatabase();
  host = startServer();
  let base = await host.ready;
  const dir = await mkdtemp(join(tmpdir(), "tip-comms-heartbeat-"));
  db = new PGlite(dir);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  for (const file of [
    "012_tip_runtime_002.sql",
    "013_tip_runtime_artifacts.sql",
    "014_tip_runtime_deliveries.sql",
    "015_tip_independent_verifications.sql",
  ]) await db.exec(await readFile(new URL("../database/" + file, import.meta.url), "utf8"));
  const catalog = await loadRuntimeCatalog("repository-inspection");
  const reader = createGitHubMetadataReader();
  const open = () => new MissionRuntime(
    createPostgresMissionRepository(query, [mapping]),
    catalog,
    undefined,
    createPostgresRuntimeArtifacts(query),
  );
  const transport = createCommandCenterLoopbackTransport(base, secrets.TIP, originalFetch);
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
  if (first.mission_status !== "COMPLETED" || !first.deliveries.every((row) => row.status === "DELIVERED"))
    fail(`Heartbeat did not complete delivery: ${first.mission_status}`);
  const published = await comms(base, "GROKBOT_COS", "GET", `/api/agent-comms/v1/projects/${projectId}`);
  const mission = await open().get(missionId);
  const identity = `${mission.mission.project_id}:${mission.mission.mission_id}:${mission.delegation.delegation_id}`;
  const committed = recoverLatestCommittedPacket(published, identity);
  const ack = await comms(
    base,
    "GROKBOT_COS",
    "POST",
    `/api/agent-comms/v1/messages/${committed.commit_message_id}/acknowledge`,
    {
      project_id: projectId,
      env: "development",
      checkpoint_version: published.project.checkpoint_version,
      message_id: committed.commit_message_id,
    },
    "ack-heartbeat-commit-20261025",
  );
  if (ack.delivery?.acknowledged !== true || ack.delivery?.sender !== "TIP" || ack.delivery?.recipient !== "GROKBOT_COS")
    fail("Commit acknowledgment was not attributed to the recipient");
  await host.stop();
  host = startServer();
  base = await host.ready;
  const task = await comms(base, "SUPERGROK", "GET", `/api/agent-comms/v1/tasks/${committed.task_id}`);
  const reread = await comms(base, "SUPERGROK", "GET", `/api/agent-comms/v1/projects/${projectId}`);
  const delivery = await comms(base, "SUPERGROK", "GET", `/api/agent-comms/v1/messages/${committed.commit_message_id}/delivery`);
  if (reread.storage !== "neon-postgres" || task.storage !== "neon-postgres")
    fail("Reread did not come from the durable Agent Comms store");
  if (task.task?.id !== committed.task_id || task.task?.created_by !== "TIP" || task.task?.env !== "development" || task.task?.requires_dot !== true)
    fail("Task reread is not the attributed development TIP record");
  const recovered = recoverLatestCommittedPacket(reread, identity);
  const reportEvidence = recovered.packet.evidence.find((item) => item.kind === "repository-report");
  if (recovered.sha256 !== committed.sha256 || reportEvidence?.sha256 !== first.evidence_sha256)
    fail("Reread packet or evidence hash does not match TIP");
  if (delivery.delivery?.acknowledged !== true || delivery.delivery?.acknowledgment?.actor !== "GROKBOT_COS")
    fail("Durable delivery state lost the recipient acknowledgment");
  const verification = await comms(
    base,
    "SUPERGROK",
    "POST",
    "/api/agent-comms/v1/verifications",
    {
      id: "VER-HEARTBEAT-20261025",
      project_id: projectId,
      env: "development",
      checkpoint_version: reread.project.checkpoint_version,
      subject_type: "task",
      subject_id: committed.task_id,
      level: "OBSERVED",
      summary: `Fresh post-completion reread. packet_sha256=${recovered.sha256}; evidence_sha256=${reportEvidence.sha256}. Not Dot approval and not finding resolution.`,
      requires_dot: true,
      authority_type: "DOT_APPROVAL",
    },
    "verify-heartbeat-20261025",
  );
  if (verification.verification?.actor !== "SUPERGROK" || verification.verification?.level !== "OBSERVED")
    fail("Agent Comms verification was not an independent observation");
  const tipRecord = await recordIndependentVerification({
    runtime: open(),
    artifacts: createPostgresRuntimeArtifacts(query),
    deliveries: createPostgresRuntimeDeliveries(query),
    verifications: createPostgresIndependentVerifications(query),
    observer,
    missionId,
    observedPacketSha256: recovered.sha256,
    observedEvidenceSha256: reportEvidence.sha256,
    delivery: delivery.delivery,
    ledgerVerifier: "SUPERGROK",
    ledgerVerificationId: verification.verification.id,
    now: new Date().toISOString(),
  });
  if (tipRecord.result !== "MATCH") fail("TIP independent verification did not match");
  await host.stop();
  host = startServer();
  base = await host.ready;
  const verifiedAgain = await comms(base, "SUPERGROK", "GET", `/api/agent-comms/v1/verifications?project=${projectId}&env=development`);
  const ledgerVerification = (verifiedAgain.verifications ?? []).find((row) => row.id === "VER-HEARTBEAT-20261025");
  if (!ledgerVerification || ledgerVerification.actor !== "SUPERGROK" || ledgerVerification.subject_id !== committed.task_id)
    fail("Agent Comms verification did not survive restart");
  await db.close();
  db = new PGlite(dir);
  const reopened = await createPostgresIndependentVerifications(query).get(missionId);
  const runtime = open();
  const check = await recheckGovernedHeartbeat({
    runtime,
    artifacts: createPostgresRuntimeArtifacts(query),
    deliveries: createPostgresRuntimeDeliveries(query),
    ledger: reread,
    missionId,
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
  const reads = calls.length;
  const second = await runGovernedHeartbeat({
    env: "development",
    runtime,
    artifacts: createPostgresRuntimeArtifacts(query),
    deliveries: createPostgresRuntimeDeliveries(query),
    transport: createCommandCenterLoopbackTransport(base, secrets.TIP, originalFetch),
    mappings: [mapping],
    mission: controlledHeartbeatMission(missionId),
    operator,
    read: reader,
    reviewNote,
  });
  if (second.executed || second.revision !== first.revision || calls.length !== reads)
    fail("Duplicate heartbeat execution or publication was observed");
  const lifecycle = missionVerificationLifecycle(missionId, "COMPLETED", reopened);
  if (lifecycle.independent_verification !== "RECORDED" || lifecycle.dispatch_enabled !== false || lifecycle.finding_resolution !== "NOT_RECORDED" || lifecycle.dot_approval !== "NOT_RECORDED")
    fail("Verification lifecycle left its closed bounds");
  const report = await createPostgresRuntimeArtifacts(query).get(check.evidence_sha256);
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
    worker: check.assigned_agent_id,
    revision: check.revision,
    evidence_sha256: check.evidence_sha256,
    packet_sha256: check.packet_sha256,
    reread_packet_sha256: recovered.sha256,
    packet_hash_match: recovered.sha256 === check.packet_sha256,
    evidence_hash_match: reportEvidence.sha256 === check.evidence_sha256,
    ledger_task_id: task.task.id,
    task_created_by: task.task.created_by,
    task_env: task.task.env,
    task_requires_dot: task.task.requires_dot,
    commit_message_id: committed.commit_message_id,
    acknowledgment_actor: delivery.delivery.acknowledgment.actor,
    delivery_acknowledged: delivery.delivery.acknowledged,
    delivery_sender: delivery.delivery.sender,
    ledger_storage: reread.storage,
    ledger_verification_id: ledgerVerification.id,
    ledger_verifier: ledgerVerification.actor,
    ledger_verification_level: ledgerVerification.level,
    tip_verification_id: reopened.verification_id,
    tip_verification_result: reopened.result,
    lifecycle,
    packet_independent_verification: check.packet_independent_verification,
    command_center_ref: ccRef,
    command_center_dispatcher_sha256: sourceHash,
    restarted_before_reread: true,
    restarted_before_verification_reread: true,
    tip_database_reopened: true,
    duplicate_execution: false,
    github_gets: calls,
    candidate_host_contacted: false,
    pie_dispatch_enabled: false,
    dot_approval: "NOT_RECORDED",
    finding_resolution: "NOT_RECORDED",
    wake_scheduler_enabled: false,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await mkdir(new URL("../docs/evidence/", import.meta.url), { recursive: true });
  await writeFile("/opt/cursor/artifacts/agent-comms-heartbeat-proof.json", JSON.stringify(proof, null, 2));
  await writeFile(new URL("../docs/evidence/agent-comms-heartbeat-20261025.json", import.meta.url), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({
    status: proof.status,
    packet_sha256: proof.packet_sha256,
    evidence_sha256: proof.evidence_sha256,
    task_id: proof.ledger_task_id,
    verification: proof.tip_verification_result,
    lifecycle: proof.lifecycle.independent_verification,
  }));
} finally {
  if (host) await host.stop();
  if (db) await db.close();
}
