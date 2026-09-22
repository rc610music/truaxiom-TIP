import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decideReviewQueueItem,
  getApiBaseUrl,
  loadMissionControlApiBridge,
  type MissionControlApiBridge,
  type ReviewDecisionAction
} from "./apiClient";

type LooseRecord = Record<string, any>;

const defaultBridge: MissionControlApiBridge = { connected: false };

const navItems = [
  "Command Deck",
  "System Map",
  "Review Queue",
  "RootWork Intel",
  "Runtime",
  "Next Build"
];

const pipelineStages = [
  {
    label: "Capture",
    title: "Sources flow in",
    note: "Websites, docs, repos, analytics, messages, product notes, and future connected tools."
  },
  {
    label: "Route",
    title: "TIP API gateway",
    note: "The API becomes the controlled doorway between Mission Control and platform intelligence."
  },
  {
    label: "Understand",
    title: "Knowledge + context",
    note: "Records become content maps, project state, recommendations, and next-action candidates."
  },
  {
    label: "Decide",
    title: "Founder approval",
    note: "Approve, defer, or reject before anything becomes permanent, published, or automated."
  },
  {
    label: "Remember",
    title: "Durable intelligence",
    note: "Registry v1 and review decisions stay in Postgres when the API persistence map says so."
  }
];

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? value as LooseRecord : {};
}

function asArray(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value as LooseRecord[] : [];
}

function firstText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function statusTone(status: unknown) {
  if (status === "approved") return "good";
  if (status === "rejected") return "danger";
  if (status === "deferred") return "warn";
  if (status === "needs_review") return "active";
  return "neutral";
}

function surfaceLabel(record: LooseRecord): string {
  if (record.recordSource === "durable") return "Durable / live";
  if (record.recordSource === "seed") return "Seed / demo";
  if (record.workflow || String(record.id ?? "").startsWith("TASK-FROM-") || String(record.id ?? "").startsWith("CONTENT-FROM-")) {
    return "Durable / live";
  }
  return "Seed / demo";
}

