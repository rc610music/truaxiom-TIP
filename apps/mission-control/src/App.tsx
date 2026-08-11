import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activity as staticActivity,
  buildMissionControlViewState,
  buildOrganizationContextPacket,
  createMockCrawlResult,
  getActiveRecommendations,
  getContentMapSummary,
  getPriorityContentGaps,
  ingestionSources,
  modules,
  organization as staticOrganization,
  products as staticProducts,
  projects as staticProjects,
  recommendations as staticRecommendations,
  rootWorkContentMap as staticRootWorkContentMap,
  rootWorkContentSections,
  sortRecommendationsForMissionControl,
  sortTasksForMissionControl,
  summarizeCrawlResult,
  tasks as staticTasks,
  agents,
  knowledgeObjects
} from "@truaxiom/core";
import {
  decideReviewQueueItem,
  getApiBaseUrl,
  loadMissionControlApiBridge,
  summarizeSnapshot,
  type MissionControlApiBridge,
  type ReviewDecisionAction
} from "./apiClient";

type LooseRecord = Record<string, any>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? value as LooseRecord : {};
}

function asArray(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value as LooseRecord[] : [];
}

function valueOr<T>(value: unknown, fallback: T): T {
  return value === undefined || value === null ? fallback : value as T;
}

const fallbackRootWorkSource = ingestionSources.find((source) => source.id === "SRC-ROOTWORK-WEBSITE");
const fallbackMockCrawl = fallbackRootWorkSource ? createMockCrawlResult(fallbackRootWorkSource) : null;
const fallbackContentSummary = getContentMapSummary(staticRootWorkContentMap);
const fallbackPriorityGaps = getPriorityContentGaps(staticRootWorkContentMap);
const fallbackRecommendations = sortRecommendationsForMissionControl(getActiveRecommendations(staticRecommendations));
const fallbackTasks = sortTasksForMissionControl(staticTasks);
const fallbackContextPacket = buildOrganizationContextPacket({
  organization: staticOrganization,
  products: staticProducts,
  projects: staticProjects,
  agents,
  modules,
  knowledgeObjects,
  tasks: staticTasks,
  recommendations: staticRecommendations,
  activity: staticActivity,
  graph: { nodes: [], edges: [], knowledgeObjects }
});
const fallbackMissionViewState = buildMissionControlViewState({
  context: fallbackContextPacket,
  contentMap: staticRootWorkContentMap,
  activeSprintId: "SPRINT-002"
});

