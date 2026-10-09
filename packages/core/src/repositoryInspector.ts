import type { MissionRuntime } from "./missionRuntime";
import { RuntimeError } from "./runtimeContracts";
import type { ArtifactRepository } from "./runtimeArtifactRepository";
import type { RuntimeCommand } from "./missionRuntimeTypes";
import { randomUUID } from "node:crypto";
type CommandPayload<T> = T extends unknown
  ? Omit<T, "command_id" | "expected_revision">
  : never;
export type GitHubReader = (path: string) => Promise<Record<string, any>>;
const repository = "rc610music/truaxiom-TIP";

/** Fixed host/repository, GET only, no redirects, bounded time/body. Never execute checked-out code. */
export function createGitHubMetadataReader(token?: string): GitHubReader {
  return async (path) => {
    if (!path.startsWith(`/repos/${repository}/`) || path.includes(".."))
      throw new RuntimeError(403, "Repository boundary denied");
    const response = await fetch(`https://api.github.com${path}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TruaXiom-TIP-Repository-Inspector",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok)
      throw new RuntimeError(
        response.status === 401 || response.status === 403 ? 403 : 502,
        `GitHub metadata unavailable (HTTP ${response.status})`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new RuntimeError(502, "Missing GitHub response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_097_152) {
        await reader.cancel();
        throw new RuntimeError(502, "GitHub response exceeds 2 MiB");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
}
export async function runRepositoryInspection(
  runtime: Pick<MissionRuntime, "get" | "command">,
  artifacts: ArtifactRepository,
  id: string,
  read: GitHubReader = createGitHubMetadataReader(),
) {
  const original = await runtime.get(id);
  if (["REVIEW", "COMPLETED"].includes(original.delegation.status))
    return original;
  if (
    original.mission.capability_id !== "repository.inspect" ||
    original.mission.inputs?.repository !== repository ||
    !original.mission.inputs.ref
  )
    throw new RuntimeError(
      400,
      "Inspector requires its declared capability and explicit repository/ref inputs",
    );
  const principal = {
    actor: "AGENT-REPOSITORY-INSPECTOR",
    role: "agent" as const,
  };
  let current = original;
  let token: string | undefined;
  const attempt = randomUUID();
  async function apply(input: CommandPayload<RuntimeCommand>) {
    const command = {
      ...input,
      command_id: `W:${attempt}:${current.revision}`,
      expected_revision: current.revision,
      ...(token ? { lease_token: token } : {}),
    };
    current = await runtime.command(id, command, principal);
    return current;
  }
  // Claim happens outside failure catch: a second worker must never fail another worker's mission.
  await apply({ type: "claim", attempt_id: attempt, ttl_seconds: 120 });
  token = current.lease!.token;
  try {
    const commit = await read(
      `/repos/${repository}/commits/${encodeURIComponent(original.mission.inputs.ref)}`,
    );
    if (!/^[a-f0-9]{40}$/.test(commit.sha))
      throw new RuntimeError(502, "GitHub did not return a commit identity");
    await apply({ type: "heartbeat", ttl_seconds: 120 });
    const tree = await read(
      `/repos/${repository}/git/trees/${commit.sha}?recursive=1`,
    );
    const checks = await read(
      `/repos/${repository}/commits/${commit.sha}/check-runs?per_page=100`,
    );
    if (
      !Array.isArray(tree.tree) ||
      tree.tree.some(
        (entry: any) =>
          !entry ||
          typeof entry.path !== "string" ||
          typeof entry.type !== "string",
      ) ||
      !Array.isArray(checks.check_runs) ||
      checks.check_runs.some(
        (entry: any) =>
          !entry ||
          typeof entry.name !== "string" ||
          typeof entry.status !== "string",
      )
    )
      throw new RuntimeError(502, "Malformed GitHub metadata response");
    await apply({ type: "heartbeat", ttl_seconds: 120 });
    const report = {
      repository,
      requested_ref: original.mission.inputs.ref,
      commit_sha: commit.sha,
      inspected_at: new Date().toISOString(),
      commit_message: String(commit.commit?.message ?? "").slice(0, 4096),
      paths: (Array.isArray(tree.tree) ? tree.tree : [])
        .filter((f: any) => f.type === "blob")
        .map((f: any) => String(f.path))
        .sort()
        .slice(0, 2000),
      tree_truncated:
        tree.truncated === true || (tree.tree?.length ?? 0) > 2000,
      check_runs: (Array.isArray(checks.check_runs)
        ? checks.check_runs
        : []
      ).map((c: any) => ({
        name: String(c.name),
        status: String(c.status),
        conclusion: c.conclusion ?? null,
        details_url: c.details_url ?? null,
      })),
      checks_truncated: Number(checks.total_count ?? 0) > 100,
      verification_scope:
        "GitHub metadata observed; source code, deployment health and tests were not executed by this worker",
    };
    const sha = await artifacts.put({
      schema_version: "1.0",
      mission_id: id,
      kind: "repository-report",
      content: report,
    });
    await apply({
      type: "evidence",
      artifact_id: `REPORT:${current.lease!.epoch}`,
      kind: "repository-report",
      uri: `urn:tip:artifact:${sha}`,
      sha256: sha,
      summary: `Repository metadata at ${commit.sha}; ${report.check_runs.length} observed check runs`,
    });
    return await apply({
      type: "transition",
      state: "REVIEW",
      reason: "Inspection finished; operator review required",
      result: `Inspected ${repository} at ${commit.sha}; ${report.paths.length} recorded paths, ${report.check_runs.length} check runs. ${report.verification_scope}`,
    });
  } catch (error) {
    // No provider error text or credentials reach logs/evidence. Only the fenced owner may record failure.
    try {
      await apply({
        type: "failure",
        failure_id: `F:${current.lease!.epoch}`,
        code: "INSPECTION_UNAVAILABLE",
        message:
          "Repository inspection unavailable; operator should inspect GitHub access or retry with a new mission",
        retryable: true,
      });
    } catch (fenced) {
      throw new RuntimeError(
        409,
        "Worker lost lease or mission changed; stale results were discarded",
      );
    }
    throw error instanceof RuntimeError
      ? error
      : new RuntimeError(502, "Repository inspection failed");
  }
}
