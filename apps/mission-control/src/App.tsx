import {
  activity,
  agents,
  buildOrganizationContextPacket,
  describeContextReadiness,
  getActiveRecommendations,
  ingestionSources,
  knowledgeObjects,
  modules,
  organization,
  products,
  projects,
  recommendations,
  rootWorkContentSections,
  sortRecommendationsForMissionControl,
  sortTasksForMissionControl,
  tasks
} from "@truaxiom/core";
import type { GraphEdge, GraphNode } from "@truaxiom/types";

const nodes: GraphNode[] = [
  { id: "NODE-ORG-TRUAXIOM", entityType: "organization", entityId: organization.id, label: organization.name },
  ...products.map((product) => ({ id: `NODE-${product.id}`, entityType: "product" as const, entityId: product.id, label: product.name })),
  ...projects.map((project) => ({ id: `NODE-${project.id}`, entityType: "project" as const, entityId: project.id, label: project.name })),
  ...recommendations.map((recommendation) => ({ id: `NODE-${recommendation.id}`, entityType: "recommendation" as const, entityId: recommendation.id, label: recommendation.name })),
  ...tasks.map((task) => ({ id: `NODE-${task.id}`, entityType: "task" as const, entityId: task.id, label: task.name }))
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
  )
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

const readiness = describeContextReadiness(contextPacket);
const sortedTasks = sortTasksForMissionControl(contextPacket.openTasks);
const sortedRecommendations = sortRecommendationsForMissionControl(getActiveRecommendations(recommendations));

const navItems = ["Home", "Products", "Projects", "Tasks", "Recommendations", "Agents", "Modules", "Knowledge", "Activity", "Settings"];

export function App() {
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
            <span>{contextPacket.activeProducts.length}</span>
            <p>Active Products</p>
          </article>

          <article className="panel metric">
            <span>{contextPacket.openTasks.length}</span>
            <p>Open Tasks</p>
          </article>

          <article className="panel metric">
            <span>{contextPacket.activeRecommendations.length}</span>
            <p>Recommendations</p>
          </article>

          <article className="panel metric">
            <span>{contextPacket.graphSummary.nodes}</span>
            <p>Graph Nodes</p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Products</p>
              <strong>Portfolio Registry</strong>
            </div>
            <div className="stack">
              {products.map((product) => (
                <div className="row-card" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <p>{product.description}</p>
                  </div>
                  <span>{product.stage}</span>
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
            <p className="fine-print">Source: {ingestionSources[0]?.url}</p>
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
