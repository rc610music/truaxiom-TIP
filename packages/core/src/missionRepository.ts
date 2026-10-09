import type { MissionRecord } from "./missionRuntime";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
export interface MissionRepository {
  source: "in-memory" | "postgres";
  get(id: string): Promise<MissionRecord | null>;
  list(): Promise<MissionRecord[]>;
  /** Atomic insert (expected 0) or compare-and-swap of the complete aggregate. */
  save(record: MissionRecord, expectedRevision: number): Promise<boolean>;
}
export function createInMemoryMissionRepository(): MissionRepository {
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
      records.set(record.mission.mission_id, structuredClone(record));
      return true;
    },
  };
}
export function createPostgresMissionRepository(
  query: PostgresQueryExecutor,
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
