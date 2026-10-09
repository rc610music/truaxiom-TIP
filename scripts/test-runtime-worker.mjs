import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
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
  runRepositoryInspection,
  createGitHubMetadataReader,
} from "../packages/core/src/repositoryInspector.ts";
import { loadRuntimeCatalog } from "../apps/api/src/missionRuntimeApi.ts";
import {
  createRuntimeWorkerApi,
  readWorkerCredentials,
} from "../apps/api/src/runtimeWorkerApi.ts";
import { createMissionRuntimeApi } from "../apps/api/src/missionRuntimeApi.ts";
const operator = { actor: "OPERATOR-TEST", role: "operator" },
  worker = { actor: "AGENT-REPOSITORY-INSPECTOR", role: "agent" };
const mission = (id) => ({
  schema_version: "1.0",
  mission_id: id,
  project_id: "PRJ-TIP",
  title: "Test inspection",
  capability_id: "repository.inspect",
  required_permissions: [],
  risk_tier: "low",
  constraints: [],
  evidence_required: [],
  inputs: { repository: "rc610music/truaxiom-TIP", ref: "main" },
});
async function setup(
  repository = createInMemoryMissionRepository(),
  artifacts = createMemoryRuntimeArtifacts(),
) {
  let now = Date.parse("2026-10-09T00:00:00Z");
  const catalog = await loadRuntimeCatalog("repository-inspection");
  const runtime = new MissionRuntime(
    repository,
    catalog,
    () => new Date(now).toISOString(),
    artifacts,
  );
  return {
    runtime,
    repository,
    artifacts,
    catalog,
    tick: (s) => {
      now += s * 1000;
    },
  };
}
async function cmd(rt, id, type, fields = {}, who = worker) {
  const r = await rt.get(id);
  return rt.command(
    id,
    {
      command_id: `C:${r.revision}`,
      expected_revision: r.revision,
      type,
      ...fields,
    },
    who,
  );
}
const rejects = (fn, status) => assert.rejects(fn, (e) => e.status === status);
const read = async (path) =>
  path.includes("/commits/") && !path.includes("check-runs")
    ? { sha: "a".repeat(40), commit: { message: "Fixture commit" } }
    : path.includes("/git/trees/")
      ? { tree: [{ type: "blob", path: "README.md" }], truncated: false }
      : {
          total_count: 1,
          check_runs: [
            { name: "Fixture CI", status: "completed", conclusion: "success" },
          ],
        };

test("operator reads only attached stored reports; malformed or foreign evidence is denied", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await runRepositoryInspection(runtime, artifacts, "M1", read);
  const api = createMissionRuntimeApi(
    runtime,
    { secret: "test-only", actor: operator.actor },
    artifacts,
  );
  const path = `/v1/runtime/missions/M1/artifacts/${r.evidence[0].sha256}`;
  assert.equal((await api({ method: "GET", path })).status, 401);
  const headers = { authorization: "Bearer test-only" };
  const response = await api({ method: "GET", path, headers });
  assert.equal(response.status, 200);
  assert.equal(response.body.artifact.content.commit_sha, "a".repeat(40));
  assert.equal(
    (
      await api({
        method: "GET",
        path: "/v1/runtime/missions/M1/artifacts/" + "b".repeat(64),
        headers,
      })
    ).status,
    404,
  );
  await assert.rejects(
    () =>
      artifacts.put({
        schema_version: "1.0",
        mission_id: "M1",
        kind: "repository-report",
        content: [],
        authority: "invented",
      }),
    (e) => e.status === 400,
  );
});
test("malformed provider metadata cannot become a successful empty report", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  await assert.rejects(() =>
    runRepositoryInspection(runtime, artifacts, "M1", async (path) =>
      path.includes("/git/trees/") ? {} : read(path),
    ),
  );
  const record = await runtime.get("M1");
  assert.equal(record.delegation.status, "FAILED");
  assert.equal(record.evidence.length, 0);
});
test("every required leased output needs stored evidence, not only one verified kind", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(
    { ...mission("M1"), evidence_required: ["extra-output"] },
    operator,
  );
  await assert.rejects(() =>
    runRepositoryInspection(runtime, artifacts, "M1", read),
  );
  const r = await runtime.get("M1");
  assert.equal(r.delegation.status, "FAILED");
  assert.equal(r.evidence[0].verification_level, "HASH_VERIFIED");
  assert.ok(!r.evidence.some((e) => e.kind === "extra-output"));
});

