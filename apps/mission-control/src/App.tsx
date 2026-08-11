import { useEffect, useState } from "react";
import {
  activity,
  agents,
  buildMissionControlViewState,
  buildOrganizationContextPacket,
  createMockCrawlResult,
  describeContextReadiness,
  getActiveRecommendations,
  getContentMapSummary,
  getPriorityContentGaps,
  ingestionSources,
  knowledgeObjects,
  modules,
  organization,
  planIngestionRun,
  products,
  projects,
  recommendations,
  rootWorkContentMap,
  rootWorkContentSections,
  sortRecommendationsForMissionControl,
  sortTasksForMissionControl,
  summarizeCrawlResult,
  tasks
} from "@truaxiom/core";
import type { GraphEdge, GraphNode } from "@truaxiom/types";
import { fetchApiHealth, fetchApiSnapshot, getApiBaseUrl, summarizeSnapshot, type ApiHealthResponse } from "./apiClient";

const rootWorkSource = ingestionSources.find((source) => source.id === "SRC-ROOTWORK-WEBSITE");
const plannedRootWorkRun = rootWorkSource ? planIngestionRun(rootWorkSource) : null;
const mockCrawlResult = rootWorkSource ? createMockCrawlResult(rootWorkSource) : null;
const crawlSummary = mockCrawlResult ? summarizeCrawlResult(mockCrawlResult) : [];
const contentMapSummary = getContentMapSummary(rootWorkContentMap);
const priorityGaps = getPriorityContentGaps(rootWorkContentMap);

const nodes: GraphNode[] = [
  { id: "NODE-ORG-TRUAXIOM", entityType: "organization", entityId: organization.id, label: organization.name },
  ...products.map((product) => ({ id: `NODE-${product.id}`, entityType: "product" as const, entityId: product.id, label: product.name })),
  ...projects.map((project) => ({ id: `NODE-${project.id}`, entityType: "project" as const, entityId: project.id, label: project.name })),
  ...recommendations.map((recommendation) => ({ id: `NODE-${recommendation.id}`, entityType: "recommendation" as const, entityId: recommendation.id, label: recommendation.name })),
  ...tasks.map((task) => ({ id: `NODE-${task.id}`, entityType: "task" as const, entityId: task.id, label: task.name })),
  { id: `NODE-${rootWorkContentMap.id}`, entityType: "content_map", entityId: rootWorkContentMap.id, label: "RootWork Content Map" },
  ...rootWorkContentMap.items.map((item) => ({ id: `NODE-${item.id}`, entityType: "content_item" as const, entityId: item.id, label: item.title })),
  ...rootWorkContentMap.gaps.map((gap) => ({ id: `NODE-${gap.id}`, entityType: "content_gap" as const, entityId: gap.id, label: gap.title })),
  ...(mockCrawlResult?.records ?? []).map((record) => ({ id: `NODE-${record.id}`, entityType: "extracted_content" as const, entityId: record.id, label: record.title }))
];

const edges: GraphEdge[] = [
  ...products.map((product) => ({
    id: `EDGE-${organization.id}-${product.id}`,
    fromNodeId: "NODE-ORG-TRUAXIOM",
    toNodeId: `NODE-${product.id}`,
    relationship: "owns" as const,
    confidence: "verified" as const,
    source: "seed",
    createdAt: "2026-08-10T00:00:00-04:00"
  })),
  ...recommendations.flatMap((recommendation) =>
    (recommendation.createsTaskIds ?? []).map((taskId) => ({
      id: `EDGE-${recommendation.id}-${taskId}`,
      fromNodeId: `NODE-${recommendation.id}`,
      toNodeId: `NODE-${taskId}`,
      relationship: "creates" as const,
      confidence: recommendation.confidence,
      source: "seed",
      createdAt: recommendation.createdAt
    }))
  ),
  ...rootWorkContentMap.items.map((item) => ({
    id: `EDGE-${rootWorkContentMap.id}-${item.id}`,
    fromNodeId: `NODE-${rootWorkContentMap.id}`,
    toNodeId: `NODE-${item.id}`,
    relationship: "contains" as const,
    confidence: item.confidence,
    source: "rootWorkContentMap",
    createdAt: rootWorkContentMap.generatedAt
  })),
  ...rootWorkContentMap.gaps.flatMap((gap) =>
    gap.relatedItemIds.map((itemId) => ({
      id: `EDGE-${gap.id}-${itemId}`,
      fromNodeId: `NODE-${gap.id}`,
      toNodeId: `NODE-${itemId}`,
      relationship: "has_gap" as const,
      confidence: "medium" as const,
      source: "rootWorkContentMap",
      createdAt: rootWorkContentMap.generatedAt
    }))
  ),
  ...(mockCrawlResult?.records ?? []).map((record) => ({
    id: `EDGE-${record.sourceId}-${record.id}`,
    fromNodeId: `NODE-${rootWorkContentMap.id}`,
    toNodeId: `NODE-${record.id}`,
    relationship: "extracted_from" as const,
    confidence: "medium" as const,
    source: "mockCrawlerAdapter",
    createdAt: record.discoveredAt
  }))
];

const contextPacket = buildOrganizationContextPacket({
  organization,
  products,
  projects,
  agents,
  modules,
  knowledgeObjects,
  tasks,
  recommendations,
  activity,
  graph: { nodes, edges, knowledgeObjects }
});

