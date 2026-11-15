// Test-only upstream fixture: rc610music/truaxiom@83743a052e557e93a1444b25a32b7ff5a2128b19
// Original path: command-center/server/pie-contract.ts. Not a runtime dependency.
import { createHash } from 'node:crypto';
/** Manifest declarations and observed evidence are deliberately separate. */
export type Manifest = {
  schemaVersion: "truaxiom-app-manifest-v1";
  projectId: string;
  productId: string;
  name: string;
  description: string;
  source: { provider: "github"; repository: string; ref: string; path: string; manifestPath: string | null };
  deployments: { id: string; surface: "candidate" | "production"; url: string; healthPath: string; buildPath: string | null }[];
  domains: string[];
  capabilities: { id: string; name: string; evidencePath: string | null; evidenceRef?: string }[];
  dependencies: string[];
  tip: { registry: boolean; integrationPoints: string[] };
};
export type Evidence = {
  kind: "manifest" | "source" | "deployment" | "health" | "domain" | "capability";
  key: string;
  source: string;
  status: "verified" | "unavailable" | "unverified";
  observedAt: string;
  value: unknown;
  error?: string;
};
export type Fact = { value: unknown; source: string; observedAt: string; status: "verified" | "stale"; sourceType?: Evidence['kind']; verifier?: string; evidenceRef?: string; confidence?: 'observed' | 'declared'; conflict?: boolean };
export type ProductionSyncStatus = "IN SYNC" | "AHEAD" | "MISMATCH" | "UNVERIFIED" | `AHEAD + MISMATCH: ${string}`;
export type Intelligence = {
  projectId: string;
  productId: string;
  name: string;
  checkedAt: string;
  facts: Record<string, Fact>;
  conflicts: string[];
  unavailable: string[];
  features: { id: string; name: string; status: "verified" | "declared" | "stale"; evidence: string | null }[];
  changedFacts?: string[];
  risks?: string[];
  confidence?: 'observed' | 'partial' | 'unknown';
  previousState?: string | null;
  recommendedNextAction?: string;
  healthFailureEpisode?: HealthFailureEpisode;
};
type HealthFailureEpisode = {
  binding: string;
  environment: 'development' | 'preview';
  deploymentId: string;
  build: string;
  lastReadAt: string;
  streak: { count: number; startedAt: string; firstEvidenceRef: string; lastAt: string; lastEvidenceRef: string } | null;
  finding: { id: string; openedAt: string; meetsFailureThreshold: boolean } | null;
};
export type ProjectRecord = { manifest: Manifest; intelligence: Intelligence | null; registeredAt: string };
export type Change = { id: string; projectId: string; createdAt: string; before: Intelligence | null; after: Intelligence; fields: string[] };

export class PieError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

export type IdentityRecord = { projectId: string; repository?: string; path?: string; urls?: string[]; domains?: string[] };
export type ProjectResolution = { status: 'new' | 'resolved' | 'conflict'; projectId: string | null; candidates: string[]; matches: { projectId: string; basis: string }[] };

/** Exact signals only. A conflicting declaration never transfers an existing identity. */
export function resolveProject(manifest: Manifest, registered: (Manifest | IdentityRecord)[]): ProjectResolution {
  const matches: ProjectResolution['matches'] = [];
  const incomingHosts = new Set([...manifest.domains, ...manifest.deployments.map(d => new URL(d.url).hostname)]);
  for (const entry of registered) {
    const row: IdentityRecord = 'source' in entry ? { projectId: entry.projectId, repository: entry.source.repository, path: entry.source.path, urls: entry.deployments.map(d => d.url), domains: entry.domains } : entry;
    const add = (basis: string) => matches.push({ projectId: row.projectId, basis });
    if (row.projectId === manifest.projectId) add('projectId');
    // Missing catalog paths are conservative repository matches, never inferred paths.
    if (row.repository?.toLowerCase() === manifest.source.repository.toLowerCase() && (row.path === undefined || row.path === manifest.source.path)) add('repository/path');
    for (const url of row.urls || []) {
      try { if (manifest.deployments.some(d => new URL(d.url).href === new URL(url).href)) add('deploymentUrl'); } catch { /* Unrecorded catalog URL. */ }
    }
    if (row.domains?.some(host => incomingHosts.has(host))) add('domain');
  }
  const candidates = [...new Set(matches.map(m => m.projectId))].sort();
  if (!candidates.length) return { status: 'new', projectId: manifest.projectId, candidates, matches };
  if (candidates.length === 1 && candidates[0] === manifest.projectId) return { status: 'resolved', projectId: manifest.projectId, candidates, matches };
  return { status: 'conflict', projectId: null, candidates, matches };
}

