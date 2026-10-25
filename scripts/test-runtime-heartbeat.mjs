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
  CONTROLLED_HEARTBEAT_REF,
  assertIsolatedDevelopmentHeartbeat,
  controlledHeartbeatMission,
  recheckGovernedHeartbeat,
  runGovernedHeartbeat,
} from "../packages/core/src/runtimeHeartbeatLoop.ts";
import { RuntimeError } from "../packages/core/src/runtimeContracts.ts";
import { loadRuntimeCatalog, createMissionRuntimeApi } from "../apps/api/src/missionRuntimeApi.ts";

const operator = { actor: "OPERATOR-DEV-HEARTBEAT", role: "operator" };
const worker = { actor: CONTROLLED_HEARTBEAT_AGENT, role: "agent" };
const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: "CC-TIP-DEV-HEARTBEAT",
  environment: "development",
};
const reviewNote =
  "Operator accepted the isolated heartbeat report. This is not Dot approval.";

function fixtureReader() {
  let calls = 0;
  return {
    calls: () => calls,
    read: async (path) => {
      calls += 1;
      if (path.includes("/git/trees/"))
        return { tree: [{ type: "blob", path: "README.md" }], truncated: false };
      if (path.includes("/check-runs"))
        return { total_count: 0, check_runs: [] };
      return {
        sha: CONTROLLED_HEARTBEAT_REF,
        commit: { message: "Pinned public metadata" },
      };
    },
  };
}

function ledger(unauthorized = false) {
  const view = {
    project: { id: mapping.command_center_project_id, checkpoint_version: 0 },
    tasks: [],
    evidence: [],
    messages: [],
  };
  const paths = [];
  let calls = 0;
  return {
    view,
    paths,
    calls: () => calls,
    project: async () => structuredClone(view),
    write: async (path, body) => {
      calls += 1;
      paths.push(path);
      if (unauthorized) throw new RuntimeError(401, "unauthorized");
      assert.equal(body.env, "development");
      assert.equal(body.requires_dot, true);
      assert.equal(body.authority_type, "DOT_APPROVAL");
      assert.equal(body.checkpoint_version, view.project.checkpoint_version);
      view[path.slice(1)].push(structuredClone(body));
      view.project.checkpoint_version += 1;
    },
  };
}

async function setup(reader = fixtureReader()) {
  const deliveries = createMemoryRuntimeDeliveries();
  const artifacts = createMemoryRuntimeArtifacts();
  let now = Date.parse("2026-10-25T12:00:00Z");
  const clock = () => new Date(now).toISOString();
  const runtime = new MissionRuntime(
    createInMemoryMissionRepository(deliveries, [mapping]),
    await loadRuntimeCatalog("repository-inspection"),
    clock,
    artifacts,
  );
  const transport = ledger();
  return { runtime, artifacts, deliveries, transport, reader, clock };
}

function run(ctx, missionId, extra = {}) {
  return runGovernedHeartbeat({
    env: "development",
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    transport: ctx.transport,
    mappings: [mapping],
    mission: controlledHeartbeatMission(missionId),
    operator,
    read: ctx.reader.read,
    now: ctx.clock,
    reviewNote,
    ...extra,
  });
}

