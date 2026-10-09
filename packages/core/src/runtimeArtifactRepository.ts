import { createHash } from "node:crypto";
import {
  canonicalJson,
  RuntimeError,
  validateRuntimeContract,
} from "./runtimeContracts";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
export interface StoredRuntimeArtifact {
  schema_version: "1.0";
  mission_id: string;
  kind: string;
  content: Record<string, unknown>;
}
export interface ArtifactRepository {
  put(body: StoredRuntimeArtifact): Promise<string>;
  get(sha256: string): Promise<StoredRuntimeArtifact | null>;
}
export function artifactHash(body: StoredRuntimeArtifact): string {
  validateRuntimeContract("stored-runtime-artifact", body);
  const value = canonicalJson(body);
  if (Buffer.byteLength(value) > 524288)
    throw new RuntimeError(400, "Artifact exceeds 512 KiB");
  return createHash("sha256").update(value).digest("hex");
}
export function createMemoryRuntimeArtifacts(): ArtifactRepository {
  const records = new Map<string, StoredRuntimeArtifact>();
  return {
    async put(body) {
      const sha = artifactHash(body);
      records.set(sha, structuredClone(body));
      return sha;
    },
    async get(sha) {
      return structuredClone(records.get(sha) ?? null);
    },
  };
}
export function createPostgresRuntimeArtifacts(
  query: PostgresQueryExecutor,
): ArtifactRepository {
  return {
    async put(body) {
      const sha = artifactHash(body);
      await query(
        "insert into tip_runtime_artifacts (sha256, mission_id, body) values ($1,$2,$3::jsonb) on conflict (sha256) do nothing",
        [sha, body.mission_id, JSON.stringify(body)],
      );
      return sha;
    },
    async get(sha) {
      return (
        (
          await query<{ body: StoredRuntimeArtifact }>(
            "select body from tip_runtime_artifacts where sha256=$1",
            [sha],
          )
        )[0]?.body ?? null
      );
    },
  };
}