function reference(value: unknown): string { return `sha256:${createHash('sha256').update(stable(value) || 'null').digest('hex')}`; }
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new PieError("INVALID_MANIFEST", "Expected an object.");
  return v as Record<string, unknown>;
}
function text(v: unknown, label: string, max = 240): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new PieError("INVALID_MANIFEST", `${label} is required and must be at most ${max} characters.`);
  return v.trim();
}
function array(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v) || v.length > 50) throw new PieError("INVALID_MANIFEST", `${label} must be an array of at most 50 entries.`);
  return v;
}
function relativePath(v: unknown, label: string, nullable = false): string | null {
  if (nullable && v === null) return null;
  if (typeof v !== "string" || v.length > 240 || /[\\?#\s]/.test(v) || v.split("/").includes("..")) throw new PieError("INVALID_MANIFEST", `${label} must be a relative path without traversal.`);
  return v;
}
export function publicUrl(v: unknown): URL {
  let url: URL;
  try { url = new URL(text(v, "url", 500)); } catch { throw new PieError("INVALID_MANIFEST", "A valid HTTPS URL is required."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || /^(localhost|.*\.localhost|.*\.local)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) {
    throw new PieError("INVALID_MANIFEST", "URLs must use public HTTPS hostnames without credentials, query, fragment, or a custom port.");
  }
  return url;
}
export function parseManifest(v: unknown): Manifest {
  const m = object(v), s = object(m.source), tip = object(m.tip);
  if (m.schemaVersion !== "truaxiom-app-manifest-v1" || s.provider !== "github") throw new PieError("INVALID_MANIFEST", "Manifest v1 and GitHub source are required.");
  const projectId = text(m.projectId, "projectId"), productId = text(m.productId, "productId");
  if (!/^PRJ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(projectId) || !/^PROD-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(productId)) throw new PieError("INVALID_MANIFEST", "Use shared PRJ-* and PROD-* IDs.");
  const repository = text(s.repository, "repository"), ref = text(s.ref, "ref");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || /[\s?#\\]/.test(ref)) throw new PieError("INVALID_MANIFEST", "Invalid repository or ref.");
  const deployments = array(m.deployments, "deployments").map((v): Manifest["deployments"][number] => {
    const d = object(v), surface = d.surface;
    if (surface !== "candidate" && surface !== "production") throw new PieError("INVALID_MANIFEST", "Deployment surface must be explicit.");
    const url = publicUrl(d.url).toString().replace(/\/$/, "");
    const healthPath = relativePath(d.healthPath, "healthPath")!;
    const buildPath = relativePath(d.buildPath, "buildPath", true);
    if (!healthPath.startsWith("/") || healthPath.startsWith("//") || (buildPath !== null && (!buildPath.startsWith("/") || buildPath.startsWith("//")))) throw new PieError("INVALID_MANIFEST", "Health and build paths must begin with a single /.");
    return { id: text(d.id, "deployment id"), surface, url, healthPath, buildPath };
  });
  const capabilities = array(m.capabilities, "capabilities").map(v => {
    const c = object(v), evidencePath = relativePath(c.evidencePath, "evidencePath", true);
    if (evidencePath && evidencePath.startsWith("/")) throw new PieError("INVALID_MANIFEST", "Capability evidencePath is repository-relative.");
    // Attestations are produced after testing a commit; they cannot contain their own Git SHA.
    // Keep the report independently pinned while requiring it to identify the tested source.
    if (c.evidenceRef !== undefined && (typeof c.evidenceRef !== "string" || !/^[a-f0-9]{40}$/.test(c.evidenceRef) || !evidencePath)) throw new PieError("INVALID_MANIFEST", "evidenceRef requires an evidencePath and a full immutable Git commit.");
    return { id: text(c.id, "capability id"), name: text(c.name, "capability name"), evidencePath, ...(c.evidenceRef !== undefined ? { evidenceRef: c.evidenceRef as string } : {}) };
  });
  for (const ids of [deployments.map(d => d.id), capabilities.map(c => c.id)]) if (new Set(ids).size !== ids.length) throw new PieError("INVALID_MANIFEST", "IDs must be unique within deployments and capabilities.");
  const domains = array(m.domains, "domains").map(v => { const host = text(v, "domain"); if (publicUrl(`https://${host}`).hostname !== host) throw new PieError("INVALID_MANIFEST", "Use lowercase domain names without paths."); return host; });
  if (typeof tip.registry !== "boolean") throw new PieError("INVALID_MANIFEST", "tip.registry must be a boolean.");
  return {
    schemaVersion: "truaxiom-app-manifest-v1", projectId, productId, name: text(m.name, "name"), description: text(m.description, "description", 2000),
    source: { provider: "github", repository, ref, path: relativePath(s.path, "source.path")!, manifestPath: relativePath(s.manifestPath, "manifestPath", true) },
    deployments, domains, capabilities,
    dependencies: array(m.dependencies, "dependencies").map(v => text(v, "dependency")),
    tip: { registry: tip.registry, integrationPoints: array(tip.integrationPoints, "integrationPoints").map(v => text(v, "integration point")) },
  };
}

function reconcileHealthFailure(
  manifest: Manifest, after: Intelligence, previous: Intelligence | null, target: string,
): HealthFailureEpisode | undefined {
  const [projectId, environment, deploymentId, extra] = target.split('/');
  if (projectId !== manifest.projectId || extra !== undefined || (environment !== 'development' && environment !== 'preview')) return;
  const deployment = manifest.deployments.find(d => d.surface === 'candidate' && d.id === deploymentId);
  if (!deployment?.buildPath) return;
  const endpoint = new URL(deployment.healthPath, deployment.url).href;
  const binding = reference([projectId, manifest.productId, environment, manifest.source, deployment]);
  const old = previous?.healthFailureEpisode;
  const current = old?.binding === binding ? old : undefined;
  const now = Date.parse(after.checkedAt);
  if (!Number.isFinite(now) || (current && now <= Date.parse(current.lastReadAt))) return current;
  const fresh = (fact: Fact | undefined, source: string): fact is Fact => fact?.status === 'verified' &&
    !fact.conflict && fact.source === source && fact.observedAt === after.checkedAt;
  const health = after.facts[`health.${deploymentId}.ok`];
  const identity = after.facts[`health.${deploymentId}.identity`];
  const build = after.facts[`deployment.${deploymentId}.sha`];
  if (after.conflicts.length || !fresh(health, endpoint) || !fresh(identity, endpoint) || identity.value !== projectId ||
      !fresh(build, new URL(deployment.buildPath, deployment.url).href) ||
      typeof build.value !== 'string' || !/^[a-f0-9]{40}$/.test(build.value) ||
      typeof health.value !== 'boolean' || !health.evidenceRef) {
    if (!current?.finding) return;
    return { ...current, lastReadAt: after.checkedAt, streak: null, finding: { ...current.finding, meetsFailureThreshold: false } };
  }
  if (health.value) return { binding, environment, deploymentId, build: build.value, lastReadAt: after.checkedAt, streak: null, finding: null };
  const sameBuild = current?.build === build.value ? current : undefined;
  const prior = sameBuild?.streak;
  if (sameBuild && prior && now - Date.parse(prior.lastAt) < 10 * 60_000) return { ...sameBuild, lastReadAt: after.checkedAt };
  const streak = {
    count: Math.min((prior?.count ?? 0) + 1, 3),
    startedAt: prior?.startedAt ?? after.checkedAt,
    firstEvidenceRef: prior?.firstEvidenceRef ?? health.evidenceRef,
    lastAt: after.checkedAt,
    lastEvidenceRef: health.evidenceRef,
  };
  const open = sameBuild?.finding;
  const finding = open || streak.count >= 2 ? {
    id: open?.id ?? `health:${reference([binding, build.value, streak.startedAt])}`,
    openedAt: open?.openedAt ?? after.checkedAt,
    meetsFailureThreshold: streak.count >= 3 && now - Date.parse(streak.startedAt) >= 30 * 60_000,
  } : null;
  return { binding, environment, deploymentId, build: build.value, lastReadAt: after.checkedAt, streak, finding };
}

export function reconcile(manifest: Manifest, evidence: Evidence[], previous: Intelligence | null, now: string, healthTarget = ''): Intelligence {
  const facts: Record<string, Fact> = {}, unavailable: string[] = [], conflicts: string[] = [];
  // Only facts about currently declared interfaces may survive failed reads.
  for (const e of evidence) {
    if (e.status === "verified") facts[e.key] = { value: e.value, source: e.source, observedAt: e.observedAt, status: "verified", sourceType: e.kind, verifier: 'pie-evidence-v1', evidenceRef: reference(e), confidence: e.kind === 'manifest' ? 'declared' : 'observed', conflict: false };
    else {
      unavailable.push(e.key);
      const old = previous?.facts[e.key];
      if (old && old.source === e.source) facts[e.key] = { ...old, status: "stale" };
    }
  }
  const source = facts["source.sha"];
  for (const d of manifest.deployments) {
    const build = facts[`deployment.${d.id}.sha`], identity = facts[`health.${d.id}.identity`];
    const descendant = facts[`deployment.${d.id}.lineage`]?.status === "verified" && facts[`deployment.${d.id}.lineage`]?.value === "descendant";
    // A descendant is ahead of the declared ref. That is not a conflict and it is not in sync.
    if (source?.status === "verified" && build?.status === "verified" && source.value !== build.value && !descendant) conflicts.push(`${d.id}: deployed commit differs from the declared source ref.`);
    if (identity?.status === "verified" && identity.value !== manifest.projectId) conflicts.push(`${d.id}: health Project ID does not match ${manifest.projectId}.`);
    if (identity?.status === 'verified' && identity.value !== manifest.projectId) identity.conflict = true;
    if (source?.status === 'verified' && build?.status === 'verified' && source.value !== build.value && !descendant) { source.conflict = true; build.conflict = true; }
  }
  const features = manifest.capabilities.map(c => {
    const f = facts[`capability.${c.id}`];
    return { id: c.id, name: c.name, status: f?.status === "verified" && f.value === true ? "verified" as const : f?.status === "stale" ? "stale" as const : "declared" as const, evidence: f?.source || null };
  });
  const risks = manifest.deployments.filter(d => facts[`health.${d.id}.ok`]?.status === 'verified' && facts[`health.${d.id}.ok`].value === false).map(d => `${d.id}: health endpoint reports unhealthy.`);
  const after: Intelligence = { projectId: manifest.projectId, productId: manifest.productId, name: manifest.name, checkedAt: now, facts, conflicts, unavailable: [...new Set(unavailable)].sort(), features, risks,
    confidence: !Object.values(facts).some(f => f.sourceType !== 'manifest') ? 'unknown' : unavailable.length ? 'partial' : 'observed',
    previousState: previous ? reference(previous) : null,
    recommendedNextAction: risks[0] ? `Inspect ${risks[0]} Recheck after an authorized correction.` : conflicts[0] || (unavailable.length ? 'Recheck unavailable evidence; retain unknown or stale values.' : 'Review current source, deployment and feature evidence.'),
  };
  const episode = reconcileHealthFailure(manifest, after, previous, healthTarget);
  if (episode) after.healthFailureEpisode = episode;
  after.changedFacts = meaningfulFields(previous, after);
  return after;
}
export function productionSyncStatus(manifest: Manifest, intelligence: Intelligence | null): ProductionSyncStatus {
  if (!intelligence) return "UNVERIFIED";
  const deployment = manifest.deployments.find(d => d.surface === "production") || manifest.deployments[0];
  const source = intelligence.facts["source.sha"];
  const build = deployment ? intelligence.facts[`deployment.${deployment.id}.sha`] : undefined;
  const lineage = deployment ? intelligence.facts[`deployment.${deployment.id}.lineage`] : undefined;
  const ahead = Boolean(deployment && source?.status === "verified" && build?.status === "verified" && source.value !== build.value && lineage?.status === "verified" && lineage.value === "descendant");
  // A descendant with another conflict stays ahead and names that conflict. It does not collapse to MISMATCH.
  if (ahead && intelligence.conflicts.length) return `AHEAD + MISMATCH: ${intelligence.conflicts.join("; ")}`;
  if (intelligence.conflicts.length) return "MISMATCH";
  if (!deployment || source?.status !== "verified" || build?.status !== "verified") return "UNVERIFIED";
  if (source.value === build.value) return "IN SYNC";
  if (ahead) return "AHEAD";
  return "MISMATCH";
}
export function meaningfulFields(before: Intelligence | null, after: Intelligence): string[] {
  const fields: string[] = [];
  for (const key of new Set([...Object.keys(before?.facts || {}), ...Object.keys(after.facts)])) {
    const a = before?.facts[key], b = after.facts[key];
    if (stable(a && [a.value, a.source, a.status]) !== stable(b && [b.value, b.source, b.status])) fields.push(key);
  }
  for (const key of ["name", "productId", "conflicts", "unavailable", "features"] as const) if (stable(before?.[key]) !== stable(after[key])) fields.push(key);
  if (stable(before?.healthFailureEpisode?.finding ?? null) !== stable(after.healthFailureEpisode?.finding ?? null)) fields.push('healthFailureEpisode');
  return fields.sort();
}
export function stable(value: unknown): string | undefined {
  if (Array.isArray(value)) return JSON.stringify(value.map(v => stable(v)));
  if (value && typeof value === "object") return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return JSON.stringify(value);
}

