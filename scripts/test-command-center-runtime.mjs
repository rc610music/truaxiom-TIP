import { test } from "node:test";
import assert from "node:assert/strict";
import {
  synchronizeRuntimePacket,
  createCommandCenterCandidateTransport,
} from "../packages/core/src/commandCenterRuntimeBridge.ts";
const packet = (revision = 1) => ({
  schema_version: "1.0",
  source: "TIP",
  mission_id: "M1",
  delegation_id: "D1",
  project_id: "PRJ-TIP",
  revision,
  assigned_agent_id: "AGENT-REPOSITORY-INSPECTOR",
  state: "REVIEW",
  blockers: [],
  evidence: [],
  handoffs: [],
  failures: [],
  review_required: true,
  completion_result: "Actual report awaiting review",
  updated_at: "2026-10-09T12:00:00Z",
});
const mapping = {
  tipProjectId: "PRJ-TIP",
  commandCenterProjectId: "CC-TIP",
  env: "development",
};
function ledger() {
  const view = {
    project: { id: "CC-TIP", checkpoint_version: 7 },
    tasks: [],
    evidence: [],
    messages: [],
  };
  const calls = [];
  let fail = false;
  return {
    view,
    calls,
    setFailure: () => {
      fail = true;
    },
    project: async () => structuredClone(view),
    write: async (path, body, key) => {
      assert.equal(body.checkpoint_version, view.project.checkpoint_version);
      assert.equal(body.requires_dot, true);
      assert.equal(key, body.id);
      assert.ok(!calls.some((c) => c.body.id === body.id));
      calls.push({ path, body });
      view[path.slice(1)].push(body);
      view.project.checkpoint_version++;
      if (fail) {
        fail = false;
        throw new Error("Response lost after commit");
      }
    },
  };
}
test("bridge preserves packet and Dot review without inventing CC execution or verification", async () => {
  const l = ledger(),
    p = packet();
  p.blockers = ["Pending Dot"];
  p.failures = [
    {
      schema_version: "1.0",
      mission_id: "M1",
      delegation_id: "D1",
      failure_id: "F1",
      code: "PROVIDER",
      message: "Actual failure",
      retryable: true,
      recorded_by: "A",
      created_at: p.updated_at,
    },
  ];
  p.evidence = [
    {
      schema_version: "1.0",
      mission_id: "M1",
      delegation_id: "D1",
      artifact_id: "E1",
      kind: "repository-report",
      uri: "urn:tip:artifact:" + "a".repeat(64),
      sha256: "a".repeat(64),
      summary: "Real report",
      verification_level: "HASH_VERIFIED",
      attached_by: "A",
      created_at: p.updated_at,
    },
  ];
  await synchronizeRuntimePacket(p, mapping, l);
  assert.equal(l.view.evidence[0].verification_level, "CLAIMED");
  assert.ok(
    l.calls.every(
      (c) => !c.path.includes("review") && !c.path.includes("claim"),
    ),
  );
  const parts = l.view.messages
    .filter((m) => m.body.startsWith("TIP_RUNTIME_PART "))
    .map((m) => m.body.slice(m.body.indexOf("\n") + 1))
    .join("");
  assert.deepEqual(JSON.parse(parts), p);
  assert.equal(
    (await synchronizeRuntimePacket(p, mapping, l)).published,
    false,
  );
});
test("bridge resumes after committed write with lost response and skips old revisions", async () => {
  const l = ledger();
  l.setFailure();
  await assert.rejects(() => synchronizeRuntimePacket(packet(), mapping, l));
  await synchronizeRuntimePacket(packet(), mapping, l);
  await synchronizeRuntimePacket(packet(2), mapping, l);
  const count = l.calls.length;
  assert.equal(
    (await synchronizeRuntimePacket(packet(), mapping, l)).published,
    false,
  );
  assert.equal(l.calls.length, count);
  await assert.rejects(
    () =>
      synchronizeRuntimePacket({ ...packet(2), state: "FAILED" }, mapping, l),
    (e) => e.status === 409,
  );
});
test("bridge refuses undeclared mappings and production environment", async () => {
  const l = ledger();
  await assert.rejects(() =>
    synchronizeRuntimePacket(packet(), { ...mapping, env: "production" }, l),
  );
  await assert.rejects(() =>
    synchronizeRuntimePacket(
      packet(),
      { ...mapping, tipProjectId: "OTHER" },
      l,
    ),
  );
  assert.equal(l.calls.length, 0);
});
test("candidate HTTP transport pins host, rejects redirects, and does not leak provider error text", async () => {
  let call;
  const t = createCommandCenterCandidateTransport(
    "test-only",
    async (url, options) => {
      call = { url, options };
      return new Response(
        JSON.stringify({
          project: { id: "CC-TIP", checkpoint_version: 0 },
          tasks: [],
          evidence: [],
          messages: [],
        }),
        { status: 200 },
      );
    },
  );
  await t.project("CC-TIP");
  assert.equal(
    new URL(call.url).hostname,
    "truaxiom-command-center-candidate.onrender.com",
  );
  assert.equal(call.options.redirect, "error");
  const bad = createCommandCenterCandidateTransport(
    "test-only",
    async () => new Response("sensitive provider detail", { status: 401 }),
  );
  await assert.rejects(
    () => bad.project("CC-TIP"),
    (e) => e.status === 401 && !e.message.includes("sensitive"),
  );
  assert.throws(() => createCommandCenterCandidateTransport(""));
});

