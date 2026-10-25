import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { MissionRuntime } from "../packages/core/src/missionRuntime.ts";
import {
  createInMemoryMissionRepository,
  createPostgresMissionRepository,
} from "../packages/core/src/missionRepository.ts";
import {
  createMemoryRuntimeArtifacts,
  createPostgresRuntimeArtifacts,
} from "../packages/core/src/runtimeArtifactRepository.ts";
import {
  createMemoryRuntimeDeliveries,
  createPostgresRuntimeDeliveries,
} from "../packages/core/src/runtimeDeliveryRepository.ts";
import {
  CONTROLLED_HEARTBEAT_AGENT,
  controlledHeartbeatMission,
  runGovernedHeartbeat,
} from "../packages/core/src/runtimeHeartbeatLoop.ts";
import { recoverLatestCommittedPacket, createCommandCenterLoopbackTransport } from "../packages/core/src/commandCenterRuntimeBridge.ts";
import {
  createMemoryIndependentVerifications,
  createPostgresIndependentVerifications,
  missionVerificationLifecycle,
  recordIndependentVerification,
} from "../packages/core/src/independentVerification.ts";
import { canonicalJson } from "../packages/core/src/runtimeContracts.ts";
import { loadRuntimeCatalog } from "../apps/api/src/missionRuntimeApi.ts";

const operator = { actor: "OPERATOR-DEV-HEARTBEAT", role: "operator" };
const observer = { actor: "PIE-OBSERVER", role: "pie-observer" };
const reviewNote = "Operator accepted the isolated heartbeat report. This is not Dot approval.";
const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: "CC-TIP-DEV-HEARTBEAT",
  environment: "development",
  comms_recipient: "GROKBOT_COS",
};

function fixtureReader() {
  return {
    async read(path) {
      if (path.includes("/git/trees/"))
        return { tree: [{ type: "blob", path: "README.md" }], truncated: false };
      if (path.includes("/check-runs")) return { total_count: 0, check_runs: [] };
      return { sha: "e896e080de021435cd4122662a66f40c0eb650c9", commit: { message: "Pinned public metadata" } };
    },
  };
}

function ledger() {
  const view = {
    project: { id: mapping.command_center_project_id, checkpoint_version: 0 },
    tasks: [],
    evidence: [],
    messages: [],
  };
  return {
    view,
    project: async () => structuredClone(view),
    write: async (path, body) => {
      assert.equal(body.env, "development");
      if (path === "/messages") {
        assert.equal(body.recipient, "GROKBOT_COS");
        assert.match(body.correlation_id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/);
      }
      view[path.slice(1)].push(structuredClone(body));
      view.project.checkpoint_version += 1;
    },
  };
}

async function completed(missionId = "M-VERIFY") {
  const deliveries = createMemoryRuntimeDeliveries();
  const artifacts = createMemoryRuntimeArtifacts();
  const verifications = createMemoryIndependentVerifications();
  const catalog = await loadRuntimeCatalog("repository-inspection");
  const runtime = new MissionRuntime(
    createInMemoryMissionRepository(deliveries, [mapping]),
    catalog,
    () => "2026-10-25T12:00:00.000Z",
    artifacts,
  );
  const transport = ledger();
  await runGovernedHeartbeat({
    env: "development",
    runtime,
    artifacts,
    deliveries,
    transport,
    mappings: [mapping],
    mission: controlledHeartbeatMission(missionId),
    operator,
    read: fixtureReader().read,
    reviewNote,
  });
  return { runtime, artifacts, deliveries, verifications, transport };
}

function deliveryOf(taskId) {
  return {
    acknowledged: true,
    sender: "TIP",
    recipient: "GROKBOT_COS",
    task_id: taskId,
    acknowledgment: { actor: "GROKBOT_COS" },
  };
}

test("loopback transport refuses the candidate host and non-numeric loopback names", () => {
  assert.throws(
    () => createCommandCenterLoopbackTransport("https://truaxiom-command-center-candidate.onrender.com", "x".repeat(16)),
    (error) => error.status === 403,
  );
  assert.throws(
    () => createCommandCenterLoopbackTransport("http://localhost:9", "x".repeat(16)),
    (error) => error.status === 403,
  );
  const transport = createCommandCenterLoopbackTransport("http://127.0.0.1:9/", "x".repeat(16));
  assert.equal(typeof transport.project, "function");
});

