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

const pipelineStages = [
  {
    label: "Sources",
    title: "RootWork + TruaXiom data",
    note: "Seed data, future websites, docs, repos, analytics, and connected tools."
  },
  {
    label: "API",
    title: "TIP local gateway",
    note: "Routes requests, serves the current snapshot, and keeps the UI decoupled from storage."
  },
  {
    label: "Intelligence",
    title: "Content map + recommendations",
    note: "Organizes extracted records into reviewable gaps, tasks, and next moves."
  },
  {
    label: "Review",
    title: "Founder approval layer",
    note: "Approve, defer, or reject before anything becomes permanent or automated."
  },
  {
    label: "Persistence",
    title: "Local now, Postgres next",
    note: "Local memory today; Neon/Postgres or Supabase when a connection string is ready."
  }
];

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? value as LooseRecord : {};
}

function asArray(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value as LooseRecord[] : [];
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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

export function App() {
  const [apiBridge, setApiBridge] = useState<MissionControlApiBridge>(defaultBridge);
  const [decisionMessage, setDecisionMessage] = useState("Run the local API to activate review decisions.");
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
        note: `Mission Control visual dashboard ${action} action.`
      });

      setDecisionMessage(`${result.item?.title ?? itemId} marked ${result.decision?.resultingStatus ?? action}.`);
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
    const projects = asArray(snapshot.projects);
    const products = asArray(snapshot.products);
    const readiness = apiBridge.organizationContext?.readiness ?? [];

    return {
      organizationName: firstText(organization.name, "TruaXiom"),
      organizationVision: firstText(organization.vision, "A business intelligence operating system for the TruaXiom ecosystem."),
      organizationDescription: firstText(organization.description, "Mission Control is becoming the visual command center for products, content, decisions, recommendations, and approvals."),
      products,
      projects,
      tasks,
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
      persistence: apiBridge.reviewQueue?.persistence ?? "not-connected",
      reviewMode: apiBridge.reviewQueue?.mode ?? "static-fallback"
    };
  }, [apiBridge]);

  const visibleReviewItems = view.reviewItems.slice(0, 6);
  const hasApi = apiBridge.connected;

  return (
    <main className="tip-dashboard">
      <aside className="visual-sidebar">
        <div className="brand-lockup">
          <span className="mark">TIP</span>
          <div>
            <strong>Mission Control</strong>
            <small>Visual build preview</small>
          </div>
        </div>

        <nav>
          {[
            "System Map",
            "Review Queue",
            "RootWork Intelligence",
            "Runtime",
            "Next Build"
          ].map((item, index) => (
            <button key={item} className={index === 0 ? "active" : ""}>{item}</button>
          ))}
        </nav>
      </aside>

      <section className="visual-workspace">
        <header className="visual-hero">
          <div>
            <p className="eyebrow">Current Build Stage</p>
            <h1>TIP is becoming visible.</h1>
            <p>{view.organizationDescription}</p>
          </div>
          <div className={`connection-orb ${hasApi ? "online" : "offline"}`}>
            <span>{hasApi ? "ONLINE" : "STATIC"}</span>
            <strong>{hasApi ? "API Connected" : "Fallback View"}</strong>
            <small>{getApiBaseUrl()}</small>
          </div>
        </header>

        <section className="metric-strip">
          <article>
            <span>{view.products.length}</span>
            <p>Products</p>
          </article>
          <article>
            <span>{view.reviewItems.length}</span>
            <p>Review Items</p>
          </article>
          <article>
            <span>{view.extractedRecords.length}</span>
            <p>Extracted Records</p>
          </article>
          <article>
            <span>{view.recommendations.length}</span>
            <p>Recommendations</p>
          </article>
          <article>
            <span>{view.decisions.length}</span>
            <p>Decisions</p>
          </article>
        </section>

        <section className="visual-grid">
          <article className="panel wide">
            <div className="panel-heading">
              <p className="eyebrow">Live System Map</p>
              <strong>What we actually built so far</strong>
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

          <article className="panel">
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
                <span>Review Mode</span>
                <strong>{view.reviewMode}</strong>
              </div>
            </div>
            <div className="mini-metrics">
              {view.healthSummary.slice(0, 4).map((note) => <span key={note}>{note}</span>)}
            </div>
          </article>

          <article className="panel review-panel">
            <div className="panel-heading split-heading">
              <div>
                <p className="eyebrow">Human Approval Layer</p>
                <strong>Review Queue</strong>
              </div>
              <button className="refresh-button" onClick={() => void refreshApiBridge()}>Refresh</button>
            </div>
            <div className="mini-metrics">
              <span>{Number(view.reviewSummary.total ?? view.reviewItems.length)} total</span>
              <span>{Number(view.reviewSummary.needsReview ?? view.reviewItems.length)} needs review</span>
              <span>{Number(view.reviewSummary.approved ?? 0)} approved</span>
              <span>{Number(view.reviewSummary.deferred ?? 0)} deferred</span>
            </div>
            <div className="decision-note">{decisionMessage}</div>
            <div className="stack">
              {visibleReviewItems.length === 0 ? (
                <div className="empty-card">Start the local API to load the review queue.</div>
              ) : visibleReviewItems.map((item) => {
                const itemId = String(item.id ?? item.title);
                const status = firstText(item.status, "needs_review");
                const canDecide = hasApi && status !== "approved" && status !== "rejected";

                return (
                  <div className="review-card" key={itemId}>
                    <div className="review-card-main">
                      <span className={`status-pill ${statusTone(status)}`}>{status}</span>
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
              {view.contentItems.slice(0, 5).map((item) => (
                <div className="content-chip" key={String(item.id ?? item.title)}>
                  <strong>{firstText(item.title, "Content item")}</strong>
                  <span>{firstText(item.lifecycleStatus, "mapped")}</span>
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
            </div>
          </article>

          <article className="panel next-panel">
            <div className="panel-heading">
              <p className="eyebrow">Next Stage</p>
              <strong>Make it accessible</strong>
            </div>
            <ol className="next-list">
              <li>Publish a visual preview so you can open Mission Control in a browser.</li>
              <li>Keep the local API/review loop underneath it.</li>
              <li>Connect durable persistence once Neon or Supabase is ready.</li>
              <li>Turn RootWork ingestion from mock records into controlled live crawling.</li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
