import type { MissionRecord } from "./missionRuntime";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
import {
  deliveryRows,
  type RuntimeDeliveryMapping,
  type MemoryRuntimeDeliveryRepository,
} from "./runtimeDeliveryRepository";
export interface MissionRepository {
  source: "in-memory" | "postgres";
  get(id: string): Promise<MissionRecord | null>;
  list(): Promise<MissionRecord[]>;
  /** Atomic insert (expected 0) or compare-and-swap of the complete aggregate. */
  save(record: MissionRecord, expectedRevision: number): Promise<boolean>;
}
export function createInMemoryMissionRepository(
  deliveries?: MemoryRuntimeDeliveryRepository,
  mappings: readonly RuntimeDeliveryMapping[] = [],
): MissionRepository {
  if (mappings.length && !deliveries)
    throw new Error("Memory delivery repository required for mapped missions");
  const records = new Map<string, MissionRecord>();
  return {
    source: "in-memory",
    async get(id) {
      return structuredClone(records.get(id) ?? null);
    },
    async list() {
      return [...records.values()]
        .sort((a, b) => (a.mission.mission_id < b.mission.mission_id ? -1 : 1))
        .map((r) => structuredClone(r));
    },
    async save(record, expected) {
      if (record.revision !== expected + 1) return false;
      if ((records.get(record.mission.mission_id)?.revision ?? 0) !== expected)
        return false;
      const copy = structuredClone(record);
      const queued = deliveryRows(copy, mappings);
      deliveries?.enqueue(queued);
      records.set(record.mission.mission_id, copy);
      return true;
    },
  };
}
export function createPostgresMissionRepository(
  query: PostgresQueryExecutor,
  mappings: readonly RuntimeDeliveryMapping[] = [],
): MissionRepository {
  return {
    source: "postgres",
    async get(id) {
      const rows = await query<{ record: MissionRecord }>(
        "select record from tip_runtime_missions where mission_id = $1",
        [id],
      );
      return rows[0]?.record ?? null;
    },
    async list() {
      return (
        await query<{ record: MissionRecord }>(
          "select record from tip_runtime_missions order by mission_id",
        )
      ).map((r) => r.record);
    },
    async save(record, expected) {
      if (record.revision !== expected + 1) return false;
      const params = [
        record.mission.mission_id,
        record.revision,
        JSON.stringify(record),
      ];
      const deliveries = deliveryRows(record, mappings);
      if (deliveries.length) {
        const changed =
          expected === 0
            ? "insert into tip_runtime_missions (mission_id,revision,record) select $1,$2,$3::jsonb where $4::integer=0 on conflict (mission_id) do nothing returning mission_id"
            : "update tip_runtime_missions set revision=$2,record=$3::jsonb where mission_id=$1 and revision=$4 returning mission_id";
        const rows = await query(
          `with changed as (${changed}), queued as (
          insert into tip_runtime_deliveries (delivery_id,mission_id,mission_revision,target,packet,available_at,created_at)
          select d.delivery_id,$1,$2,d.target,d.packet,d.available_at,d.created_at from
          jsonb_to_recordset($5::jsonb) as d(delivery_id text,target jsonb,packet jsonb,available_at timestamptz,created_at timestamptz)
          join changed on changed.mission_id=$1
          on conflict (delivery_id) do nothing returning delivery_id
        ) select mission_id from changed`,
          [...params, expected, JSON.stringify(deliveries)],
        );
        return rows.length === 1;
      }
      const rows =
        expected === 0
          ? await query(
              "insert into tip_runtime_missions (mission_id, revision, record) values ($1,$2,$3::jsonb) on conflict (mission_id) do nothing returning mission_id",
              params,
            )
          : await query(
              "update tip_runtime_missions set revision=$2, record=$3::jsonb where mission_id=$1 and revision=$4 returning mission_id",
              [...params, expected],
            );
      return rows.length === 1;
    },
  };
}