test("addressed publication can be reread and recorded without mutating completion", async () => {
  const ctx = await completed();
  const mission = await ctx.runtime.get("M-VERIFY");
  const identity = `${mission.mission.project_id}:${mission.mission.mission_id}:${mission.delegation.delegation_id}`;
  const recovered = recoverLatestCommittedPacket(ctx.transport.view, identity);
  assert.equal(recovered.packet.operations.independent_verification, "NOT_RECORDED");
  assert.equal(recovered.sha256.length, 64);
  const evidence = recovered.packet.evidence.find((item) => item.kind === "repository-report");
  const revision = mission.revision;
  const recorded = await recordIndependentVerification({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    verifications: ctx.verifications,
    observer,
    missionId: "M-VERIFY",
    observedPacketSha256: recovered.sha256,
    observedEvidenceSha256: evidence.sha256,
    delivery: deliveryOf(recovered.task_id),
    ledgerVerifier: "SUPERGROK",
    ledgerVerificationId: "VER-HEARTBEAT-1",
    now: "2026-10-25T18:00:00.000Z",
  });
  assert.equal(recorded.result, "MATCH");
  assert.equal(recorded.dispatch_enabled, false);
  assert.equal(recorded.dot_approval, "NOT_RECORDED");
  assert.equal(recorded.finding_resolution, "NOT_RECORDED");
  assert.equal(recorded.finding_id, null);
  assert.equal(recorded.executing_agent_id, CONTROLLED_HEARTBEAT_AGENT);
  assert.equal(recorded.completion_actor, operator.actor);
  assert.notEqual(recorded.observer_actor, recorded.executing_agent_id);
  const after = await ctx.runtime.get("M-VERIFY");
  assert.equal(after.revision, revision);
  assert.equal(after.delegation.status, "COMPLETED");
  assert.equal(ctx.runtime.packet(after).operations.independent_verification, "NOT_RECORDED");
  assert.deepEqual(missionVerificationLifecycle("M-VERIFY", after.delegation.status, recorded), {
    mission_id: "M-VERIFY",
    execution_status: "COMPLETED",
    independent_verification: "RECORDED",
    result: "MATCH",
    dot_approval: "NOT_RECORDED",
    finding_resolution: "NOT_RECORDED",
    dispatch_enabled: false,
  });
  const replay = await recordIndependentVerification({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    verifications: ctx.verifications,
    observer,
    missionId: "M-VERIFY",
    observedPacketSha256: recovered.sha256,
    observedEvidenceSha256: evidence.sha256,
    delivery: deliveryOf(recovered.task_id),
    ledgerVerifier: "SUPERGROK",
    ledgerVerificationId: "VER-HEARTBEAT-1",
    now: "2026-10-25T19:00:00.000Z",
  });
  assert.equal(replay.verification_id, recorded.verification_id);
  assert.equal(replay.observed_at, recorded.observed_at);
});

