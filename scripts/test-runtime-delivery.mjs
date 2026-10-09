import { test } from "node:test";
import assert from "node:assert/strict";
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
  createMemoryRuntimeDeliveries,
  createPostgresRuntimeDeliveries,
  readRuntimeDeliveryMappings,
} from "../packages/core/src/runtimeDeliveryRepository.ts";
import { deliverNextRuntimePacket } from "../packages/core/src/runtimeDeliveryWorker.ts";
import { RuntimeError } from "../packages/core/src/runtimeContracts.ts";
import { createMissionRuntimeApi } from "../apps/api/src/missionRuntimeApi.ts";
import { createApiPersistenceRuntime } from "../apps/api/src/persistence.ts";
import { readTipServerConfig } from "../packages/core/src/serverRuntime.ts";
const mapping = {
  schema_version: "1.0",
  tip_project_id: "PRJ-TIP",
  command_center_project_id: "CC-TIP",
  environment: "development",
};
const principal = { actor: "TEST-OPERATOR", role: "operator" };
const input = (id) => ({
  schema_version: "1.0",
  mission_id: id,
  project_id: "PRJ-TIP",
  title: "Delivery fixture",
  capability_id: "not.declared",
  required_permissions: [],
  risk_tier: "low",
  constraints: [],
  evidence_required: [],
});
let clock = Date.parse("2026-10-09T02:00:00Z");
const now = () => new Date(clock).toISOString();
const setup = () => {
  clock = Date.parse("2026-10-09T02:00:00Z");
  const deliveries = createMemoryRuntimeDeliveries();
  const missions = createInMemoryMissionRepository(deliveries, [mapping]);
  const runtime = new MissionRuntime(
    missions,
    { agents: [], capabilities: [] },
    now,
  );
  return { deliveries, missions, runtime };
};
function ledger() {
  const view = {
    project: { id: "CC-TIP", checkpoint_version: 0 },
    tasks: [],
    evidence: [],
    messages: [],
  };
  let uncertain = false;
  const keys = new Set();
  return {
    view,
    loseResponse: () => {
      uncertain = true;
    },
    project: async () => structuredClone(view),
    write: async (path, body, key) => {
      assert.equal(body.checkpoint_version, view.project.checkpoint_version);
      assert.equal(body.requires_dot, true);
      assert.equal(body.authority_type, "DOT_APPROVAL");
      assert.ok(!keys.has(key));
      keys.add(key);
      view[path.slice(1)].push(body);
      view.project.checkpoint_version++;
      if (uncertain) {
        uncertain = false;
        throw new Error("Provider credential detail must stay private");
      }
    },
  };
}
test("configured save queues exact packet atomically; unmapped projects never enqueue", async () => {
  const { runtime, deliveries } = setup();
  const r = await runtime.create(input("M1"), principal);
  assert.equal(r.delegation.status, "UNROUTABLE");
  const rows = await deliveries.list();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].packet, runtime.packet(r));
  await runtime.create(input("M1"), principal);
  assert.equal((await deliveries.list()).length, 1);
  const empty = createMemoryRuntimeDeliveries();
  await new MissionRuntime(
    createInMemoryMissionRepository(empty, []),
    { agents: [], capabilities: [] },
    now,
  ).create(input("M2"), principal);
  assert.equal((await empty.list()).length, 0);
});
test("competing claims serialize one mission and expire with new token", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  const claims = await Promise.all([
    deliveries.claim(now(), 30),
    deliveries.claim(now(), 30),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const original = claims.find(Boolean);
  clock += 31000;
  const next = await deliveries.claim(now(), 30);
  assert.notEqual(original.lease_token, next.lease_token);
  assert.equal(next.attempts, 2);
  assert.equal(
    await deliveries.finish(
      original.delivery_id,
      original.lease_token,
      now(),
      "TASK",
    ),
    false,
  );
  assert.equal(
    await deliveries.renew(
      original.delivery_id,
      original.lease_token,
      now(),
      30,
    ),
    false,
  );
});
test("uncertain committed CC write resumes without duplicates after backoff", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  const transport = ledger();
  transport.loseResponse();
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, transport, now)).status,
    "RETRY_PENDING",
  );
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, transport, now)).status,
    "IDLE",
  );
  clock += 5000;
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, transport, now)).status,
    "DELIVERED",
  );
  assert.equal(transport.view.tasks.length, 1);
  assert.equal(transport.view.messages.length, 2);
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, transport, now)).status,
    "IDLE",
  );
  assert.ok(
    !JSON.stringify(await deliveries.list()).includes("credential detail"),
  );
});
test("auth and project failures pause; operator retry is required", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  const bad = {
    project: async () => {
      throw new RuntimeError(401, "secret-provider-detail");
    },
    write: async () => {
      assert.fail();
    },
  };
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, bad, now)).status,
    "PAUSED",
  );
  const row = (await deliveries.list())[0];
  clock += 1000000;
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, bad, now)).status,
    "IDLE",
  );
  assert.equal(row.last_error_code, "HTTP_401");
  assert.ok(!JSON.stringify(row).includes("secret-provider"));
  assert.equal(
    await deliveries.retry(row.delivery_id, now(), principal.actor),
    true,
  );
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, ledger(), now)).status,
    "DELIVERED",
  );
  assert.equal(
    await deliveries.retry(row.delivery_id, now(), principal.actor),
    false,
  );
});
test("retry budget prevents endless requests", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  let calls = 0;
  const broken = {
    project: async () => {
      calls++;
      throw new RuntimeError(503, "unavailable");
    },
    write: async () => assert.fail(),
  };
  for (let i = 0; i < 8; i++) {
    const outcome = await deliverNextRuntimePacket(deliveries, broken, now);
    assert.equal(outcome.status, i === 7 ? "PAUSED" : "RETRY_PENDING");
    clock += 3600000;
  }
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, broken, now)).status,
    "IDLE",
  );
  assert.equal(calls, 8);
});
test("lease lost during remote response cannot finalize another worker attempt", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  const transport = ledger();
  const project = transport.project;
  transport.project = async (id) => {
    const r = await project(id);
    clock += 121000;
    return r;
  };
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, transport, now)).status,
    "FENCED",
  );
  assert.equal((await deliveries.list())[0].status, "DELIVERING");
  assert.equal(
    (await deliverNextRuntimePacket(deliveries, ledger(), now)).status,
    "DELIVERED",
  );
});
test("mapping denies unknown fields, production and ambiguous project targets", () => {
  assert.deepEqual(readRuntimeDeliveryMappings(), []);
  assert.throws(() =>
    readRuntimeDeliveryMappings(
      JSON.stringify([{ ...mapping, environment: "production" }]),
    ),
  );
  assert.throws(() =>
    readRuntimeDeliveryMappings(
      JSON.stringify([{ ...mapping, authority: "invented" }]),
    ),
  );
  assert.throws(() =>
    readRuntimeDeliveryMappings(
      JSON.stringify([
        mapping,
        { ...mapping, command_center_project_id: "OTHER" },
      ]),
    ),
  );
  assert.throws(() => createInMemoryMissionRepository(undefined, [mapping]));
});
test("operator read model redacts lease secrets and rejects unauthenticated retry", async () => {
  const { runtime, deliveries } = setup();
  await runtime.create(input("M1"), principal);
  const claimed = await deliveries.claim(now(), 30);
  const api = createMissionRuntimeApi(
    runtime,
    { secret: "test-only", actor: principal.actor },
    undefined,
    deliveries,
  );
  assert.equal(
    (await api({ method: "GET", path: "/v1/runtime/deliveries" })).status,
    401,
  );
  const headers = { authorization: "Bearer test-only" };
  const result = await api({
    method: "GET",
    path: "/v1/runtime/deliveries",
    headers,
  });
  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result).includes(claimed.lease_token));
  await deliveries.fail(
    claimed.delivery_id,
    claimed.lease_token,
    now(),
    "HTTP_401",
    now(),
    true,
  );
  const path = `/v1/runtime/deliveries/${claimed.delivery_id}/retry`;
  assert.equal((await api({ method: "POST", path, body: {} })).status, 401);
  assert.equal(
    (await api({ method: "POST", path, body: {}, headers })).status,
    200,
  );
  assert.equal(
    (await api({ method: "POST", path, body: {}, headers })).status,
    200,
  );
  assert.equal((await deliveries.list())[0].status, "PENDING");
});
test("durable config without database never uses a memory delivery queue", async () => {
  const persistence = createApiPersistenceRuntime(
    readTipServerConfig({ TIP_PERSISTENCE_PROVIDER: "neon" }),
    [mapping],
  );
  await assert.rejects(() => persistence.runtimeDeliveries.list());
});
test("Postgres commit and outbox roll back together; CAS rejects extra delivery rows", async () => {
  const db = new PGlite();
  try {
    for (const file of [
      "012_tip_runtime_002.sql",
      "014_tip_runtime_deliveries.sql",
    ])
      await db.exec(
        await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
      );
    const query = async (sql, params = []) =>
      (await db.query(sql, params)).rows;
    const runtime = new MissionRuntime(
      createPostgresMissionRepository(query, [mapping]),
      { agents: [], capabilities: [] },
      now,
    );
    const record = await runtime.create(input("M1"), principal);
    const queue = createPostgresRuntimeDeliveries(query);
    assert.equal((await queue.list()).length, 1);
    assert.equal(
      await runtime.repository.save({ ...record, revision: 2 }, 0),
      false,
    );
    assert.equal((await queue.list()).length, 1);
    await db.exec(
      `create function reject_delivery() returns trigger language plpgsql as $$begin raise exception 'test outbox unavailable';end$$;create trigger reject_delivery before insert on tip_runtime_deliveries for each row execute function reject_delivery();`,
    );
    await assert.rejects(() => runtime.create(input("M2"), principal));
    assert.equal(await runtime.repository.get("M2"), null);
    assert.equal((await queue.list()).length, 1);
  } finally {
    await db.close();
  }
});
test("persistent queue reopens, reclaims expired worker and preserves revision order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tip-deliveries-"));
  let db = new PGlite(dir);
  try {
    for (const file of [
      "012_tip_runtime_002.sql",
      "014_tip_runtime_deliveries.sql",
    ])
      await db.exec(
        await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
      );
    const query = async (sql, params = []) =>
      (await db.query(sql, params)).rows;
    const missions = createPostgresMissionRepository(query, [mapping]);
    const runtime = new MissionRuntime(
      missions,
      { agents: [], capabilities: [] },
      now,
    );
    const record = await runtime.create(input("M1"), principal);
    assert.equal(await missions.save({ ...record, revision: 2 }, 1), true);
    let queue = createPostgresRuntimeDeliveries(query);
    const first = await queue.claim(now(), 30);
    assert.equal(first.mission_revision, 1);
    assert.equal(await queue.claim(now(), 30), null);
    await db.close();
    db = new PGlite(dir);
    queue = createPostgresRuntimeDeliveries(query);
    clock += 31000;
    const recovered = await queue.claim(now(), 30);
    assert.equal(recovered.mission_revision, 1);
    assert.notEqual(first.lease_token, recovered.lease_token);
    assert.equal(
      await queue.finish(first.delivery_id, first.lease_token, now(), "STALE"),
      false,
    );
    assert.equal(
      await queue.finish(
        recovered.delivery_id,
        recovered.lease_token,
        now(),
        "TASK1",
      ),
      true,
    );
    const second = await queue.claim(now(), 30);
    assert.equal(second.mission_revision, 2);
    assert.equal(
      await queue.fail(
        second.delivery_id,
        second.lease_token,
        now(),
        "HTTP_403",
        now(),
        true,
      ),
      true,
    );
    assert.equal(await queue.claim(now(), 30), null);
    assert.equal(
      await queue.retry(second.delivery_id, now(), principal.actor),
      true,
    );
    assert.equal(
      (await deliverNextRuntimePacket(queue, ledger(), now)).status,
      "DELIVERED",
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
