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
  canonicalJson,
  validateRuntimeContract,
} from "../packages/core/src/runtimeContracts.ts";
import {
  createMissionRuntimeApi,
  loadRuntimeCatalog,
} from "../apps/api/src/missionRuntimeApi.ts";
import { createApiPersistenceRuntime } from "../apps/api/src/persistence.ts";
import { readTipServerConfig } from "../packages/core/src/serverRuntime.ts";

const operator = { actor: "DOT", role: "operator" };
const agent = (id) => ({
  agent_id: id,
  name: id,
  version: "1.0",
  owner: "ORG-TRUAXIOM",
  role: "research",
  description: "Test-only worker",
  objectives: ["Research"],
  scope: ["PRJ-TIP"],
  exclusions: [],
  lifecycle_state: "active",
  capabilities: ["research.web"],
  tools: [],
  data_sources: [],
  memory_policy: { allowed_scopes: ["run"], retention: "mission" },
  permissions: { read: ["web"], write: [], actions: [] },
  approval_policy: { default_tier: "execute", approval_required_for: [] },
  triggers: [],
  workflows: [],
  output_contracts: ["report"],
  escalation_policy: "operator",
  observability_policy: ["events"],
  dependency_versions: {},
  tags: ["test-only"],
});
const capability = () => ({
  capability_id: "research.web",
  name: "Research",
  version: "1.0",
  description: "Test only",
  inputs: ["brief"],
  outputs: ["report"],
  required_permissions: ["read:web"],
  risk_tier: "low",
  tags: [],
});
const mission = (id = "M1") => ({
  schema_version: "1.0",
  mission_id: id,
  project_id: "PRJ-TIP",
  title: "Test mission",
  capability_id: "research.web",
  required_permissions: [],
  risk_tier: "low",
  constraints: [],
  evidence_required: [],
});
function setup(
  agents = [agent("A"), agent("B")],
  cap = capability(),
  repository = createInMemoryMissionRepository(),
) {
  const catalog = { agents, capabilities: [cap] };
  return {
    catalog,
    runtime: new MissionRuntime(repository, catalog),
    repository,
  };
}
async function command(
  rt,
  id,
  type,
  fields = {},
  principal = operator,
  commandId,
) {
  const r = await rt.get(id);
  return rt.command(
    id,
    {
      command_id: commandId ?? `C${r.revision}`,
      expected_revision: r.revision,
      type,
      ...fields,
    },
    principal,
  );
}
async function running(rt, id = "M1") {
  await rt.create(mission(id), operator);
  return command(rt, id, "transition", {
    state: "RUNNING",
    reason: "Start reported work",
  });
}
async function evidence(rt, id = "M1") {
  return command(rt, id, "evidence", {
    artifact_id: "E1",
    kind: "report",
    uri: "https://example.test/report",
    sha256: "a".repeat(64),
    summary: "Reported artifact",
  });
}
const rejects = (fn, status) => assert.rejects(fn, (e) => e.status === status);