test("bridge requires complete packet parts before trusting a commit marker", async () => {
  for (const corruption of [
    "orphan",
    "missing",
    "tampered",
    "duplicate",
    "bad-marker",
  ]) {
    const l = ledger();
    await synchronizeRuntimePacket(packet(), mapping, l);
    if (corruption === "orphan")
      l.view.messages = l.view.messages.filter((m) =>
        m.body.startsWith("TIP_RUNTIME_COMMIT "),
      );
    if (corruption === "missing")
      l.view.messages = l.view.messages.filter(
        (m) => !m.body.startsWith("TIP_RUNTIME_PART "),
      );
    if (corruption === "tampered")
      l.view.messages.find((m) =>
        m.body.startsWith("TIP_RUNTIME_PART "),
      ).body += "altered";
    if (corruption === "duplicate")
      l.view.messages.push(
        structuredClone(
          l.view.messages.find((m) => m.body.startsWith("TIP_RUNTIME_PART ")),
        ),
      );
    if (corruption === "bad-marker")
      l.view.messages.find((m) =>
        m.body.startsWith("TIP_RUNTIME_COMMIT "),
      ).body = 'TIP_RUNTIME_COMMIT {"revision":999999}';
    const count = l.calls.length;
    await assert.rejects(
      () => synchronizeRuntimePacket(packet(), mapping, l),
      (e) => e.status === 409,
    );
    assert.equal(l.calls.length, count, corruption);
  }
});

test("bridge verifies newer revision recovery and cannot mask a conflicting same revision", async () => {
  const l = ledger();
  await synchronizeRuntimePacket(packet(1), mapping, l);
  await synchronizeRuntimePacket(packet(2), mapping, l);
  // Arrival ordering is not authority: recover the highest verified revision.
  l.view.messages.reverse();
  const count = l.calls.length;
  const result = await synchronizeRuntimePacket(packet(1), mapping, l);
  assert.equal(result.published, false);
  assert.equal(result.revision, 2);
  assert.equal(l.calls.length, count);
  await assert.rejects(
    () =>
      synchronizeRuntimePacket(
        { ...packet(1), completion_result: "Conflicting result" },
        mapping,
        l,
      ),
    (e) => e.status === 409,
  );
  assert.equal(l.calls.length, count);
});

test("bridge refuses a commit when its task or evidence reference disappeared", async () => {
  const p = packet();
  p.evidence = [
    {
      schema_version: "1.0",
      mission_id: "M1",
      delegation_id: "D1",
      artifact_id: "E1",
      kind: "repository-report",
      uri: "urn:tip:artifact:" + "a".repeat(64),
      sha256: "a".repeat(64),
      summary: "Report",
      verification_level: "HASH_VERIFIED",
      attached_by: "A",
      created_at: p.updated_at,
    },
  ];
  for (const missing of ["task", "evidence"]) {
    const l = ledger();
    await synchronizeRuntimePacket(p, mapping, l);
    l.view[missing === "task" ? "tasks" : "evidence"] = [];
    const count = l.calls.length;
    await assert.rejects(
      () => synchronizeRuntimePacket(p, mapping, l),
      (e) => e.status === 409,
    );
    assert.equal(l.calls.length, count);
  }
});

test("bridge reconstructs a multi-part newer packet independent of ledger order", async () => {
  const l = ledger();
  const p = { ...packet(3), completion_result: "🧠 observation ".repeat(600) };
  await synchronizeRuntimePacket(p, mapping, l);
  assert.ok(
    l.view.messages.filter((m) => m.body.startsWith("TIP_RUNTIME_PART "))
      .length > 1,
  );
  l.view.messages.reverse();
  const count = l.calls.length;
  const result = await synchronizeRuntimePacket(packet(1), mapping, l);
  assert.equal(result.published, false);
  assert.equal(result.revision, 3);
  assert.equal(l.calls.length, count);
  l.view.messages.find((m) => m.body.startsWith("TIP_RUNTIME_PART ")).body +=
    "tampered";
  await assert.rejects(
    () => synchronizeRuntimePacket(packet(1), mapping, l),
    (e) => e.status === 409,
  );
});

test("bridge refuses deterministic marker and part ID collisions on first publication", async () => {
  const original = ledger();
  await synchronizeRuntimePacket(packet(), mapping, original);
  for (const prefix of ["TIP_RUNTIME_COMMIT ", "TIP_RUNTIME_PART "]) {
    const l = ledger();
    const collision = structuredClone(
      original.view.messages.find((m) => m.body.startsWith(prefix)),
    );
    collision.body = "Unrelated body with reserved identifier";
    l.view.messages.push(collision);
    await assert.rejects(
      () => synchronizeRuntimePacket(packet(), mapping, l),
      (e) => e.status === 409,
    );
    assert.equal(
      l.view.messages.some((m) => m.body.startsWith("TIP_RUNTIME_COMMIT ")),
      false,
    );
  }
});

test("bridge verifies final stored publication instead of trusting POST success", async () => {
  const l = ledger();
  const write = l.write;
  l.write = async (...args) => {
    await write(...args);
    if (args[1].body?.startsWith("TIP_RUNTIME_COMMIT ")) {
      l.view.messages.find((m) =>
        m.body.startsWith("TIP_RUNTIME_PART "),
      ).body += "external alteration";
    }
  };
  await assert.rejects(
    () => synchronizeRuntimePacket(packet(), mapping, l),
    (e) => e.status === 409,
  );
});

test("missing obsolete packet parts do not block publication of a later revision", async () => {
  const l = ledger();
  await synchronizeRuntimePacket(packet(1), mapping, l);
  l.view.messages = l.view.messages.filter(
    (m) => !m.body.startsWith("TIP_RUNTIME_PART "),
  );
  const result = await synchronizeRuntimePacket(packet(2), mapping, l);
  assert.equal(result.published, true);
  assert.equal(result.revision, 2);
  assert.equal(
    (await synchronizeRuntimePacket(packet(2), mapping, l)).published,
    false,
  );
});