export function App() {
  const [apiBridge, setApiBridge] = useState<MissionControlApiBridge>({ connected: false });
  const [decisionMessage, setDecisionMessage] = useState<string>("No review action taken yet.");
  const [activeDecisionItemId, setActiveDecisionItemId] = useState<string | null>(null);

  const refreshApiBridge = useCallback(async () => {
    const bridge = await loadMissionControlApiBridge();
    setApiBridge(bridge);
    return bridge;
  }, []);

  useEffect(() => {
    let active = true;

    loadMissionControlApiBridge().then((bridge) => {
      if (!active) return;
      setApiBridge(bridge);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleReviewDecision = useCallback(async (itemId: string, action: ReviewDecisionAction) => {
    setActiveDecisionItemId(itemId);
    setDecisionMessage(`Sending ${action} decision for ${itemId}...`);

    try {
      const result = await decideReviewQueueItem({
        itemId,
        action,
        note: `Mission Control local ${action} action.`
      });

      setApiBridge((current) => ({
        ...current,
        connected: true,
        reviewQueue: {
          queue: result.queue,
          summary: result.summary,
          mode: result.mode,
          persistence: result.persistence
        }
      }));

      setDecisionMessage(`${result.item?.title ?? itemId} marked ${result.decision?.resultingStatus ?? action} in local simulated mode.`);
      await refreshApiBridge();
    } catch (error) {
      setDecisionMessage(error instanceof Error ? error.message : "Review decision failed.");
    } finally {
      setActiveDecisionItemId(null);
    }
  }, [refreshApiBridge]);

  const view = useMemo(() => {
    const snapshot = apiBridge.snapshot ?? {};
    const organization = asRecord(asArray(snapshot.organizations)[0]) || staticOrganization;
    const products = asArray(snapshot.products);
    const projects = asArray(snapshot.projects);
    const tasks = asArray(snapshot.tasks);
    const recommendations = asArray(apiBridge.activeRecommendations?.length ? apiBridge.activeRecommendations : snapshot.recommendations);
    const activity = asArray(snapshot.activity);

    const contentMapPayload = apiBridge.rootWorkContentMap ?? {};
    const contentMap = asRecord(contentMapPayload.contentMap);
    const contentItems = asArray(contentMap.items).length ? asArray(contentMap.items) : staticRootWorkContentMap.items;
    const contentSummary = asRecord(contentMapPayload.summary);
    const priorityGaps = asArray(contentMapPayload.priorityGaps).length ? asArray(contentMapPayload.priorityGaps) : fallbackPriorityGaps;

    const mockCrawl = asRecord(apiBridge.mockCrawl?.crawl);
    const extractedRecords = asArray(mockCrawl.records).length ? asArray(mockCrawl.records) : fallbackMockCrawl?.records ?? [];
    const crawlSummary = apiBridge.mockCrawl?.summary?.length ? apiBridge.mockCrawl.summary : fallbackMockCrawl ? summarizeCrawlResult(fallbackMockCrawl) : [];
    const candidates = asArray(apiBridge.mockCrawl?.candidates);
    const proposedGaps = asArray(apiBridge.mockCrawl?.proposedGaps);

    const reviewQueue = asRecord(apiBridge.reviewQueue?.queue);
    const reviewItems = asArray(reviewQueue.items);
    const reviewSummary = asRecord(reviewQueue.summary);

    return {
      organization,
      products: products.length ? products : staticProducts,
      projects: projects.length ? projects : staticProjects,
      tasks: tasks.length ? tasks : fallbackTasks,
      recommendations: recommendations.length ? recommendations : fallbackRecommendations,
      activity: activity.length ? activity : staticActivity,
      contentItems,
      contentSummary: {
        totalItems: valueOr<number>(contentSummary.totalItems, fallbackContentSummary.totalItems),
        mappedItems: valueOr<number>(contentSummary.mappedItems, fallbackContentSummary.mappedItems),
        needsReview: valueOr<number>(contentSummary.needsReview, fallbackContentSummary.needsReview),
        openGaps: valueOr<number>(contentSummary.openGaps, fallbackContentSummary.openGaps),
        clusters: valueOr<number>(contentSummary.clusters, fallbackContentSummary.clusters),
        averageCoverageScore: valueOr<number>(contentSummary.averageCoverageScore, fallbackContentSummary.averageCoverageScore)
      },
      priorityGaps,
      extractedRecords,
      crawlSummary,
      candidates,
      proposedGaps,
      reviewItems,
      reviewSummary,
      reviewMode: apiBridge.reviewQueue?.mode ?? "static-fallback",
      reviewPersistence: apiBridge.reviewQueue?.persistence ?? "none",
      readiness: apiBridge.organizationContext?.readiness?.length ? apiBridge.organizationContext.readiness : ["Static fallback is active until the local API is running."],
      navItems: fallbackMissionViewState.navItems,
      systemReadiness: fallbackMissionViewState.systemReadiness,
      snapshotSummary: apiBridge.snapshot ? summarizeSnapshot(apiBridge.snapshot) : []
    };
  }, [apiBridge]);

  const reviewItemsForDisplay = (view.reviewItems.length ? view.reviewItems : view.priorityGaps).slice(0, 5);

  return (
    <main className="tip-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="mark">TIP</span>
          <div>
            <strong>Mission Control</strong>
            <small>TruaXiom Intelligence Platform</small>
          </div>
        </div>

        <nav>
          {view.navItems.map((item) => (
            <button key={item} className={item === "Home" ? "active" : ""}>{item}</button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Organization</p>
            <h1>{view.organization.name ?? staticOrganization.name}</h1>
          </div>
          <div className="command-bar">Search products, docs, agents, tasks…</div>
        </header>

        <section className="hero-grid">
          <article className="panel large">
            <p className="eyebrow">Organizational Context</p>
            <h2>{view.organization.vision ?? staticOrganization.vision}</h2>
            <p>{view.organization.description ?? staticOrganization.description}</p>
          </article>

          <article className="panel metric">
            <span>{view.contentSummary.totalItems}</span>
            <p>RootWork Items</p>
          </article>

          <article className="panel metric">
            <span>{view.reviewItems.length}</span>
            <p>Review Items</p>
          </article>

          <article className="panel metric">
            <span>{view.extractedRecords.length}</span>
            <p>Extracted Records</p>
          </article>

          <article className="panel metric">
            <span>{view.recommendations.length}</span>
            <p>Recommendations</p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Runtime</p>
              <strong>Local API Bridge</strong>
            </div>
            <div className="focus-card">
              <h3>{apiBridge.connected ? "API Connected" : "Static Fallback Active"}</h3>
              <p>{apiBridge.connected ? `${apiBridge.health?.service} is running in ${apiBridge.health?.environment ?? apiBridge.health?.mode} mode.` : "Mission Control is still usable from local seed data while the API is offline."}</p>
              <small>{apiBridge.health?.status ?? apiBridge.error ?? "waiting for local API"}</small>
            </div>
            <div className="mini-metrics api-metrics">
              <span>{getApiBaseUrl()}</span>
              {view.snapshotSummary.map((note) => <span key={note}>{note}</span>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Review Queue</p>
              <strong>Human Approval Layer</strong>
            </div>
            <div className="mini-metrics">
              <span>{valueOr<number>(view.reviewSummary.total, view.reviewItems.length)} total</span>
              <span>{valueOr<number>(view.reviewSummary.needsReview, view.reviewItems.length)} needs review</span>
              <span>{valueOr<number>(view.reviewSummary.approved, 0)} approved</span>
              <span>{valueOr<number>(view.reviewSummary.deferred, 0)} deferred</span>
              <span>{view.reviewMode}</span>
              <span>{view.reviewPersistence}</span>
            </div>
            <div className="decision-note">{decisionMessage}</div>
            <div className="stack">
              {reviewItemsForDisplay.map((item) => {
                const itemId = String(item.id ?? item.title);
                const isActionable = apiBridge.connected && item.status !== "approved" && item.status !== "rejected";

                return (
                  <div className="review-card" key={itemId}>
                    <div className="review-card-main">
                      <strong>{item.title}</strong>
                      <p>{item.description ?? item.recommendedAction}</p>
                      <small>{item.status ?? item.priority ?? "review"}</small>
                    </div>
                    <div className="decision-actions">
                      <button className="decision-button" disabled={!isActionable || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "approve")}>Approve</button>
                      <button className="decision-button" disabled={!isActionable || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "defer")}>Defer</button>
                      <button className="decision-button danger" disabled={!isActionable || activeDecisionItemId === itemId} onClick={() => handleReviewDecision(itemId, "reject")}>Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">RootWork</p>
              <strong>Content Map</strong>
            </div>
            <div className="mini-metrics">
              <span>{view.contentSummary.mappedItems} mapped</span>
              <span>{view.contentSummary.needsReview} review</span>
              <span>{view.contentSummary.clusters} clusters</span>
              <span>{view.contentSummary.averageCoverageScore}% coverage</span>
            </div>
            <div className="stack">
              {view.contentItems.map((item) => (
                <div className="row-card" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.primaryTopic}</p>
                  </div>
                  <span>{item.lifecycleStatus}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Crawler Adapter</p>
              <strong>Extracted Records</strong>
            </div>
            <div className="mini-metrics">
              {view.crawlSummary.map((note) => <span key={note}>{note}</span>)}
            </div>
            <div className="stack">
              {view.extractedRecords.map((record) => (
                <div className="row-card" key={record.id}>
                  <div>
                    <strong>{record.title}</strong>
                    <p>{record.excerpt}</p>
                  </div>
                  <span>{record.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Content Intelligence</p>
              <strong>Priority Gaps</strong>
            </div>
            <div className="stack">
              {view.priorityGaps.map((gap) => (
                <div className="focus-card" key={gap.id}>
                  <h3>{gap.title}</h3>
                  <p>{gap.description}</p>
                  <small>{gap.priority} priority · {gap.gapType}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Recommendations</p>
              <strong>What TIP Thinks Comes Next</strong>
            </div>
            <div className="stack">
              {view.recommendations.map((recommendation) => (
                <div className="focus-card" key={recommendation.id}>
                  <h3>{recommendation.name}</h3>
                  <p>{recommendation.expectedImpact ?? recommendation.rationale}</p>
                  <small>{recommendation.priority} priority · {recommendation.confidence} confidence</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Tasks</p>
              <strong>Sprint 002 Queue</strong>
            </div>
            <div className="stack">
              {view.tasks.map((task) => (
                <div className="row-card" key={task.id}>
                  <div>
                    <strong>{task.name}</strong>
                    <p>{task.description}</p>
                  </div>
                  <span>{task.workflowStatus}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">RootWork</p>
              <strong>Ingestion Targets</strong>
            </div>
            <div className="stack">
              {rootWorkContentSections.map((section) => (
                <div className="row-card" key={section.id}>
                  <div>
                    <strong>{section.label}</strong>
                    <p>{section.purpose}</p>
                  </div>
                  <span>{section.pathHint}</span>
                </div>
              ))}
            </div>
            <p className="fine-print">Source: {fallbackRootWorkSource?.url}</p>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Platform Systems</p>
              <strong>Readiness Stack</strong>
            </div>
            <div className="stack">
              {view.systemReadiness.map((item) => (
                <div className="row-card" key={item.system}>
                  <div>
                    <strong>{item.system}</strong>
                    <p>{item.note}</p>
                  </div>
                  <span>{item.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Readiness</p>
              <strong>Context Packet</strong>
            </div>
            <ul className="status-list">
              {view.readiness.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Activity</p>
              <strong>Recent Events</strong>
            </div>
            <div className="stack">
              {view.activity.map((event) => (
                <div className="activity-item" key={event.id}>
                  <strong>{event.label}</strong>
                  <p>{event.description}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
