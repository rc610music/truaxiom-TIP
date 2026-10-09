import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Pool } from "pg";
import { MissionRuntime } from "../packages/core/src/missionRuntime.ts";
import { createPostgresMissionRepository } from "../packages/core/src/missionRepository.ts";
import { createPostgresRuntimeArtifacts } from "../packages/core/src/runtimeArtifactRepository.ts";
import { runRepositoryInspection } from "../packages/core/src/repositoryInspector.ts";
import { loadRuntimeCatalog } from "../apps/api/src/missionRuntimeApi.ts";

// No DDL, automatic approval, production deployment or stored credentials.
const id = process.env.TIP_MISSION_ID ?? "MISSION-REPO-INSPECT-20261009-001";
let pool;
let query;
let close;
if (process.argv.includes("--connector-stdio")) {
  if (process.env.TIP_DEV_BRANCH_ID !== "br-small-pond-ar3y2w0l")
    throw new Error("Explicit verified development branch required");
  const lines = createInterface({ input: process.stdin, terminal: false });
  const responses = [];
  let waiting;
  lines.on("line", (line) => {
    if (waiting) {
      const fn = waiting;
      waiting = undefined;
      fn(line);
    } else responses.push(line);
  });
  query = async (sql, params = []) => {
    console.log("NEON_QUERY " + JSON.stringify({ sql, params }));
    const line = responses.length
      ? responses.shift()
      : await new Promise((resolve) => {
          waiting = resolve;
        });
    const reply = JSON.parse(line);
    if (reply.error) throw new Error("Connector query failed");
    return reply.rows;
  };
  close = async () => {};
} else {
  let connection = process.env.TIP_DEV_DATABASE_URL;
  if (process.argv.includes("--database-stdin")) {
    console.log("READY_FOR_DATABASE_INPUT");
    const input = createInterface({ input: process.stdin, terminal: false });
    connection = await new Promise((resolve) =>
      input.once("line", (line) => {
        input.close();
        resolve(line);
      }),
    );
  }
  if (
    !connection ||
    !process.env.TIP_DEV_BRANCH_ID ||
    !process.env.TIP_DEV_EXPECTED_HOST ||
    new URL(connection).hostname !== process.env.TIP_DEV_EXPECTED_HOST
  )
    throw new Error(
      "Explicit development branch and matching database host are required",
    );
  const config = {
    connectionString: connection,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    max: 2,
  };
  pool = new Pool(config);
  query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  close = async () => {
    await pool.end();
    pool = new Pool(config);
  };
}
const createRuntime = async () =>
  new MissionRuntime(
    createPostgresMissionRepository(query),
    await loadRuntimeCatalog("repository-inspection"),
    undefined,
    createPostgresRuntimeArtifacts(query),
  );
try {
  let runtime = await createRuntime();
  await runtime.create(
    {
      schema_version: "1.0",
      mission_id: id,
      project_id: "PRJ-TIP",
      title: "Inspect TIP repository metadata",
      capability_id: "repository.inspect",
      required_permissions: [],
      risk_tier: "low",
      constraints: [
        "Read-only metadata; no source execution or remote mutations",
      ],
      evidence_required: ["repository-report"],
      inputs: {
        repository: "rc610music/truaxiom-TIP",
        ref: process.env.TIP_INSPECT_REF ?? "codex/tip-runtime-001",
      },
    },
    { actor: "CHATGPT_WORK", role: "operator" },
  );
  const reviewed = await runRepositoryInspection(
    runtime,
    createPostgresRuntimeArtifacts(query),
    id,
  );
  await close();
  runtime = await createRuntime();
  let restored = await runtime.get(id);
  const sha = restored.evidence.find(
    (e) => e.verification_level === "HASH_VERIFIED",
  )?.sha256;
  const evidence = sha
    ? await createPostgresRuntimeArtifacts(query).get(sha)
    : null;
  if (
    !["REVIEW", "COMPLETED"].includes(restored.delegation.status) ||
    !evidence ||
    restored.revision !== reviewed.revision
  )
    throw new Error("Restart persistence verification failed");
  if (
    process.argv.includes("--review") &&
    restored.delegation.status === "REVIEW"
  )
    restored = await runtime.command(
      id,
      {
        command_id: "CHATGPT-WORK-REPORT-REVIEW",
        expected_revision: restored.revision,
        type: "review",
        accepted: true,
        note: "ChatGPT Work inspected pinned GitHub metadata and stored hash; executive Dot review remains separate",
      },
      { actor: "CHATGPT_WORK", role: "operator" },
    );
  console.log(
    JSON.stringify(
      {
        branch_id: process.env.TIP_DEV_BRANCH_ID,
        mission_id: id,
        state: restored.delegation.status,
        revision: restored.revision,
        assigned_agent: restored.delegation.assigned_agent_id,
        evidence_sha256: sha,
        report: evidence.content,
        restart_verified: true,
        review:
          restored.delegation.status === "COMPLETED"
            ? "Reviewed by ChatGPT Work; no Dot approval inferred"
            : "Awaiting operator review; no Dot approval inferred",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: "Development mission did not finish",
      code: error.code ?? null,
      status: error.status ?? null,
      name: error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  else process.exit(process.exitCode ?? 0);
}