test("valid manifest routing resolves authoritative permissions and deterministic agent", async () => {
  const { runtime } = setup();
  const r = await runtime.create(mission(), operator);
  assert.equal(r.delegation.status, "ASSIGNED");
  assert.equal(r.delegation.assigned_agent_id, "A");
  assert.deepEqual(r.delegation.required_permissions, ["read:web"]);
  validateRuntimeContract("delegation-envelope", r.delegation, "v2");
});
test("inactive agent rejection", async () => {
  const a = agent("A");
  a.lifecycle_state = "paused";
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "UNROUTABLE",
  );
});
test("capability declaration cannot replace missing permissions", async () => {
  const a = agent("A");
  a.permissions.read = [];
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "UNROUTABLE",
  );
});
test("permission namespace cannot grant write from a read declaration", async () => {
  const c = capability();
  c.required_permissions = ["write:web"];
  assert.equal(
    (await setup(undefined, c).runtime.create(mission(), operator)).delegation
      .status,
    "UNROUTABLE",
  );
});
test("caller cannot downgrade capability risk", async () => {
  const c = capability();
  c.risk_tier = "high";
  assert.equal(
    (await setup(undefined, c).runtime.create(mission(), operator)).delegation
      .status,
    "NEEDS_APPROVAL",
  );
});
test("high risk execution requires persisted operator approval", async () => {
  const c = capability();
  c.risk_tier = "critical";
  const { runtime } = setup(undefined, c);
  await runtime.create(mission(), operator);
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "RUNNING",
        reason: "bypass",
      }),
    409,
  );
  await command(runtime, "M1", "approve", { note: "Scoped approval" });
  assert.equal(
    (
      await command(runtime, "M1", "transition", {
        state: "RUNNING",
        reason: "Start",
      })
    ).delegation.status,
    "RUNNING",
  );
});
test("agent cannot approve own mission", async () => {
  const c = capability();
  c.risk_tier = "high";
  const { runtime } = setup(undefined, c);
  await runtime.create(mission(), operator);
  await rejects(
    () =>
      command(
        runtime,
        "M1",
        "approve",
        { note: "Self approval" },
        { actor: "A", role: "agent" },
      ),
    403,
  );
});
test("non-executing autonomy cannot be elevated by approval", async () => {
  for (const tier of ["observe", "recommend", "draft"]) {
    const a = agent("A");
    a.approval_policy.default_tier = tier;
    const { runtime } = setup([a]);
    await runtime.create(mission(), operator);
    await command(runtime, "M1", "approve", { note: "Review" });
    await rejects(
      () =>
        command(runtime, "M1", "transition", {
          state: "RUNNING",
          reason: "Attempt",
        }),
      403,
    );
  }
});
test("unknown capability is explicitly UNROUTABLE", async () => {
  const { runtime } = setup();
  assert.equal(
    (
      await runtime.create(
        { ...mission(), capability_id: "undeclared" },
        operator,
      )
    ).delegation.status,
    "UNROUTABLE",
  );
});
test("agent ordering is deterministic independent of registry order", async () => {
  const a = agent("A"),
    b = agent("B");
  const first = await setup([a, b]).runtime.create(mission(), operator);
  const second = await setup([b, a]).runtime.create(mission(), operator);
  assert.equal(
    first.delegation.assigned_agent_id,
    second.delegation.assigned_agent_id,
  );
});
test("scope and exclusions deny undeclared authority", async () => {
  const a = agent("A");
  a.scope = ["PRJ-ROOTWORK"];
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "UNROUTABLE",
  );
  a.scope = ["PRJ-TIP"];
  a.exclusions = ["research.web"];
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "UNROUTABLE",
  );
});
test("privileged capabilities always gate even mislabelled low risk", async () => {
  for (const name of [
    "production.promote",
    "billing.change",
    "credential.write",
    "data.delete",
    "security.policy",
    "dns.change",
  ]) {
    const a = agent("A"),
      c = capability();
    a.capabilities = [name];
    c.capability_id = name;
    const r = await setup([a], c).runtime.create(
      { ...mission(), capability_id: name },
      operator,
    );
    assert.equal(r.delegation.status, "NEEDS_APPROVAL");
  }
});
test("all declared writes/actions gate equivalent privileged operations", async () => {
  const a = agent("A"),
    c = capability();
  a.permissions.actions = ["opaque.operation"];
  c.required_permissions = ["actions:opaque.operation"];
  assert.equal(
    (await setup([a], c).runtime.create(mission(), operator)).delegation.status,
    "NEEDS_APPROVAL",
  );
});
test("authority revoked after approval cannot run", async () => {
  const { runtime, catalog } = setup();
  await runtime.create(mission(), operator);
  catalog.agents[0].lifecycle_state = "paused";
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "RUNNING",
        reason: "Attempt",
      }),
    403,
  );
});
test("manifest approval policy is evaluated", async () => {
  const a = agent("A");
  a.approval_policy.approval_required_for = ["research.web"];
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "NEEDS_APPROVAL",
  );
});
test("invalid transitions and missing evidence cannot complete", async () => {
  const { runtime } = setup();
  await runtime.create(mission(), operator);
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "REVIEW",
        reason: "Skip",
        result: "Done",
      }),
    409,
  );
  await command(runtime, "M1", "transition", {
    state: "RUNNING",
    reason: "Start",
  });
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "REVIEW",
        reason: "Done",
        result: "Done",
      }),
    409,
  );
});
test("evidence + explicit review produce completed state and audit history", async () => {
  const { runtime } = setup();
  await running(runtime);
  await evidence(runtime);
  await command(runtime, "M1", "transition", {
    state: "REVIEW",
    reason: "Ready",
    result: "Report delivered",
  });
  await rejects(
    () =>
      command(
        runtime,
        "M1",
        "review",
        { accepted: true, note: "Done" },
        { actor: "A", role: "agent" },
      ),
    403,
  );
  const r = await command(runtime, "M1", "review", {
    accepted: true,
    note: "Dot reviewed",
  });
  assert.equal(r.delegation.status, "COMPLETED");
  assert.equal(r.evidence.length, 1);
  assert.equal(r.events.length, 5);
  validateRuntimeContract("handoff-packet", runtime.packet(r));
  await rejects(
    () =>
      command(runtime, "M1", "failure", {
        failure_id: "F1",
        code: "late",
        message: "Late",
        retryable: false,
      }),
    409,
  );
});
test("rejected review blocks and clears proposed result", async () => {
  const { runtime } = setup();
  await running(runtime);
  await evidence(runtime);
  await command(runtime, "M1", "transition", {
    state: "REVIEW",
    reason: "Ready",
    result: "Report",
  });
  const r = await command(runtime, "M1", "review", {
    accepted: false,
    note: "Needs correction",
  });
  assert.equal(r.delegation.status, "BLOCKED");
  assert.equal(r.completionResult, null);
});
test("failure persists honest failed state and explicit blockers", async () => {
  const { runtime, repository } = setup();
  await running(runtime);
  await command(runtime, "M1", "failure", {
    failure_id: "F1",
    code: "TIMEOUT",
    message: "Provider timeout",
    retryable: true,
  });
  const r = await repository.get("M1");
  assert.equal(r.delegation.status, "FAILED");
  assert.equal(r.failures[0].retryable, true);
  assert.deepEqual(runtime.packet(r).blockers, ["Provider timeout"]);
});
test("handoff creation and acceptance reroute through governance", async () => {
  const a = agent("A"),
    b = agent("B");
  b.approval_policy.default_tier = "execute_with_approval";
  const { runtime } = setup([a, b]);
  await running(runtime);
  await command(runtime, "M1", "handoff", {
    handoff_id: "H1",
    to_agent_id: "B",
    reason: "Specialist needed",
  });
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "RUNNING",
        reason: "Bypass handoff",
      }),
    409,
  );
  const r = await command(runtime, "M1", "accept_handoff", {
    handoff_id: "H1",
  });
  assert.equal(r.delegation.assigned_agent_id, "B");
  assert.equal(r.delegation.status, "NEEDS_APPROVAL");
  assert.equal(r.handoffs[0].status, "ACCEPTED");
  await command(runtime, "M1", "approve", { note: "B authorized" });
  await command(runtime, "M1", "transition", {
    state: "RUNNING",
    reason: "B starts",
  });
  await rejects(() => evidenceAsWrongAgent(runtime), 403);
});
function evidenceAsWrongAgent(rt) {
  return command(
    rt,
    "M1",
    "evidence",
    {
      artifact_id: "E2",
      kind: "report",
      uri: "https://example.test/x",
      sha256: "a".repeat(64),
      summary: "x",
    },
    { actor: "A", role: "agent" },
  );
}
test("handoff rejects inactive or revoked targets", async () => {
  const { runtime, catalog } = setup();
  await running(runtime);
  catalog.agents[1].lifecycle_state = "paused";
  await rejects(
    () =>
      command(runtime, "M1", "handoff", {
        handoff_id: "H1",
        to_agent_id: "B",
        reason: "Change",
      }),
    403,
  );
  catalog.agents[1].lifecycle_state = "active";
  await command(runtime, "M1", "handoff", {
    handoff_id: "H1",
    to_agent_id: "B",
    reason: "Change",
  });
  catalog.agents[1].permissions.read = [];
  await rejects(
    () => command(runtime, "M1", "accept_handoff", { handoff_id: "H1" }),
    403,
  );
});
test("creation and commands are idempotent; conflicting reuse is denied", async () => {
  const { runtime } = setup();
  const r = await runtime.create(mission(), operator);
  assert.deepEqual(await runtime.create(mission(), operator), r);
  await rejects(
    () => runtime.create({ ...mission(), title: "different" }, operator),
    409,
  );
  const cmd = {
    type: "transition",
    state: "RUNNING",
    reason: "Start",
    command_id: "RETRY",
    expected_revision: 1,
  };
  const first = await runtime.command("M1", cmd, operator);
  assert.deepEqual(await runtime.command("M1", cmd, operator), first);
  await rejects(
    () => runtime.command("M1", { ...cmd, reason: "different" }, operator),
    409,
  );
  assert.equal((await runtime.get("M1")).events.length, 2);
});
test("concurrent updates lose no audit events and stale revision is rejected", async () => {
  const { runtime } = setup();
  await running(runtime);
  const cmd = {
    type: "transition",
    state: "BLOCKED",
    reason: "Wait",
    command_id: "X",
    expected_revision: 2,
  };
  const results = await Promise.allSettled([
    runtime.command("M1", cmd, operator),
    runtime.command("M1", { ...cmd, command_id: "Y" }, operator),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await runtime.get("M1")).events.length, 3);
});
test("machine validation rejects undeclared fields, malformed evidence and identities", async () => {
  const { runtime } = setup();
  await rejects(
    () => runtime.create({ ...mission(), approval: true }, operator),
    400,
  );
  await rejects(
    () => runtime.create({ ...mission(), project_id: "unknown" }, operator),
    400,
  );
  await running(runtime);
  await rejects(
    () =>
      command(runtime, "M1", "evidence", {
        artifact_id: "E1",
        kind: "report",
        uri: "not-a-uri",
        sha256: "bad",
        summary: "bad",
      }),
    400,
  );
  const a = agent("A");
  a.approval_policy.allow_everything = true;
  assert.throws(() => setup([a]));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});
