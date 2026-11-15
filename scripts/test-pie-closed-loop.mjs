import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcile } from "./fixtures/upstream-pie-contract.ts";
import { dot, worker, manifest, at, setup } from "./fixtures/pie-recovery.mjs";
import { createMissionRuntimeApi } from "../apps/api/src/missionRuntimeApi.ts";
import { MissionRuntime } from "../packages/core/src/missionRuntime.ts";
import { createPostgresMissionRepository } from "../packages/core/src/missionRepository.ts";
import { createPostgresRuntimeArtifacts } from "../packages/core/src/runtimeArtifactRepository.ts";
import { createPostgresRuntimeDeliveries } from "../packages/core/src/runtimeDeliveryRepository.ts";
import { canonicalJson } from "../packages/core/src/runtimeContracts.ts";
import { proposePieRecovery } from "../packages/core/src/pieRuntimeBridge.ts";
import { deliverNextRuntimePacket } from "../packages/core/src/runtimeDeliveryWorker.ts";
import {
  runBoundHealthRecovery,
  recordPieHealthVerification,
  createPostgresPieFindingVerifications,
  pieRecoveryProjection,
} from "../packages/core/src/pieHealthRecovery.ts";

const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: "CC-PIE-LOCAL",
  environment: "development",
  comms_recipient: "GROKBOT_COS",
};
async function fixture(t, { repair = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tip-pie-loop-"));
  let db = new PGlite(dir);
  let min = 30;
  let healthy = false;
  let operations = 0;
  let probes = 0;
  const server = createServer((req, res) => {
    if (req.method !== "GET" || !["/health", "/build"].includes(req.url)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/build") {
      res.end(JSON.stringify({ projectId: "PRJ-TIP", commit: "a".repeat(40) }));
      return;
    }
    probes++;
    res.end(JSON.stringify({ ok: healthy, projectId: "PRJ-TIP" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  for (const f of [
    "012_tip_runtime_002.sql",
    "013_tip_runtime_artifacts.sql",
    "014_tip_runtime_deliveries.sql",
    "016_pie_finding_verifications.sql",
  ])
    await db.exec(
      await readFile(new URL("../database/" + f, import.meta.url), "utf8"),
    );
  const { input, catalog } = setup();
  const binding = input.binding;
  const now = () => at(min);
  const query = async (sql, params) => (await db.query(sql, params)).rows;
  let runtime, artifacts, deliveries, outcomes;
  function connect() {
    artifacts = createPostgresRuntimeArtifacts(query);
    deliveries = createPostgresRuntimeDeliveries(query);
    runtime = new MissionRuntime(
      createPostgresMissionRepository(query, [mapping]),
      catalog,
      now,
      artifacts,
    );
    outcomes = createPostgresPieFindingVerifications(query);
  }
  connect();
  // In-process ledger adapter exercises the real durable delivery worker and
  // packet validator. It is not the live Agent Comms HTTP service.
  const view = {
    project: { id: mapping.command_center_project_id, checkpoint_version: 0 },
    tasks: [],
    evidence: [],
    messages: [],
  };
  const transport = {
    project: async () => structuredClone(view),
    write: async (path, body) => {
      const rows = view[path.slice(1)];
      const existing = rows.find((r) => r.id === body.id);
      if (existing) Object.assign(existing, structuredClone(body));
      else rows.push(structuredClone(body));
      view.project.checkpoint_version++;
    },
  };
  let intel = null;
  async function observe() {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/health`,
      { redirect: "error" },
    );
    const health = await response.json();
    const build = await (
      await fetch(`http://127.0.0.1:${server.address().port}/build`, {
        redirect: "error",
      })
    ).json();
    const evidence = [
      ["health", "health.fixture.ok", "/health", health.ok],
      ["health", "health.fixture.identity", "/health", health.projectId],
      ["deployment", "deployment.fixture.sha", "/build", build.commit],
    ].map(([kind, key, path, value]) => ({
      kind,
      key,
      source: "https://fixture.example.com" + path,
      status: "verified",
      observedAt: now(),
      value,
    }));
    intel = reconcile(
      manifest,
      evidence,
      intel,
      now(),
      "PRJ-TIP/development/fixture",
    );
    return { manifest, intelligence: structuredClone(intel) };
  }
  let row;
  for (min of [0, 10, 20, 30]) row = await observe();
  min = 30;
  const mission = await proposePieRecovery({
    runtime,
    row,
    binding,
    now: now(),
  });
  const id = mission.mission.mission_id;
  const operation = {
    binding,
    execute: async ({ idempotencyKey, expectedBuild }) => {
      assert.equal(idempotencyKey, id);
      assert.equal(expectedBuild, "a".repeat(40));
      operations++;
      if (repair) healthy = true;
    },
  };
  async function cmd(type, extra = {}, principal = dot) {
    const r = await runtime.get(id);
    return runtime.command(
      id,
      {
        type,
        ...extra,
        command_id: `TEST:${r.revision}:${type}`,
        expected_revision: r.revision,
      },
      principal,
    );
  }
  async function execute() {
    return runBoundHealthRecovery({
      runtime,
      artifacts,
      missionId: id,
      row,
      binding,
      operation,
      worker,
      now,
    });
  }
  async function finish() {
    min = 31;
    await cmd("approve", {
      note: "Simulated DOT approval in disposable test only",
    });
    await execute();
    min = 32;
    await cmd("review", { accepted: true, note: "Technical review only" });
  }
  async function publish() {
    for (let i = 0; i < 20; i++) {
      const r = await deliverNextRuntimePacket(deliveries, transport, now);
      if (r.status === "IDLE") return;
      assert.equal(r.status, "DELIVERED");
    }
    throw Error("delivery bound exceeded");
  }
  function verification(overrides = {}) {
    return recordPieHealthVerification({
      runtime,
      artifacts,
      deliveries,
      transport,
      outcomes,
      missionId: id,
      binding,
      row,
      observer: { actor: "PIE-OBSERVER", role: "pie-observer" },
      observe,
      now,
      ...overrides,
    });
  }
  return {
    id,
    mission,
    row,
    binding,
    operation,
    now,
    cmd,
    execute,
    finish,
    publish,
    verification,
    view,
    observe,
    get runtime() {
      return runtime;
    },
    get artifacts() {
      return artifacts;
    },
    get outcomes() {
      return outcomes;
    },
    setMinute(v) {
      min = v;
    },
    counts: () => ({ operations, probes }),
    async restart() {
      await db.close();
      db = new PGlite(dir);
      connect();
    },
    async removeArtifact() {
      await query("delete from tip_runtime_artifacts where mission_id=$1", [
        id,
      ]);
    },
  };
}

test("approved disposable recovery is independently observed and survives restart without changing executor packet", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.execute());
  assert.equal(f.counts().operations, 0);
  await f.finish();
  await f.publish();
  const completed = await f.runtime.get(f.id);
  const packet = canonicalJson(f.runtime.packet(completed));
  assert.equal(
    pieRecoveryProjection(completed, null).finding_state,
    "AWAITING_VERIFICATION",
  );
  f.setMinute(33);
  const before = f.counts().probes;
  const result = await f.verification();
  assert.equal(f.counts().probes, before + 1);
  assert.equal(result.finding_state, "VERIFIED_RESOLVED");
  const observed = await f.artifacts.get(result.observation_sha256);
  assert.equal(observed.kind, "pie-health-observation");
  assert.equal(
    observed.content.project.intelligence.facts["health.fixture.ok"].value,
    true,
  );
  const unchanged = f.counts().probes;
  assert.deepEqual(await f.verification(), result);
  assert.equal(f.counts().probes, unchanged);
  assert.equal(
    pieRecoveryProjection(completed, {
      ...result,
      packet_sha256: "a".repeat(64),
    }).finding_state,
    "AWAITING_VERIFICATION",
  );
  assert.equal(
    canonicalJson(f.runtime.packet(await f.runtime.get(f.id))),
    packet,
  );
  await f.restart();
  assert.equal((await f.outcomes.get(f.id)).finding_state, "VERIFIED_RESOLVED");
  assert.equal(
    pieRecoveryProjection(await f.runtime.get(f.id), await f.outcomes.get(f.id))
      .finding_state,
    "VERIFIED_RESOLVED",
  );
  const api = createMissionRuntimeApi(
    f.runtime,
    { actor: "REVIEWER", secret: "local-test-secret" },
    f.artifacts,
    undefined,
    f.outcomes,
  );
  const path = `/v1/runtime/missions/${f.id}/pie`;
  assert.equal((await api({ method: "GET", path })).status, 401);
  const response = await api({
    method: "GET",
    path,
    headers: { "x-tip-operator-secret": "local-test-secret" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.finding_state, "VERIFIED_RESOLVED");
  assert.equal(
    response.body.observation.content.project.intelligence.facts[
      "health.fixture.ok"
    ].value,
    true,
  );
  assert.equal(
    (
      await api({
        method: "POST",
        path,
        headers: { "x-tip-operator-secret": "local-test-secret" },
        body: { finding_state: "VERIFIED_RESOLVED" },
      })
    ).status,
    404,
  );
  const operations = f.counts().operations;
  await f.execute();
  assert.equal(f.counts().operations, operations);
  if (process.env.TIP_PIE_PROOF_OUTPUT)
    await writeFile(
      process.env.TIP_PIE_PROOF_OUTPUT,
      JSON.stringify(
        {
          scope:
            "Disposable local integration; accelerated clock, simulated DOT approval, in-process ledger transport",
          recorded_at: new Date().toISOString(),
          simulated_dot_approval: true,
          wall_clock_soak: false,
          result,
          executor_packet: JSON.parse(packet),
          execution_artifact: await f.artifacts.get(result.evidence_sha256),
          observation_artifact: observed,
          counts: f.counts(),
          executor_packet_unchanged: true,
          database_restarted: true,
          live_deployment: false,
        },
        null,
        2,
      ) + "\n",
    );
});

test("COMPLETE with unhealthy target becomes STILL_FAILING", async (t) => {
  const f = await fixture(t, { repair: false });
  await f.finish();
  await f.publish();
  f.setMinute(33);
  assert.equal((await f.verification()).finding_state, "STILL_FAILING");
});

test("rejection causes zero recovery operations", async (t) => {
  const f = await fixture(t);
  await f.cmd("reject", { note: "Denied fixture" });
  await assert.rejects(f.execute());
  assert.equal(f.counts().operations, 0);
});

test("missing terminal publication prevents even starting a verification probe", async (t) => {
  const f = await fixture(t);
  await f.finish();
  f.setMinute(33);
  const before = f.counts().probes;
  await assert.rejects(f.verification());
  assert.equal(f.counts().probes, before);
  assert.equal(await f.outcomes.get(f.id), null);
});

test("missing persisted evidence prevents verification", async (t) => {
  const f = await fixture(t);
  await f.finish();
  await f.publish();
  await f.removeArtifact();
  f.setMinute(33);
  await assert.rejects(f.verification());
  assert.equal(await f.outcomes.get(f.id), null);
});

test("stale observation cannot resolve a completed mission", async (t) => {
  const f = await fixture(t);
  await f.finish();
  await f.publish();
  f.setMinute(33);
  await assert.rejects(f.verification({ observe: async () => f.row }));
  assert.equal(await f.outcomes.get(f.id), null);
});

test("executor cannot certify its own recovery", async (t) => {
  const f = await fixture(t);
  await f.finish();
  await f.publish();
  f.setMinute(33);
  await assert.rejects(
    f.verification({ observer: { actor: "FIXTURE", role: "pie-observer" } }),
  );
});

test("mismatched operation cannot mutate the target", async (t) => {
  const f = await fixture(t);
  await f.cmd("approve", { note: "Fixture approval" });
  await assert.rejects(
    runBoundHealthRecovery({
      runtime: f.runtime,
      artifacts: f.artifacts,
      missionId: f.id,
      row: f.row,
      binding: f.binding,
      operation: {
        ...f.operation,
        binding: { ...f.binding, endpoint: "https://wrong.example.com" },
      },
      worker,
      now: f.now,
    }),
  );
  assert.equal(f.counts().operations, 0);
});

test("lost Agent Comms packet parts cannot masquerade as terminal evidence", async (t) => {
  const f = await fixture(t);
  await f.finish();
  await f.publish();
  f.setMinute(33);
  f.view.messages = f.view.messages.filter(
    (m) => !m.body.startsWith("TIP_RUNTIME_PART "),
  );
  const before = f.counts().probes;
  await assert.rejects(f.verification());
  assert.equal(f.counts().probes, before);
});

test("operation failure leaves no independent resolution", async (t) => {
  const f = await fixture(t);
  await f.cmd("approve", { note: "Fixture approval" });
  await assert.rejects(
    runBoundHealthRecovery({
      runtime: f.runtime,
      artifacts: f.artifacts,
      missionId: f.id,
      row: f.row,
      binding: f.binding,
      operation: {
        binding: f.binding,
        execute: async () => {
          throw Error("fixture failure");
        },
      },
      worker,
      now: f.now,
    }),
  );
  assert.equal((await f.runtime.get(f.id)).delegation.status, "FAILED");
  assert.equal(await f.outcomes.get(f.id), null);
});

test("competing workers cannot execute the same approved recovery twice", async (t) => {
  const f = await fixture(t);
  await f.cmd("approve", { note: "Fixture approval" });
  const results = await Promise.allSettled([f.execute(), f.execute()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.counts().operations, 1);
});