test("the executing agent, completing operator, and unfinished mission cannot record verification", async () => {
  const ctx = await completed("M-GUARD");
  const mission = await ctx.runtime.get("M-GUARD");
  const identity = `${mission.mission.project_id}:${mission.mission.mission_id}:${mission.delegation.delegation_id}`;
  const recovered = recoverLatestCommittedPacket(ctx.transport.view, identity);
  const evidence = recovered.packet.evidence.find((item) => item.kind === "repository-report");
  const base = {
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    verifications: ctx.verifications,
    missionId: "M-GUARD",
    observedPacketSha256: recovered.sha256,
    observedEvidenceSha256: evidence.sha256,
    delivery: deliveryOf(recovered.task_id),
    ledgerVerifier: null,
    ledgerVerificationId: null,
  };
  await assert.rejects(
    () => recordIndependentVerification({ ...base, observer: { actor: CONTROLLED_HEARTBEAT_AGENT, role: "pie-observer" } }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    () => recordIndependentVerification({ ...base, observer: { actor: operator.actor, role: "pie-observer" } }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    () => recordIndependentVerification({ ...base, observer: { actor: "PIE-OBSERVER", role: "operator" } }),
    (error) => error.status === 403,
  );
  const pending = await runGovernedHeartbeat({
    env: "development",
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    transport: ctx.transport,
    mappings: [mapping],
    mission: controlledHeartbeatMission("M-OPEN"),
    operator,
    read: fixtureReader().read,
  });
  assert.equal(pending.mission_status, "REVIEW");
  await assert.rejects(
    () => recordIndependentVerification({ ...base, observer, missionId: "M-OPEN" }),
    (error) => error.status === 409,
  );
  assert.equal(await ctx.verifications.get("M-GUARD"), null);
  assert.equal(await ctx.verifications.get("M-OPEN"), null);
});

test("a hash mismatch is recorded without changing the completed claim", async () => {
  const ctx = await completed("M-MISMATCH");
  const mission = await ctx.runtime.get("M-MISMATCH");
  const identity = `${mission.mission.project_id}:${mission.mission.mission_id}:${mission.delegation.delegation_id}`;
  const recovered = recoverLatestCommittedPacket(ctx.transport.view, identity);
  const recorded = await recordIndependentVerification({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    verifications: ctx.verifications,
    observer,
    missionId: "M-MISMATCH",
    observedPacketSha256: "a".repeat(64),
    observedEvidenceSha256: recovered.packet.evidence[0].sha256,
    delivery: deliveryOf(recovered.task_id),
    ledgerVerifier: null,
    ledgerVerificationId: null,
  });
  assert.equal(recorded.result, "MISMATCH");
  assert.equal((await ctx.runtime.get("M-MISMATCH")).revision, mission.revision);
  assert.equal(canonicalJson(ctx.runtime.packet(await ctx.runtime.get("M-MISMATCH")).operations).includes("NOT_RECORDED"), true);
  await assert.rejects(
    () => recordIndependentVerification({
      runtime: ctx.runtime,
      artifacts: ctx.artifacts,
      deliveries: ctx.deliveries,
      verifications: ctx.verifications,
      observer,
      missionId: "M-MISMATCH",
      observedPacketSha256: recovered.sha256,
      observedEvidenceSha256: recovered.packet.evidence[0].sha256,
      delivery: deliveryOf(recovered.task_id),
      ledgerVerifier: null,
      ledgerVerificationId: null,
    }),
    (error) => error.status === 409,
  );
});

test("verification survives a database reopen and stays off the mission revision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tip-verification-"));
  let db = new PGlite(dir);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  try {
    for (const file of [
      "012_tip_runtime_002.sql",
      "013_tip_runtime_artifacts.sql",
      "014_tip_runtime_deliveries.sql",
      "015_tip_independent_verifications.sql",
    ]) await db.exec(await readFile(new URL("../database/" + file, import.meta.url), "utf8"));
    const catalog = await loadRuntimeCatalog("repository-inspection");
    const transport = ledger();
    const open = () => new MissionRuntime(
      createPostgresMissionRepository(query, [mapping]),
      catalog,
      () => "2026-10-25T12:00:00.000Z",
      createPostgresRuntimeArtifacts(query),
    );
    await runGovernedHeartbeat({
      env: "development",
      runtime: open(),
      artifacts: createPostgresRuntimeArtifacts(query),
      deliveries: createPostgresRuntimeDeliveries(query),
      transport,
      mappings: [mapping],
      mission: controlledHeartbeatMission("M-DISK"),
      operator,
      read: fixtureReader().read,
      reviewNote,
    });
    const runtime = open();
    const mission = await runtime.get("M-DISK");
    const identity = `${mission.mission.project_id}:${mission.mission.mission_id}:${mission.delegation.delegation_id}`;
    const recovered = recoverLatestCommittedPacket(transport.view, identity);
    const evidence = recovered.packet.evidence.find((item) => item.kind === "repository-report");
    await recordIndependentVerification({
      runtime,
      artifacts: createPostgresRuntimeArtifacts(query),
      deliveries: createPostgresRuntimeDeliveries(query),
      verifications: createPostgresIndependentVerifications(query),
      observer,
      missionId: "M-DISK",
      observedPacketSha256: recovered.sha256,
      observedEvidenceSha256: evidence.sha256,
      delivery: deliveryOf(recovered.task_id),
      ledgerVerifier: "SUPERGROK",
      ledgerVerificationId: "VER-DISK-1",
      now: "2026-10-25T18:00:00.000Z",
    });
    await db.close();
    db = new PGlite(dir);
    const reopened = createPostgresIndependentVerifications(query);
    const stored = await reopened.get("M-DISK");
    assert.equal(stored.result, "MATCH");
    assert.equal(stored.ledger_verification_id, "VER-DISK-1");
    const again = open();
    assert.equal((await again.get("M-DISK")).revision, mission.revision);
    assert.equal(again.packet(await again.get("M-DISK")).operations.independent_verification, "NOT_RECORDED");
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