const missionViewState = buildMissionControlViewState({
  context: contextPacket,
  contentMap: rootWorkContentMap,
  activeSprintId: "SPRINT-002"
});

const readiness = describeContextReadiness(contextPacket);
const sortedTasks = sortTasksForMissionControl(contextPacket.openTasks);
const sortedRecommendations = sortRecommendationsForMissionControl(getActiveRecommendations(recommendations));
const navItems = missionViewState.navItems;

export function App() {
  const [apiHealth, setApiHealth] = useState<ApiHealthResponse | null>(null);
  const [apiSummary, setApiSummary] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchApiHealth(), fetchApiSnapshot()])
      .then(([health, snapshot]) => {
        if (!active) return;
        setApiHealth(health);
        setApiSummary(summarizeSnapshot(snapshot));
        setApiError(null);
      })
      .catch((error: Error) => {
        if (!active) return;
        setApiHealth(null);
        setApiSummary([]);
        setApiError(error.message);
      });

    return () => {
      active = false;
    };
  }, []);

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
          {navItems.map((item) => (
            <button key={item} className={item === "Home" ? "active" : ""}>{item}</button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Organization</p>
            <h1>{organization.name}</h1>
          </div>
          <div className="command-bar">Search products, docs, agents, tasks…</div>
        </header>

        <section className="hero-grid">
          <article className="panel large">
            <p className="eyebrow">Organizational Context</p>
            <h2>{organization.vision}</h2>
            <p>{organization.description}</p>
          </article>

          <article className="panel metric">
            <span>{contentMapSummary.totalItems}</span>
            <p>RootWork Items</p>
          </article>

          <article className="panel metric">
            <span>{contentMapSummary.openGaps}</span>
            <p>Open Gaps</p>
          </article>

          <article className="panel metric">
            <span>{mockCrawlResult?.records.length ?? 0}</span>
            <p>Extracted Records</p>
          </article>

          <article className="panel metric">
            <span>{contextPacket.graphSummary.nodes}</span>
            <p>Graph Nodes</p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Runtime</p>
              <strong>Local API Bridge</strong>
            </div>
            <div className="focus-card">
              <h3>{apiHealth ? "API Connected" : "Static Fallback Active"}</h3>
              <p>{apiHealth ? `${apiHealth.service} is running in ${apiHealth.environment} mode.` : "Mission Control is still usable from local seed data while the API is offline."}</p>
              <small>{apiHealth?.status ?? apiError ?? "waiting for local API"}</small>
            </div>
            <div className="mini-metrics api-metrics">
              <span>{getApiBaseUrl()}</span>
              {apiSummary.map((note) => <span key={note}>{note}</span>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">RootWork</p>
              <strong>Content Map</strong>
            </div>
            <div className="mini-metrics">
              <span>{contentMapSummary.mappedItems} mapped</span>
              <span>{contentMapSummary.needsReview} review</span>
              <span>{contentMapSummary.clusters} clusters</span>
              <span>{contentMapSummary.averageCoverageScore}% coverage</span>
            </div>
            <div className="stack">
              {rootWorkContentMap.items.map((item) => (
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
              <p className="eyebrow">Content Intelligence</p>
              <strong>Priority Gaps</strong>
            </div>
            <div className="stack">
              {priorityGaps.map((gap) => (
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
              <p className="eyebrow">Ingestion</p>
              <strong>Planned RootWork Run</strong>
            </div>
            {plannedRootWorkRun ? (
              <div className="focus-card">
                <h3>{plannedRootWorkRun.run.id}</h3>
                <p>Source: {plannedRootWorkRun.source.url}</p>
                <small>{plannedRootWorkRun.run.status} · {plannedRootWorkRun.steps.length} planned steps</small>
              </div>
            ) : <p>No RootWork ingestion source found.</p>}
            <div className="stack compact-stack">
              {plannedRootWorkRun?.steps.slice(0, 4).map((step) => (
                <div className="activity-item" key={step}>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Crawler Adapter</p>
              <strong>Mock Extracted Records</strong>
            </div>
            <div className="mini-metrics">
              {crawlSummary.map((note) => <span key={note}>{note}</span>)}
            </div>
            <div className="stack">
              {mockCrawlResult?.records.map((record) => (
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
              <p className="eyebrow">Platform Systems</p>
              <strong>Readiness Stack</strong>
            </div>
            <div className="stack">
              {missionViewState.systemReadiness.map((item) => (
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
              <p className="eyebrow">Recommendations</p>
              <strong>What TIP Thinks Comes Next</strong>
            </div>
            <div className="stack">
              {sortedRecommendations.map((recommendation) => (
                <div className="focus-card" key={recommendation.id}>
                  <h3>{recommendation.name}</h3>
                  <p>{recommendation.expectedImpact}</p>
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
              {sortedTasks.map((task) => (
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
            <p className="fine-print">Source: {rootWorkSource?.url}</p>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Readiness</p>
              <strong>Context Packet</strong>
            </div>
            <ul className="status-list">
              {readiness.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Activity</p>
              <strong>Recent Events</strong>
            </div>
            <div className="stack">
              {activity.map((event) => (
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