test("valid dispatch resolves the inspector, executes once, and delivers the terminal packet", async () => {
  const ctx = await setup();
  const result = await run(ctx, "M-VALID");
  assert.equal(result.executed, true);
  assert.equal(result.mission_status, "COMPLETED");
  assert.equal(result.assigned_agent_id, CONTROLLED_HEARTBEAT_AGENT);
  assert.equal(result.capability_id, "repository.inspect");
  assert.match(result.policy_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.required_permissions, [
    "read:github:rc610music:truaxiom-TIP",
  ]);
  assert.ok(result.deliveries.every((row) => row.status === "DELIVERED"));
  assert.equal(ctx.reader.calls() > 0, true);
  const check = await recheckGovernedHeartbeat({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    ledger: ctx.transport.view,
    missionId: "M-VALID",
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
  assert.equal(check.result, "PASSED");
  assert.equal(check.evidence_sha256, result.evidence_sha256);
  assert.deepEqual(check.write_permissions, []);
  assert.deepEqual(check.delivery_environments, ["development"]);
  for (const message of ctx.transport.view.messages) delete message.authority_type;
  const durable = await recheckGovernedHeartbeat({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    ledger: ctx.transport.view,
    missionId: "M-VALID",
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
  assert.equal(durable.result, "PASSED");
  ctx.transport.view.messages[0].authority_type = "OTHER";
  await assert.rejects(
    () =>
      recheckGovernedHeartbeat({
        runtime: ctx.runtime,
        artifacts: ctx.artifacts,
        deliveries: ctx.deliveries,
        ledger: ctx.transport.view,
        missionId: "M-VALID",
        expect: "COMPLETED",
        operatorActor: operator.actor,
      }),
    (error) => error instanceof RuntimeError && error.status === 409,
  );
});

test("unauthorized dispatch is rejected before worker execution", async () => {
  const ctx = await setup();
  await assert.rejects(
    () =>
      runGovernedHeartbeat({
        env: "development",
        runtime: ctx.runtime,
        artifacts: ctx.artifacts,
        deliveries: ctx.deliveries,
        transport: ctx.transport,
        mappings: [mapping],
        mission: controlledHeartbeatMission("M-AGENT"),
        operator: worker,
        read: ctx.reader.read,
        now: ctx.clock,
      }),
    (error) => error.status === 403,
  );
  assert.equal(await ctx.runtime.repository.get("M-AGENT"), null);
  await assert.rejects(
    () =>
      run(ctx, "M-OTHER", {
        mission: {
          ...controlledHeartbeatMission("M-OTHER"),
          inputs: { repository: "other/repo", ref: "main" },
        },
      }),
    (error) => error.status === 400,
  );
  assert.equal(await ctx.runtime.repository.get("M-OTHER"), null);
  const denied = await run(ctx, "M-WRITE", {
    mission: {
      ...controlledHeartbeatMission("M-WRITE"),
      required_permissions: ["write:github:rc610music:truaxiom-TIP"],
    },
    reviewNote: undefined,
  });
  assert.equal(denied.executed, false);
  assert.equal(denied.mission_status, "UNROUTABLE");
  assert.equal(denied.assigned_agent_id, null);
  assert.equal(ctx.reader.calls(), 0);
  assert.equal(ctx.transport.calls() > 0, true);
  assert.ok(denied.deliveries.every((row) => row.status === "DELIVERED"));
  const stored = await ctx.runtime.get("M-WRITE");
  assert.equal(stored.evidence.length, 0);
  assert.equal(stored.delegation.status, "UNROUTABLE");
});

test("idempotent duplicate delivery does not execute or publish again", async () => {
  const ctx = await setup();
  const first = await run(ctx, "M-ONCE");
  const writes = ctx.transport.calls();
  const messages = ctx.transport.view.messages.length;
  const reads = ctx.reader.calls();
  const second = await run(ctx, "M-ONCE");
  assert.equal(second.executed, false);
  assert.equal(second.revision, first.revision);
  assert.equal(second.evidence_sha256, first.evidence_sha256);
  assert.equal(ctx.transport.calls(), writes);
  assert.equal(ctx.transport.view.messages.length, messages);
  assert.equal(ctx.reader.calls(), reads);
  assert.equal((await ctx.deliveries.list()).length, first.deliveries.length);
});

test("worker failure persists a retryable failure without a second execution", async () => {
  const ctx = await setup();
  let calls = 0;
  ctx.reader.read = async () => {
    calls += 1;
    throw new Error("controlled inspection outage");
  };
  const failed = await run(ctx, "M-FAIL");
  assert.equal(failed.executed, true);
  assert.equal(failed.mission_status, "FAILED");
  assert.equal(failed.evidence_sha256, null);
  assert.equal(calls, 1);
  const repeated = await run(ctx, "M-FAIL");
  assert.equal(repeated.executed, false);
  assert.equal(repeated.revision, failed.revision);
  assert.equal(calls, 1);
  const check = await recheckGovernedHeartbeat({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    ledger: ctx.transport.view,
    missionId: "M-FAIL",
    expect: "FAILED",
    operatorActor: operator.actor,
  });
  assert.equal(check.result, "PASSED");
  assert.equal(check.mission_status, "FAILED");
  const fresh = new MissionRuntime(
    ctx.runtime.repository,
    await loadRuntimeCatalog("repository-inspection"),
    ctx.clock,
    ctx.artifacts,
  );
  assert.equal((await fresh.get("M-FAIL")).delegation.status, "FAILED");
  assert.equal((await fresh.get("M-FAIL")).completionResult, null);
});

test("evidence and completion stay attached for a fresh runtime read", async () => {
  const ctx = await setup();
  const result = await run(ctx, "M-EVIDENCE");
  const stored = await ctx.artifacts.get(result.evidence_sha256);
  assert.equal(stored.content.commit_sha, CONTROLLED_HEARTBEAT_REF);
  assert.deepEqual(stored.content.paths, ["README.md"]);
  const fresh = new MissionRuntime(
    ctx.runtime.repository,
    await loadRuntimeCatalog("repository-inspection"),
    ctx.clock,
    ctx.artifacts,
  );
  const record = await fresh.get("M-EVIDENCE");
  assert.equal(record.delegation.status, "COMPLETED");
  assert.equal(record.evidence[0].verification_level, "HASH_VERIFIED");
  assert.equal(record.evidence[0].attached_by, CONTROLLED_HEARTBEAT_AGENT);
  assert.equal(
    record.events.find((event) => event.to_state === "COMPLETED")?.actor,
    operator.actor,
  );
  assert.match(record.completionResult, /rc610music\/truaxiom-TIP/);
  await recheckGovernedHeartbeat({
    runtime: fresh,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    ledger: ctx.transport.view,
    missionId: "M-EVIDENCE",
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
});

test("restart reopens the mission, report, and delivered rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tip-heartbeat-"));
  let db = new PGlite(dir);
  const reader = fixtureReader();
  const transport = ledger();
  const clock = () => "2026-10-25T12:00:00.000Z";
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  try {
    for (const file of [
      "012_tip_runtime_002.sql",
      "013_tip_runtime_artifacts.sql",
      "014_tip_runtime_deliveries.sql",
    ])
      await db.exec(
        await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
      );
    const catalog = await loadRuntimeCatalog("repository-inspection");
    const open = () =>
      new MissionRuntime(
        createPostgresMissionRepository(query, [mapping]),
        catalog,
        clock,
        createPostgresRuntimeArtifacts(query),
      );
    const first = await runGovernedHeartbeat({
      env: "development",
      runtime: open(),
      artifacts: createPostgresRuntimeArtifacts(query),
      deliveries: createPostgresRuntimeDeliveries(query),
      transport,
      mappings: [mapping],
      mission: controlledHeartbeatMission("M-RESTART"),
      operator,
      read: reader.read,
      now: clock,
      reviewNote,
    });
    assert.equal(first.mission_status, "COMPLETED");
    await db.close();
    db = new PGlite(dir);
    const runtime = open();
    const artifacts = createPostgresRuntimeArtifacts(query);
    const deliveries = createPostgresRuntimeDeliveries(query);
    const check = await recheckGovernedHeartbeat({
      runtime,
      artifacts,
      deliveries,
      ledger: transport.view,
      missionId: "M-RESTART",
      expect: "COMPLETED",
      operatorActor: operator.actor,
    });
    assert.equal(check.evidence_sha256, first.evidence_sha256);
    const writes = transport.calls();
    const reads = reader.calls();
    assert.equal(reads > 0, true);
    const second = await runGovernedHeartbeat({
      env: "development",
      runtime,
      artifacts,
      deliveries,
      transport,
      mappings: [mapping],
      mission: controlledHeartbeatMission("M-RESTART"),
      operator,
      read: reader.read,
      now: clock,
      reviewNote,
    });
    assert.equal(second.executed, false);
    assert.equal(second.revision, first.revision);
    assert.equal(transport.calls(), writes);
    assert.equal(reader.calls(), reads);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("least-privilege boundary blocks worker completion, preview delivery, and anonymous retry", async () => {
  const ctx = await setup();
  const pending = await run(ctx, "M-REVIEW", { reviewNote: undefined });
  assert.equal(pending.mission_status, "REVIEW");
  assert.equal(pending.executed, true);
  const current = await ctx.runtime.get("M-REVIEW");
  await assert.rejects(
    () =>
      ctx.runtime.command(
        "M-REVIEW",
        {
          command_id: "WORKER-REVIEW",
          expected_revision: current.revision,
          type: "review",
          accepted: true,
          note: "worker self-approval",
        },
        worker,
      ),
    (error) => error.status === 403,
  );
  assert.equal((await ctx.runtime.get("M-REVIEW")).delegation.status, "REVIEW");
  assert.throws(
    () =>
      assertIsolatedDevelopmentHeartbeat(
        "development",
        [{ ...mapping, environment: "preview" }],
        controlledHeartbeatMission("M-PREVIEW"),
      ),
    (error) => error.status === 403,
  );
  assert.throws(
    () =>
      assertIsolatedDevelopmentHeartbeat(
        "production",
        [mapping],
        controlledHeartbeatMission("M-PROD"),
      ),
    (error) => error.status === 403,
  );
  const api = createMissionRuntimeApi(
    ctx.runtime,
    { secret: "test-only", actor: operator.actor },
    ctx.artifacts,
    ctx.deliveries,
  );
  assert.equal(
    (
      await api({
        method: "POST",
        path: `/v1/runtime/deliveries/${"ab".repeat(32)}/retry`,
        body: {},
      })
    ).status,
    401,
  );
});

test("no production mutation: fixture execution never uses the network and delivery stays development-scoped", async () => {
  const previous = globalThis.fetch;
  let network = 0;
  globalThis.fetch = async () => {
    network += 1;
    throw new Error("network disabled");
  };
  try {
    const ctx = await setup();
    const result = await run(ctx, "M-LOCAL");
    assert.equal(network, 0);
    assert.equal(result.mission_status, "COMPLETED");
    assert.deepEqual(
      [...new Set(ctx.transport.paths)].sort(),
      ["/evidence", "/messages", "/tasks"],
    );
    assert.equal(
      ctx.transport.view.tasks.every((task) => task.env === "development"),
      true,
    );
    assert.equal(
      ctx.transport.view.evidence.every(
        (item) => item.verification_level === "CLAIMED",
      ),
      true,
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("delivery authentication failure pauses once and resumes only after operator retry", async () => {
  const ctx = await setup();
  const blocked = ledger(true);
  const paused = await run(ctx, "M-PAUSE", { transport: blocked });
  assert.equal(paused.mission_status, "COMPLETED");
  assert.equal(paused.deliveries.filter((row) => row.status === "PAUSED").length, 1);
  assert.equal(
    paused.deliveries.filter((row) => row.status === "PENDING").length,
    paused.deliveries.length - 1,
  );
  assert.equal(blocked.view.tasks.length, 0);
  const calls = blocked.calls();
  const again = await run(ctx, "M-PAUSE", { transport: blocked });
  assert.equal(again.executed, false);
  assert.equal(blocked.calls(), calls);
  const retry = ctx.transport;
  const pausedRow = (await ctx.deliveries.list()).find(
    (row) => row.status === "PAUSED",
  );
  assert.equal(
    await ctx.deliveries.retry(pausedRow.delivery_id, ctx.clock(), operator.actor),
    true,
  );
  const resumed = await run(ctx, "M-PAUSE", { transport: retry });
  assert.equal(resumed.executed, false);
  assert.ok(resumed.deliveries.every((row) => row.status === "DELIVERED"));
  await recheckGovernedHeartbeat({
    runtime: ctx.runtime,
    artifacts: ctx.artifacts,
    deliveries: ctx.deliveries,
    ledger: retry.view,
    missionId: "M-PAUSE",
    expect: "COMPLETED",
    operatorActor: operator.actor,
  });
});
