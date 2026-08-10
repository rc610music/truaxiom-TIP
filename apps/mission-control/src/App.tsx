import {
  activity,
  agents,
  buildOrganizationContextPacket,
  describeContextReadiness,
  modules,
  organization,
  products,
  projects
} from "@truaxiom/core";
import type { GraphEdge, GraphNode, KnowledgeObject } from "@truaxiom/types";

const nodes: GraphNode[] = [
  { id: "NODE-ORG-TRUAXIOM", entityType: "organization", entityId: organization.id, label: organization.name },
  ...products.map((product) => ({ id: `NODE-${product.id}`, entityType: "product" as const, entityId: product.id, label: product.name })),
  ...projects.map((project) => ({ id: `NODE-${project.id}`, entityType: "project" as const, entityId: project.id, label: project.name }))
];

const edges: GraphEdge[] = products.map((product) => ({
  id: `EDGE-${organization.id}-${product.id}`,
  fromNodeId: "NODE-ORG-TRUAXIOM",
  toNodeId: `NODE-${product.id}`,
  relationship: "owns",
  confidence: "verified",
  source: "seed",
  createdAt: "2026-08-10T00:00:00-04:00"
}));

const knowledgeObjects: KnowledgeObject[] = [
  {
    id: "KNO-0001",
    name: "TIP Sprint 001 Foundation Package",
    description: "Foundation architecture, registry, roadmap, and Sprint 002 draft uploaded to repository.",
    status: "active",
    sourceType: "repository",
    sourceUri: "https://github.com/rc610music/truaxiom-TIP",
    confidence: "verified",
    approvalStatus: "approved",
    freshness: "new",
    createdAt: "2026-08-10T00:00:00-04:00",
    updatedAt: "2026-08-10T00:00:00-04:00",
    tags: ["sprint-001", "foundation"]
  }
];

const contextPacket = buildOrganizationContextPacket({
  organization,
  products,
  projects,
  agents,
  modules,
  knowledgeObjects,
  activity,
  graph: { nodes, edges, knowledgeObjects }
});

const readiness = describeContextReadiness(contextPacket);

const navItems = ["Home", "Products", "Projects", "Agents", "Modules", "Knowledge", "Activity", "Settings"];

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
            <span>{contextPacket.installedModules.length}</span>
            <p>Modules Registered</p>
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
              <p className="eyebrow">Sprint</p>
              <strong>Active Build Track</strong>
            </div>
            {projects.map((project) => (
              <div className="focus-card" key={project.id}>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
                <small>Next: {project.nextAction}</small>
              </div>
            ))}
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