test("real worker implementation produces stored hash-verified report and explicit review", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await runRepositoryInspection(runtime, artifacts, "M1", read);
  assert.equal(r.delegation.status, "REVIEW");
  assert.equal(r.evidence[0].verification_level, "HASH_VERIFIED");
  assert.equal(
    (await artifacts.get(r.evidence[0].sha256)).content.commit_sha,
    "a".repeat(40),
  );
  const before = r.revision;
  assert.equal(
    (await runRepositoryInspection(runtime, artifacts, "M1", read)).revision,
    before,
  );
  const completed = await cmd(
    runtime,
    "M1",
    "review",
    { accepted: true, note: "Operator inspected report" },
    operator,
  );
  assert.equal(completed.delegation.status, "COMPLETED");
});
test("concurrent workers cannot claim the same live mission lease", async () => {
  const { runtime } = await setup();
  await runtime.create(mission("M1"), operator);
  const c = {
    type: "claim",
    ttl_seconds: 30,
    command_id: "CLAIM",
    expected_revision: 1,
    attempt_id: "ATTEMPT-A",
  };
  const rs = await Promise.allSettled([
    runtime.command("M1", c, worker),
    runtime.command(
      "M1",
      { ...c, command_id: "OTHER", attempt_id: "ATTEMPT-B" },
      worker,
    ),
  ]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
});
test("expired worker is fenced after reclaim; epoch and token change", async () => {
  const { runtime, tick } = await setup();
  await runtime.create(mission("M1"), operator);
  const first = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  tick(31);
  const next = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "B",
  });
  assert.equal(next.lease.epoch, 2);
  assert.notEqual(next.lease.token, first.lease.token);
  await rejects(
    () =>
      cmd(runtime, "M1", "heartbeat", {
        ttl_seconds: 30,
        lease_token: first.lease.token,
      }),
    403,
  );
  assert.equal(
    (
      await cmd(runtime, "M1", "heartbeat", {
        ttl_seconds: 30,
        lease_token: next.lease.token,
      })
    ).lease.epoch,
    2,
  );
});
test("heartbeat cannot extend an expired lease without reclaim", async () => {
  const { runtime, tick } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  tick(30);
  await rejects(
    () =>
      cmd(runtime, "M1", "heartbeat", {
        ttl_seconds: 30,
        lease_token: r.lease.token,
      }),
    403,
  );
});
test("recipient accepts its own handoff and claims with new fenced authority", async () => {
  const { runtime, catalog } = await setup();
  catalog.agents.push({
    ...structuredClone(catalog.agents[0]),
    agent_id: "AGENT-RECIPIENT",
  });
  await runtime.create(mission("M1"), operator);
  const owner = {
    actor: (await runtime.get("M1")).delegation.assigned_agent_id,
    role: "agent",
  };
  const target =
    owner.actor === worker.actor ? "AGENT-RECIPIENT" : worker.actor;
  const r = await cmd(
    runtime,
    "M1",
    "claim",
    { ttl_seconds: 30, attempt_id: "A" },
    owner,
  );
  await cmd(
    runtime,
    "M1",
    "handoff",
    {
      handoff_id: "H1",
      to_agent_id: target,
      reason: "Transfer metadata work",
      lease_token: r.lease.token,
    },
    owner,
  );
  const recipient = { actor: target, role: "agent" };
  await cmd(runtime, "M1", "accept_handoff", { handoff_id: "H1" }, recipient);
  const next = await cmd(
    runtime,
    "M1",
    "claim",
    { ttl_seconds: 30, attempt_id: "B" },
    recipient,
  );
  assert.equal(next.lease.agent_id, target);
  assert.notEqual(next.lease.token, r.lease.token);
  await rejects(
    () =>
      cmd(
        runtime,
        "M1",
        "heartbeat",
        { ttl_seconds: 30, lease_token: r.lease.token },
        owner,
      ),
    403,
  );
});
test("operator cancellation fences a live worker and rejects late completion", async () => {
  const { runtime } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  await cmd(
    runtime,
    "M1",
    "transition",
    { state: "CANCELLED", reason: "Operator cancelled" },
    operator,
  );
  await rejects(
    () =>
      cmd(runtime, "M1", "transition", {
        state: "REVIEW",
        reason: "Late output",
        result: "late",
        lease_token: r.lease.token,
      }),
    409,
  );
  assert.equal((await runtime.get("M1")).delegation.status, "CANCELLED");
});
test("agent cannot bypass claim or operator approval", async () => {
  const { runtime } = await setup();
  await runtime.create(mission("M1"), operator);
  await rejects(
    () =>
      cmd(runtime, "M1", "transition", { state: "RUNNING", reason: "Bypass" }),
    403,
  );
  await rejects(
    () => cmd(runtime, "M1", "approve", { note: "Self approve" }),
    403,
  );
});
test("high-risk worker cannot claim without scoped operator approval", async () => {
  const { runtime } = await setup();
  await runtime.create({ ...mission("M1"), risk_tier: "high" }, operator);
  await rejects(
    () => cmd(runtime, "M1", "claim", { ttl_seconds: 30, attempt_id: "A" }),
    409,
  );
  await cmd(
    runtime,
    "M1",
    "approve",
    { note: "Explicitly approved" },
    operator,
  );
  assert.equal(
    (await cmd(runtime, "M1", "claim", { ttl_seconds: 30, attempt_id: "A" }))
      .delegation.status,
    "RUNNING",
  );
});
test("authority revocation fences heartbeat and output mutations", async () => {
  const { runtime, catalog } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  catalog.agents[0].lifecycle_state = "paused";
  await rejects(
    () =>
      cmd(runtime, "M1", "heartbeat", {
        ttl_seconds: 30,
        lease_token: r.lease.token,
      }),
    403,
  );
});
test("stored evidence rejects forged hashes and foreign mission content", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  const sha = await artifacts.put({
    schema_version: "1.0",
    mission_id: "OTHER",
    kind: "repository-report",
    content: { fake: true },
  });
  await rejects(
    () =>
      cmd(runtime, "M1", "evidence", {
        artifact_id: "E1",
        kind: "repository-report",
        uri: `urn:tip:artifact:${sha}`,
        sha256: sha,
        summary: "wrong",
        lease_token: r.lease.token,
      }),
    400,
  );
});
test("external claimed evidence cannot complete a leased worker mission", async () => {
  const { runtime } = await setup();
  await runtime.create(mission("M1"), operator);
  const r = await cmd(runtime, "M1", "claim", {
    ttl_seconds: 30,
    attempt_id: "A",
  });
  await cmd(runtime, "M1", "evidence", {
    artifact_id: "E1",
    kind: "repository-report",
    uri: "https://example.test/fake",
    sha256: "a".repeat(64),
    summary: "claim only",
    lease_token: r.lease.token,
  });
  await rejects(
    () =>
      cmd(runtime, "M1", "transition", {
        state: "REVIEW",
        reason: "done",
        result: "done",
        lease_token: r.lease.token,
      }),
    409,
  );
});
test("provider failure records a real failure without false completion", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  await assert.rejects(() =>
    runRepositoryInspection(runtime, artifacts, "M1", async () => {
      throw new Error("credential-detail");
    }),
  );
  const r = await runtime.get("M1");
  assert.equal(r.delegation.status, "FAILED");
  assert.equal(r.evidence.length, 0);
  assert.ok(!JSON.stringify(r).includes("credential-detail"));
});
test("duplicate runner does not fail a mission held by another worker", async () => {
  const { runtime, artifacts } = await setup();
  await runtime.create(mission("M1"), operator);
  await cmd(runtime, "M1", "claim", { ttl_seconds: 30, attempt_id: "A" });
  await rejects(
    () => runRepositoryInspection(runtime, artifacts, "M1", read),
    409,
  );
  assert.equal((await runtime.get("M1")).failures.length, 0);
});
test("metadata reader rejects other repositories and paths before network access", async () => {
  const reader = createGitHubMetadataReader();
  await rejects(() => reader("/repos/other/private/commits/main"), 403);
  await rejects(() => reader("/repos/rc610music/truaxiom-TIP/../secrets"), 403);
});
test("worker authentication cannot create missions, review, impersonate or read other assignments", async () => {
  const { runtime, artifacts } = await setup();
  const key = "test-only-worker-key";
  const api = createRuntimeWorkerApi(runtime, artifacts, [
    {
      agent_id: worker.actor,
      key_sha256: createHash("sha256").update(key).digest("hex"),
    },
  ]);
  assert.equal(
    (await api({ method: "GET", path: "/v1/runtime/worker/missions" })).status,
    401,
  );
  await runtime.create(mission("M1"), operator);
  const headers = { authorization: `Bearer ${key}` };
  const claim = await api({
    method: "POST",
    path: "/v1/runtime/worker/missions/M1/commands",
    headers,
    body: {
      command_id: "K1",
      expected_revision: 1,
      type: "claim",
      ttl_seconds: 30,
      attempt_id: "A",
    },
  });
  assert.equal(claim.status, 200);
  const listed = await api({
    method: "GET",
    path: "/v1/runtime/worker/missions/M1",
    headers,
  });
  assert.equal(listed.body.lease.token, "REDACTED");
  assert.deepEqual(listed.body.receipts, {});
  assert.equal(
    (
      await api({
        method: "POST",
        path: "/v1/runtime/worker/missions/M1/commands",
        headers,
        body: {
          command_id: "K2",
          expected_revision: 2,
          type: "review",
          accepted: true,
          note: "Bypass",
        },
      })
    ).status,
    403,
  );
  const wrong = createRuntimeWorkerApi(runtime, artifacts, [
    {
      agent_id: "OTHER",
      key_sha256: createHash("sha256").update(key).digest("hex"),
    },
  ]);
  assert.equal(
    (
      await wrong({
        method: "GET",
        path: "/v1/runtime/worker/missions/M1",
        headers,
      })
    ).status,
    403,
  );
});
test("worker credential configuration denies ambiguous or duplicate identities", () => {
  assert.deepEqual(readWorkerCredentials(), []);
  assert.throws(() =>
    readWorkerCredentials('[{"agent_id":"A","key":"plaintext"}]'),
  );
  assert.throws(() =>
    readWorkerCredentials(
      JSON.stringify([
        { agent_id: "A", key_sha256: "a".repeat(64) },
        { agent_id: "B", key_sha256: "a".repeat(64) },
      ]),
    ),
  );
});
test("restart recovers lease, artifacts and execution without losing evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tip-worker-"));
  let db = new PGlite(dir);
  try {
    await db.exec(
      await readFile(
        new URL("../database/012_tip_runtime_002.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("../database/013_tip_runtime_artifacts.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = async (sql, params = []) =>
      (await db.query(sql, params)).rows;
    let { runtime, artifacts } = await setup(
      createPostgresMissionRepository(query),
      createPostgresRuntimeArtifacts(query),
    );
    await runtime.create(mission("M1"), operator);
    const report = await runRepositoryInspection(
      runtime,
      artifacts,
      "M1",
      read,
    );
    await db.close();
    db = new PGlite(dir);
    ({ runtime, artifacts } = await setup(
      createPostgresMissionRepository(query),
      createPostgresRuntimeArtifacts(query),
    ));
    assert.deepEqual(await runtime.get("M1"), report);
    assert.ok(await artifacts.get(report.evidence[0].sha256));
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
