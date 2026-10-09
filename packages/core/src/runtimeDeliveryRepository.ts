import { createHash, randomUUID } from "node:crypto";
import {
  canonicalJson,
  RuntimeError,
  validateRuntimeContract,
} from "./runtimeContracts";
import { runtimeHandoffPacket } from "./runtimePacket";
import type { MissionRecord, HandoffPacket } from "./missionRuntimeTypes";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";

export interface RuntimeDeliveryMapping {
  schema_version: "1.0";
  tip_project_id: string;
  command_center_project_id: string;
  environment: "development" | "preview";
}
export interface RuntimeDelivery {
  delivery_id: string;
  mission_id: string;
  mission_revision: number;
  target: RuntimeDeliveryMapping;
  packet: HandoffPacket;
  status: "PENDING" | "DELIVERING" | "DELIVERED" | "PAUSED";
  attempts: number;
  available_at: string;
  lease_token: string | null;
  lease_until: string | null;
  last_error_code: string | null;
  delivered_task_id: string | null;
  created_at: string;
  completed_at: string | null;
  retry_history: Array<{ actor: string; requested_at: string }>;
}
export interface RuntimeDeliveryRepository {
  list(): Promise<RuntimeDelivery[]>;
  claim(now: string, ttlSeconds: number): Promise<RuntimeDelivery | null>;
  renew(
    id: string,
    token: string,
    now: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  finish(
    id: string,
    token: string,
    now: string,
    taskId: string,
  ): Promise<boolean>;
  fail(
    id: string,
    token: string,
    now: string,
    code: string,
    availableAt: string,
    pause: boolean,
  ): Promise<boolean>;
  retry(id: string, now: string, actor: string): Promise<boolean>;
}
export interface MemoryRuntimeDeliveryRepository
  extends RuntimeDeliveryRepository {
  enqueue(rows: RuntimeDelivery[]): void;
}
export function readRuntimeDeliveryMappings(
  value?: string,
): RuntimeDeliveryMapping[] {
  if (!value) return [];
  const rows: unknown = JSON.parse(value);
  if (!Array.isArray(rows))
    throw new RuntimeError(400, "Delivery mapping array required");
  const projects = new Set<string>();
  for (const row of rows) {
    validateRuntimeContract("runtime-delivery-mapping", row);
    if (projects.has(row.tip_project_id))
      throw new RuntimeError(400, "Ambiguous TIP project delivery mapping");
    projects.add(row.tip_project_id);
  }
  return rows;
}
export function deliveryRows(
  record: MissionRecord,
  mappings: readonly RuntimeDeliveryMapping[],
): RuntimeDelivery[] {
  return mappings
    .filter((m) => m.tip_project_id === record.mission.project_id)
    .map((target) => {
      validateRuntimeContract("runtime-delivery-mapping", target);
      const packet = runtimeHandoffPacket(record);
      validateRuntimeContract("handoff-packet", packet);
      const delivery_id = createHash("sha256")
        .update(
          canonicalJson({
            target,
            mission_id: packet.mission_id,
            revision: packet.revision,
          }),
        )
        .digest("hex");
      return {
        delivery_id,
        mission_id: packet.mission_id,
        mission_revision: packet.revision,
        target: structuredClone(target),
        packet: structuredClone(packet),
        status: "PENDING",
        attempts: 0,
        available_at: packet.updated_at,
        lease_token: null,
        lease_until: null,
        last_error_code: null,
        delivered_task_id: null,
        created_at: packet.updated_at,
        completed_at: null,
        retry_history: [],
      };
    });
}
function expiry(now: string, ttl: number) {
  if (
    !Number.isInteger(ttl) ||
    ttl < 30 ||
    ttl > 300 ||
    !Number.isFinite(Date.parse(now))
  )
    throw new RuntimeError(400, "Invalid delivery lease");
  return new Date(Date.parse(now) + ttl * 1000).toISOString();
}
export function createMemoryRuntimeDeliveries(): MemoryRuntimeDeliveryRepository {
  const rows = new Map<string, RuntimeDelivery>();
  const owned = (id: string, token: string, now: string) => {
    const r = rows.get(id);
    return r?.status === "DELIVERING" &&
      r.lease_token === token &&
      Date.parse(r.lease_until!) > Date.parse(now)
      ? r
      : null;
  };
  return {
    enqueue(records) {
      for (const row of records)
        if (!rows.has(row.delivery_id))
          rows.set(row.delivery_id, structuredClone(row));
    },
    async list() {
      return [...rows.values()]
        .sort(
          (a, b) =>
            a.mission_id.localeCompare(b.mission_id) ||
            a.mission_revision - b.mission_revision,
        )
        .map((r) => structuredClone(r));
    },
    async claim(now, ttl) {
      const until = expiry(now, ttl);
      const r = [...rows.values()]
        .sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.mission_revision - b.mission_revision ||
            a.delivery_id.localeCompare(b.delivery_id),
        )
        .find(
          (r) =>
            ![...rows.values()].some(
              (prior) =>
                prior.mission_id === r.mission_id &&
                canonicalJson(prior.target) === canonicalJson(r.target) &&
                prior.mission_revision < r.mission_revision &&
                prior.status !== "DELIVERED",
            ) &&
            ((r.status === "PENDING" &&
              Date.parse(r.available_at) <= Date.parse(now)) ||
              (r.status === "DELIVERING" &&
                Date.parse(r.lease_until!) <= Date.parse(now))),
        );
      if (!r) return null;
      Object.assign(r, {
        status: "DELIVERING",
        attempts: r.attempts + 1,
        lease_token: randomUUID(),
        lease_until: until,
      });
      return structuredClone(r);
    },
    async renew(id, token, now, ttl) {
      const until = expiry(now, ttl),
        r = owned(id, token, now);
      if (!r) return false;
      r.lease_until = until;
      return true;
    },
    async finish(id, token, now, task) {
      const r = owned(id, token, now);
      if (!r) return false;
      Object.assign(r, {
        status: "DELIVERED",
        delivered_task_id: task,
        completed_at: now,
        lease_token: null,
        lease_until: null,
        last_error_code: null,
      });
      return true;
    },
    async fail(id, token, now, code, due, pause) {
      const r = owned(id, token, now);
      if (!r) return false;
      Object.assign(r, {
        status: pause ? "PAUSED" : "PENDING",
        available_at: due,
        last_error_code: code,
        lease_token: null,
        lease_until: null,
      });
      return true;
    },
    async retry(id, now, actor) {
      if (!actor) throw new RuntimeError(400, "Retry actor required");
      const r = rows.get(id);
      if (!r || r.status !== "PAUSED") return false;
      Object.assign(r, { status: "PENDING", available_at: now, attempts: 0 });
      r.retry_history.push({ actor, requested_at: now });
      return true;
    },
  };
}
export function createPostgresRuntimeDeliveries(
  query: PostgresQueryExecutor,
): RuntimeDeliveryRepository {
  const update = async (sql: string, params: unknown[]) =>
    (await query(sql, params)).length === 1;
  const fence =
    "delivery_id=$1 and lease_token=$2 and status='DELIVERING' and lease_until>$3::timestamptz";
  return {
    async list() {
      return await query<RuntimeDelivery>(
        "select * from tip_runtime_deliveries order by mission_id,mission_revision",
      );
    },
    async claim(now, ttl) {
      const token = randomUUID();
      return (
        (
          await query<RuntimeDelivery>(
            "update tip_runtime_deliveries set status='DELIVERING',attempts=attempts+1,lease_token=$2,lease_until=$3::timestamptz where delivery_id=(select d.delivery_id from tip_runtime_deliveries d where ((d.status='PENDING' and d.available_at<=$1::timestamptz) or (d.status='DELIVERING' and d.lease_until<=$1::timestamptz)) and not exists (select 1 from tip_runtime_deliveries earlier where earlier.mission_id=d.mission_id and earlier.target=d.target and earlier.mission_revision<d.mission_revision and earlier.status<>'DELIVERED') order by created_at,mission_revision,delivery_id for update skip locked limit 1) returning *",
            [now, token, expiry(now, ttl)],
          )
        )[0] ?? null
      );
    },
    renew: (id, token, now, ttl) =>
      update(
        `update tip_runtime_deliveries set lease_until=$4::timestamptz where ${fence} returning delivery_id`,
        [id, token, now, expiry(now, ttl)],
      ),
    finish: (id, token, now, task) =>
      update(
        `update tip_runtime_deliveries set status='DELIVERED',delivered_task_id=$4,completed_at=$3::timestamptz,lease_token=null,lease_until=null,last_error_code=null where ${fence} returning delivery_id`,
        [id, token, now, task],
      ),
    fail: (id, token, now, code, due, pause) =>
      update(
        `update tip_runtime_deliveries set status=$6,available_at=$5::timestamptz,last_error_code=$4,lease_token=null,lease_until=null where ${fence} returning delivery_id`,
        [id, token, now, code, due, pause ? "PAUSED" : "PENDING"],
      ),
    retry: (id, now, actor) => {
      if (!actor) throw new RuntimeError(400, "Retry actor required");
      return update(
        "update tip_runtime_deliveries set status='PENDING',available_at=$2::timestamptz,attempts=0,retry_history=retry_history || jsonb_build_array(jsonb_build_object('actor',$3::text,'requested_at',$2::text)) where delivery_id=$1 and status='PAUSED' returning delivery_id",
        [id, now, actor],
      );
    },
  };
}
