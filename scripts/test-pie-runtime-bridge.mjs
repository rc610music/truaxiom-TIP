import assert from "node:assert/strict";
import { test } from "node:test";
import { MissionRuntime } from "../packages/core/src/missionRuntime.ts";
import { createInMemoryMissionRepository } from "../packages/core/src/missionRepository.ts";
import {
  dot,
  worker,
  capability,
  manifest,
  at,
  observation,
  setup,
} from "./fixtures/pie-recovery.mjs";
import { proposePieRecovery } from "../packages/core/src/pieRuntimeBridge.ts";

test("upstream PIE persistence gate creates one approval-gated runtime proposal", async () => {
  const { input, runtime, repository } = setup();
  input.row.intelligence = observation(null, 0);
  assert.equal(await proposePieRecovery({ ...input, now: at(0) }), null);
  input.row.intelligence = observation(input.row.intelligence, 10);
  assert.equal(await proposePieRecovery({ ...input, now: at(10) }), null);
  input.row.intelligence = observation(input.row.intelligence, 20);
  assert.equal(await proposePieRecovery({ ...input, now: at(20) }), null);
  input.row.intelligence = observation(input.row.intelligence, 30);
  const r = await proposePieRecovery(input);
  assert.equal(r.delegation.status, "NEEDS_APPROVAL");
  assert.equal(r.mission.capability_id, capability);
  assert.deepEqual(r.mission.required_permissions, ["actions:fixture-recover"]);
  assert.equal(
    (await proposePieRecovery(input)).mission.mission_id,
    r.mission.mission_id,
  );
  assert.equal((await repository.list()).length, 1);
  await assert.rejects(
    runtime.command(
      r.mission.mission_id,
      {
        type: "claim",
        attempt_id: "attempt",
        ttl_seconds: 30,
        command_id: "claim",
        expected_revision: r.revision,
      },
      worker,
    ),
  );
});

test("denied proposal cannot execute and duplicate proposal cannot reopen it", async () => {
  const { input, runtime } = setup();
  const r = await proposePieRecovery(input);
  const rejected = await runtime.command(
    r.mission.mission_id,
    {
      type: "reject",
      note: "Denied",
      command_id: "reject",
      expected_revision: r.revision,
    },
    dot,
  );
  assert.equal(rejected.delegation.status, "CANCELLED");
  assert.equal(
    (await proposePieRecovery(input)).delegation.status,
    "CANCELLED",
  );
  await assert.rejects(
    runtime.command(
      r.mission.mission_id,
      {
        type: "claim",
        attempt_id: "attempt",
        ttl_seconds: 30,
        command_id: "claim",
        expected_revision: rejected.revision,
      },
      worker,
    ),
  );
});

test("technical operator approval cannot substitute for explicit Dot approval", async () => {
  const { input, runtime } = setup();
  const r = await proposePieRecovery(input);
  await assert.rejects(
    runtime.command(
      r.mission.mission_id,
      {
        type: "approve",
        note: "Technical review",
        command_id: "approve",
        expected_revision: r.revision,
      },
      { actor: "REVIEWER", role: "operator" },
    ),
    /Dot approval/,
  );
  const approved = await runtime.command(
    r.mission.mission_id,
    {
      type: "approve",
      note: "Approve fixture recovery",
      command_id: "approve-dot",
      expected_revision: r.revision,
    },
    dot,
  );
  assert.equal(approved.delegation.status, "ASSIGNED");
});

for (const [name, mutate] of [
  [
    "production",
    (i) => {
      i.binding.environment = "production";
    },
  ],
  [
    "target mismatch",
    (i) => {
      i.binding.endpoint = "https://other.example.com/health";
    },
  ],
  [
    "capability mismatch",
    (i) => {
      i.binding.capabilityId = "repository.inspect";
    },
  ],
  [
    "inactive binding",
    (i) => {
      i.binding.active = false;
    },
  ],
  [
    "stale observation",
    (i) => {
      i.now = at(60);
    },
  ],
  [
    "registration drift",
    (i) => {
      i.row.manifest = structuredClone(manifest);
      i.row.manifest.deployments[0].url = "https://other.example.com";
    },
  ],
])
  test(`${name} blocks proposal before runtime persistence`, async () => {
    const { input, repository } = setup();
    mutate(input);
    await assert.rejects(proposePieRecovery(input));
    assert.equal((await repository.list()).length, 0);
  });

test("direct remediation mission cannot bypass Dot gate with low risk and no permissions", async () => {
  const { runtime } = setup();
  const r = await runtime.create(
    {
      schema_version: "1.0",
      mission_id: "DIRECT",
      project_id: "PRJ-TIP",
      title: "Direct",
      capability_id: capability,
      required_permissions: [],
      risk_tier: "low",
      constraints: [],
      evidence_required: [],
    },
    dot,
  );
  assert.equal(r.delegation.status, "NEEDS_APPROVAL");
});

test("proposal and rejection survive database restart without creating another mission", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createPostgresMissionRepository } =
    await import("../packages/core/src/missionRepository.ts");
  const dir = await mkdtemp(join(tmpdir(), "pie-bridge-"));
  let db = new PGlite(dir);
  try {
    await db.exec(
      await readFile(
        new URL("../database/012_tip_runtime_002.sql", import.meta.url),
        "utf8",
      ),
    );
    const { input, catalog } = setup();
    const makeRuntime = () =>
      new MissionRuntime(
        createPostgresMissionRepository(
          async (sql, params) => (await db.query(sql, params)).rows,
        ),
        catalog,
        () => at(31),
      );
    let runtime = makeRuntime();
    input.runtime = runtime;
    const r = await proposePieRecovery(input);
    await db.close();
    db = new PGlite(dir);
    runtime = makeRuntime();
    input.runtime = runtime;
    const restored = await proposePieRecovery(input);
    assert.equal(restored.mission.mission_id, r.mission.mission_id);
    assert.equal(restored.delegation.status, "NEEDS_APPROVAL");
    await runtime.command(
      r.mission.mission_id,
      {
        type: "reject",
        note: "Denied",
        command_id: "reject",
        expected_revision: restored.revision,
      },
      dot,
    );
    await db.close();
    db = new PGlite(dir);
    input.runtime = makeRuntime();
    assert.equal(
      (await proposePieRecovery(input)).delegation.status,
      "CANCELLED",
    );
    assert.equal((await input.runtime.repository.list()).length, 1);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