export function App() {
  const [apiBridge, setApiBridge] = useState<MissionControlApiBridge>(defaultBridge);
  const [decisionMessage, setDecisionMessage] = useState("Connect the API to activate review decisions from the browser.");
  const [activeDecisionItemId, setActiveDecisionItemId] = useState<string | null>(null);

  const refreshApiBridge = useCallback(async () => {
    const bridge = await loadMissionControlApiBridge();
    setApiBridge(bridge);
    return bridge;
  }, []);

  useEffect(() => {
    void refreshApiBridge();
  }, [refreshApiBridge]);

  const handleReviewDecision = useCallback(async (itemId: string, action: ReviewDecisionAction) => {
    setActiveDecisionItemId(itemId);
    setDecisionMessage(`Sending ${action} decision for ${itemId}...`);

    try {
      const result = await decideReviewQueueItem({
        itemId,
        action,
        note: `Mission Control dashboard ${action} action.`
      });

      const task = asRecord(result.task);
      const contentRecord = asRecord(result.contentRecord);
      const taskNote = typeof task.id === "string"
        ? ` Task ${task.id} is ${firstText(task.workflowStatus, "open")} on ${firstText(task.projectId, "its registry project")}.`
        : "";
      const contentNote = typeof contentRecord.id === "string"
        ? ` Content ${contentRecord.id} is stored once on ${firstText(contentRecord.projectId, "its registry project")}.`
        : "";
      setDecisionMessage(`${firstText(result.item?.title, itemId)} marked ${firstText(result.decision?.resultingStatus, action)}.${taskNote}${contentNote}`);
      await refreshApiBridge();
    } catch (error) {
      setDecisionMessage(error instanceof Error ? error.message : "Review decision failed.");
    } finally {
      setActiveDecisionItemId(null);
    }
  }, [refreshApiBridge]);

  const view = useMemo(() => {
    const snapshot = apiBridge.snapshot ?? {};
    const organization = asRecord(asArray(snapshot.organizations)[0]);
    const rootWorkContentMap = asRecord(apiBridge.rootWorkContentMap?.contentMap);
    const contentItems = asArray(rootWorkContentMap.items);
    const contentSummary = asRecord(apiBridge.rootWorkContentMap?.summary);
    const mockCrawl = asRecord(apiBridge.mockCrawl?.crawl);
    const extractedRecords = asArray(mockCrawl.records);
    const reviewQueue = asRecord(apiBridge.reviewQueue?.queue);
    const reviewItems = asArray(reviewQueue.items);
    const reviewSummary = asRecord(reviewQueue.summary);
    const decisions = asArray(apiBridge.reviewDecisions?.decisions);
    const recommendations = asArray(apiBridge.activeRecommendations ?? snapshot.recommendations);
    const tasks = asArray(snapshot.tasks);
    const approvedContent = asArray(apiBridge.approvedContent?.records);
    const projects = asArray(snapshot.projects);
    const products = asArray(snapshot.products);
    const readiness = apiBridge.organizationContext?.readiness ?? [];
    const ecosystemSources = asArray(apiBridge.ecosystemStatus?.sources);
    const ecosystemSummary = asRecord(apiBridge.ecosystemStatus?.summary);
    const registryProducts = asArray(apiBridge.registry?.products);
    const registryProjects = asArray(apiBridge.registry?.projects);
    const registrySource = firstText(apiBridge.registry?.source, apiBridge.registryError ? "unavailable" : "not-loaded");

    return {
      organizationName: firstText(organization.name, "TruaXiom"),
      organizationVision: firstText(organization.vision, "A business intelligence operating system for the TruaXiom ecosystem."),
      organizationDescription: firstText(organization.description, "Mission Control is becoming the visual command center for products, content, decisions, recommendations, and approvals."),
      products,
      projects,
      tasks,
      seedTasks: tasks.filter((task) => surfaceLabel(task) === "Seed / demo"),
      approvalTasks: tasks.filter((task) => surfaceLabel(task) === "Durable / live"),
      approvedContent,
      recommendations,
      contentItems,
      extractedRecords,
      reviewItems,
      reviewSummary,
      decisions,
      readiness,
      contentSummary,
      healthSummary: apiBridge.health?.summary ?? [],
      mode: apiBridge.health?.mode ?? apiBridge.health?.environment ?? "static-fallback",
      persistence: apiBridge.reviewQueue?.persistence ?? apiBridge.health?.persistence ?? "not-connected",
      reviewMode: apiBridge.reviewQueue?.mode ?? "static-fallback",
      ecosystemSources,
      ecosystemSummary,
      registryProducts,
      registryProjects,
      registrySource,
      registryError: apiBridge.registryError ?? apiBridge.registry?.error
    };
  }, [apiBridge]);

  const visibleReviewItems = view.reviewItems.slice(0, 5);
  const hasApi = apiBridge.connected;
  const apiBaseUrl = getApiBaseUrl();
  const reviewNeedCount = Number(view.reviewSummary.needsReview ?? view.reviewItems.length);
  const durableRegistry = view.registrySource === "postgres" || view.registrySource === "neon" || view.registrySource === "supabase";

  return (
    <main className="tip-dashboard">
      <aside className="visual-sidebar">
        <div className="brand-lockup">
          <span className="mark">TIP</span>
          <div>
            <strong>TruaXiom Mission Control</strong>
            <small>Command deck preview</small>
          </div>
        </div>

        <nav aria-label="Mission Control sections">
          {navItems.map((item, index) => (
            <button key={item} className={index === 0 ? "active" : ""}>{item}</button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className={`status-dot ${hasApi ? "online" : "offline"}`} />
          <div>
            <strong>{hasApi ? "API connected" : "Static fallback"}</strong>
            <small>{hasApi ? "Live bridge active" : "Waiting on Render API"}</small>
          </div>
        </div>
      </aside>

      <section className="visual-workspace">
        <div className="command-bar">
          <div>
            <span>TIP / Sprint 002</span>
            <strong>{view.organizationName} Intelligence Platform</strong>
          </div>
          <div className="command-bar-actions">
            <span className={`status-pill ${hasApi ? "good" : "warn"}`}>{hasApi ? "Live API" : "Preview Mode"}</span>
            <a className="mini-link" href={`${apiBaseUrl}/health`} target="_blank" rel="noreferrer">API Health</a>
          </div>
        </div>

        <header className="visual-hero">
          <div className="hero-card">
            <p className="eyebrow">Current Build Stage</p>
            <h1>Mission Control is online.</h1>
            <p>{view.organizationDescription}</p>
            <div className="hero-actions">
              <span>Frontend visible</span>
              <span>Live API connected</span>
              <span>Durable store prepared</span>
            </div>
          </div>
          <div className={`connection-orb ${hasApi ? "online" : "offline"}`}>
            <span>{hasApi ? "ONLINE" : "STATIC"}</span>
            <strong>{hasApi ? "API Connected" : "Fallback View"}</strong>
            <small>{apiBaseUrl}</small>
          </div>
        </header>

        <section className="metric-strip" aria-label="Mission Control metrics">
          <article>
            <span>{view.registryProducts.length}</span>
            <p>Registry products</p>
          </article>
          <article>
            <span>{reviewNeedCount}</span>
            <p>Needs review</p>
          </article>
          <article>
            <span>{view.extractedRecords.length}</span>
            <p>Records captured</p>
          </article>
          <article>
            <span>{view.recommendations.length}</span>
            <p>Next moves</p>
          </article>
          <article>
            <span>{view.decisions.length}</span>
            <p>Decisions logged</p>
          </article>
        </section>

        <section className="visual-grid">
          <article className="panel wide registry-panel" data-registry-source={view.registrySource}>
            <div className="panel-heading split-heading">
              <div>
                <p className="eyebrow">TIP Registry v1</p>
                <strong>Products and projects from {durableRegistry ? "Postgres" : view.registrySource}</strong>
              </div>
              <span className={`status-pill ${durableRegistry ? "good" : "warn"}`}>{view.registrySource}</span>
            </div>
            {view.registryError ? <div className="decision-note">{view.registryError}</div> : null}
            <div className="source-grid">
              {view.registryProducts.length === 0 ? (
                <div className="empty-card">Registry v1 is not loaded from the TIP API.</div>
              ) : view.registryProducts.map((product) => {
                const productId = String(product.id ?? product.name);
                const project = view.registryProjects.find((item) => item.productId === product.id);
                return (
                  <div className="source-card" key={productId}>
                    <div>
                      <span className={`status-pill ${product.status === "active" ? "good" : "neutral"}`}>{firstText(product.status, "registered")}</span>
                      <strong>{firstText(product.name, productId)}</strong>
                      <small>{productId} · {project ? String(project.id) : "no project row"}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel wide system-panel">
            <div className="panel-heading split-heading">
              <div>
                <p className="eyebrow">Live System Map</p>
                <strong>How TIP turns scattered work into command-center intelligence</strong>
              </div>
              <span className="status-pill active">Foundation loop</span>
            </div>
            <div className="system-flow">
              {pipelineStages.map((stage, index) => (
                <div className="flow-stage" key={stage.label}>
                  <div className="stage-number">{index + 1}</div>
                  <p>{stage.label}</p>
                  <strong>{stage.title}</strong>
                  <small>{stage.note}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide operations-panel">
            <div className="panel-heading split-heading">
              <div>
                <p className="eyebrow">Ecosystem Operations</p>
                <strong>Live registry + source health</strong>
              </div>
              <span className="status-pill good">{Number(view.ecosystemSummary.healthy ?? 0)} healthy</span>
            </div>
            <div className="source-grid">
              {view.ecosystemSources.map((source) => {
                const status = firstText(source.status, "degraded");
                const primaryLink = firstText(source.publicUrl, firstText(source.sourceUrl, firstText(source.adminUrl, "")));
                return (
                  <div className="source-card" key={String(source.id ?? source.name)}>
                    <div>
                      <span className={`status-pill ${status === "healthy" ? "good" : status === "authorization_required" ? "warn" : "danger"}`}>{status.replaceAll("_", " ")}</span>
                      <strong>{firstText(source.name, "Ecosystem source")}</strong>
                      <small>{firstText(source.kind, "source")} · {Number(source.httpStatus ?? 0) || "auth"}</small>
                    </div>
                    <div className="source-actions">
                      {primaryLink ? <a className="mini-link" href={primaryLink} target="_blank" rel="noreferrer">Open</a> : null}
                      {source.adminUrl && source.adminUrl !== primaryLink ? <a className="mini-link" href={String(source.adminUrl)} target="_blank" rel="noreferrer">Admin</a> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel review-panel priority-panel">
            <div className="panel-heading split-heading">
              <div>
                <p className="eyebrow">Human Approval Layer</p>
                <strong>Review Queue</strong>
              </div>
              <button className="refresh-button" onClick={() => void refreshApiBridge()}>Refresh</button>
            </div>
            <div className="mini-metrics">
              <span>{Number(view.reviewSummary.total ?? view.reviewItems.length)} total</span>
              <span>{reviewNeedCount} needs review</span>
              <span>{Number(view.reviewSummary.approved ?? 0)} approved</span>
              <span>{Number(view.reviewSummary.deferred ?? 0)} deferred</span>
            </div>
            <div className="decision-note">{decisionMessage}</div>
            <div className="stack">
              {visibleReviewItems.length === 0 ? (
                <div className="empty-card">Deploy or start the API to load the review queue.</div>
              ) : visibleReviewItems.map((item) => {
                const itemId = String(item.id ?? item.title);
                const status = firstText(item.status, "needs_review");
                const canDecide = hasApi && status !== "approved" && status !== "rejected";

                return (
                  <div className="review-card" key={itemId}>
                    <div className="review-card-main">
                      <span className={`status-pill ${statusTone(status)}`}>{status.replace("_", " ")}</span>
                      <strong>{firstText(item.title, "Review item")}</strong>
                      <p>{firstText(item.description, firstText(item.recommendedAction, "Review this item before it moves forward."))}</p>
                    </div>
                    <div className="decision-actions">
                      <button disabled={!canDecide || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "approve")}>Approve</button>
                      <button disabled={!canDecide || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "defer")}>Defer</button>
                      <button className="danger" disabled={!canDecide || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "reject")}>Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel runtime-panel">
            <div className="panel-heading">
              <p className="eyebrow">Runtime</p>
              <strong>Engine status</strong>
            </div>
            <div className="status-stack">
              <div className="status-row">
                <span>API</span>
                <strong>{hasApi ? "Connected" : "Offline / fallback"}</strong>
              </div>
              <div className="status-row">
                <span>Mode</span>
                <strong>{view.mode}</strong>
              </div>
              <div className="status-row">
                <span>Persistence</span>
                <strong>{view.persistence}</strong>
              </div>
              <div className="status-row">
                <span>Registry</span>
                <strong>{view.registrySource}</strong>
              </div>
              <div className="status-row">
                <span>Review</span>
                <strong>{view.reviewMode}</strong>
              </div>
              <div className="status-row">
                <span>Tasks</span>
                <strong>{firstText(apiBridge.health?.tasks?.source, "in-memory-seed")} · {Number(apiBridge.health?.tasks?.durableCount ?? 0)} durable</strong>
              </div>
              <div className="status-row">
                <span>Approved content</span>
                <strong>{firstText(apiBridge.health?.approvedContentRecords?.source, "in-memory-seed")} · {Number(apiBridge.health?.approvedContentRecords?.durableCount ?? 0)} durable</strong>
              </div>
            </div>
            <div className="mini-metrics vertical">
              {(view.healthSummary.length ? view.healthSummary : [apiBridge.error ?? "Render API is not connected yet."]).slice(0, 4).map((note) => <span key={note}>{note}</span>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">RootWork Intelligence</p>
              <strong>Content map snapshot</strong>
            </div>
            <div className="mini-metrics">
              <span>{Number(view.contentSummary.totalItems ?? view.contentItems.length)} items</span>
              <span>{Number(view.contentSummary.openGaps ?? 0)} gaps</span>
              <span>{Number(view.contentSummary.averageCoverageScore ?? 0)}% coverage</span>
            </div>
            <div className="stack compact">
              {view.contentItems.slice(0, 4).map((item) => (
                <div className="content-chip" key={String(item.id ?? item.title)}>
                  <strong>{firstText(item.title, "Content item")}</strong>
                  <span>Seed / demo · {firstText(item.lifecycleStatus, "mapped")}</span>
                </div>
              ))}
              {view.approvedContent.slice(0, 4).map((item) => (
                <div className="content-chip" key={String(item.id ?? item.title)}>
                  <strong>{firstText(item.title, "Approved content")}</strong>
                  <span>Durable / live · {firstText(item.section, firstText(item.workflowId, "approved"))}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Recommendations</p>
              <strong>TIP's next moves</strong>
            </div>
            <div className="stack compact">
              {view.recommendations.slice(0, 4).map((item) => (
                <div className="focus-card" key={String(item.id ?? item.name)}>
                  <strong>{firstText(item.name, "Recommendation")}</strong>
                  <p>{firstText(item.expectedImpact, firstText(item.rationale, "Recommendation awaiting context."))}</p>
                </div>
              ))}
              {view.seedTasks.slice(0, 3).map((task) => (
                <div className="focus-card" key={String(task.id)}>
                  <strong>{firstText(task.name, "Seed task")}</strong>
                  <p>Seed / demo · {String(task.id)} · {firstText(task.projectId, "PRJ-SPRINT-002")}</p>
                </div>
              ))}
              {view.approvalTasks.slice(0, 4).map((task) => {
                const workflow = asRecord(task.workflow);
                const evidence = Array.isArray(task.evidence) ? task.evidence.map(String) : [];
                return (
                  <div className="focus-card" key={String(task.id)}>
                    <strong>{firstText(task.name, "Approved task")}</strong>
                    <p>
                      Durable / live · {String(task.id)} · {firstText(task.projectId, "registry project pending")} · {firstText(task.assignedTo, "unassigned")} · {firstText(workflow.status, firstText(task.workflowStatus, "ready"))}
                    </p>
                    {evidence[0] ? <p>{evidence[0]}</p> : null}
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel next-panel">
            <div className="panel-heading">
              <p className="eyebrow">Next Stage</p>
              <strong>Make the command deck operational</strong>
            </div>
            <ol className="next-list">
              <li>Attach the managed Postgres connection to the Render API.</li>
              <li>Authorize Google Drive for private document ingestion.</li>
              <li>Promote approved recommendations into executable, logged tasks.</li>
              <li>Turn RootWork ingestion from mock records into controlled live crawling.</li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