test("runtime HTTP auth is fail closed for reads and all privileged writes", async () => {
  const { runtime } = setup();
  const api = createMissionRuntimeApi(runtime, {
    secret: "test-only-secret",
    actor: "DOT",
    required: false,
  });
  assert.equal(
    (
      await api({
        method: "POST",
        path: "/v1/runtime/missions",
        body: mission(),
      })
    ).status,
    401,
  );
  assert.equal(
    (await api({ method: "GET", path: "/v1/runtime/missions" })).status,
    401,
  );
  const headers = { authorization: "Bearer test-only-secret" };
  assert.equal(
    (
      await api({
        method: "POST",
        path: "/v1/runtime/missions",
        headers,
        body: mission(),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api({
        method: "POST",
        path: "/v1/runtime/missions/M1/commands",
        headers,
        body: {
          command_id: "C1",
          expected_revision: 1,
          type: "transition",
          state: "RUNNING",
          reason: "Start",
          actor: "A",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api({
        method: "GET",
        path: "/v1/runtime/missions/M1/bridge",
        headers,
      })
    ).status,
    200,
  );
});
test("API catalog loads no synthetic active agents", async () => {
  const catalog = await loadRuntimeCatalog();
  assert.deepEqual(catalog, { agents: [], capabilities: [] });
});
test("durable provider with no URL never falls back for Runtime 002", async () => {
  const persistence = createApiPersistenceRuntime(
    readTipServerConfig({ TIP_PERSISTENCE_PROVIDER: "neon", TIP_ENV: "test" }),
  );
  await assert.rejects(
    () => persistence.missionRepository.list(),
    /not configured/,
  );
  await persistence.dispose();
});
test("Postgres migration, atomic persistence, conflict checks and real restart recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tip-runtime-002-"));
  let db = new PGlite(dir);
  const sql = await readFile(
    new URL("../database/012_tip_runtime_002.sql", import.meta.url),
    "utf8",
  );
  try {
    await assert.rejects(() => db.query("select * from tip_runtime_missions"));
    await db.exec(sql);
    await db.exec(sql); // additive / repeatable
    let query = async (sql, params = []) => (await db.query(sql, params)).rows;
    let repo = createPostgresMissionRepository(query),
      rt = setup(undefined, capability(), repo).runtime;
    await running(rt);
    await evidence(rt);
    const before = await rt.get("M1");
    assert.equal(await repo.save({ ...before, revision: 3 }, 1), false);
    await db.close();
    db = new PGlite(dir);
    query = async (sql, params = []) => (await db.query(sql, params)).rows;
    repo = createPostgresMissionRepository(query);
    rt = setup(undefined, capability(), repo).runtime;
    assert.deepEqual(await rt.get("M1"), before);
    assert.equal((await repo.list()).length, 1);
    await command(rt, "M1", "handoff", {
      handoff_id: "H1",
      to_agent_id: "B",
      reason: "Continue",
    });
    await command(rt, "M1", "accept_handoff", { handoff_id: "H1" });
    await command(rt, "M1", "transition", {
      state: "RUNNING",
      reason: "Continue",
    });
    await command(rt, "M1", "failure", {
      failure_id: "F1",
      code: "TIMEOUT",
      message: "Timed out",
      retryable: true,
    });
    await db.close();
    db = new PGlite(dir);
    repo = createPostgresMissionRepository(
      async (sql, params = []) => (await db.query(sql, params)).rows,
    );
    const after = await repo.get("M1");
    assert.equal(after.failures.length, 1);
    assert.equal(after.handoffs[0].status, "ACCEPTED");
    assert.equal(after.evidence.length, 1);
    assert.equal(after.delegation.status, "FAILED");
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("schema compilation validates every reconciled lifecycle contract", async () => {
  const { runtime } = setup();
  const r = await runtime.create(mission(), operator);
  for (const name of [
    "artifact",
    "state-event",
    "permission-request",
    "failure-event",
    "handoff-request",
    "handoff-packet",
    "delegation-envelope",
  ])
    assert.throws(() =>
      validateRuntimeContract(
        name,
        {},
        name === "delegation-envelope" ? "v2" : "v1",
      ),
    );
  assert.equal(r.delegation.schema_version, "2.0");
});

test("approval rejection cancels without execution and persists decision", async () => {
  const c = capability();
  c.risk_tier = "high";
  const { runtime } = setup(undefined, c);
  await runtime.create(mission(), operator);
  const r = await command(runtime, "M1", "reject", { note: "Owner rejected" });
  assert.equal(r.delegation.status, "CANCELLED");
  assert.equal(r.permissionRequests[0].status, "REJECTED");
  await rejects(
    () =>
      command(runtime, "M1", "transition", {
        state: "RUNNING",
        reason: "Bypass",
      }),
    409,
  );
});

test("duplicate evidence ids cannot silently replace artifact references", async () => {
  const { runtime } = setup();
  await running(runtime);
  await evidence(runtime);
  await rejects(
    () =>
      command(runtime, "M1", "evidence", {
        artifact_id: "E1",
        kind: "report",
        uri: "https://example.test/other",
        sha256: "b".repeat(64),
        summary: "Replacement",
      }),
    409,
  );
  assert.equal((await runtime.get("M1")).evidence[0].sha256, "a".repeat(64));
});

test("storage outages return 503 without leaking query errors or credentials", async () => {
  const repository = {
    source: "postgres",
    async get() {
      throw new Error("postgres://sensitive-secret");
    },
    async list() {
      throw new Error("postgres://sensitive-secret");
    },
    async save() {
      throw new Error("postgres://sensitive-secret");
    },
  };
  const runtime = setup(undefined, capability(), repository).runtime;
  const api = createMissionRuntimeApi(runtime, {
    secret: "test-only-secret",
    actor: "DOT",
    required: true,
  });
  const result = await api({
    method: "GET",
    path: "/v1/runtime/missions",
    headers: { authorization: "Bearer test-only-secret" },
  });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result).includes("sensitive-secret"));
});

test("ambiguous approval policies are denied rather than silently ignored", async () => {
  const a = agent("A");
  a.approval_policy.approval_required_for = ["*"];
  assert.throws(() => setup([a]), /Ambiguous approval-policy/);
});

test("declared capability must also satisfy required output contracts", async () => {
  const a = agent("A");
  a.output_contracts = ["unrelated"];
  assert.equal(
    (await setup([a]).runtime.create(mission(), operator)).delegation.status,
    "UNROUTABLE",
  );
});
