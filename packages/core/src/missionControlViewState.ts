import type { MissionControlViewState, OrganizationContextPacket, Priority } from "@truaxiom/types";
import type { ContentMap } from "@truaxiom/types";

function panel(id: string, eyebrow: string, title: string, status?: string, priority?: Priority) {
  return { id, eyebrow, title, status, priority };
}

export function buildMissionControlViewState(input: {
  context: OrganizationContextPacket;
  contentMap: ContentMap;
  activeSprintId: string;
}): MissionControlViewState {
  const { context, contentMap, activeSprintId } = input;

  return {
    organizationId: context.organization.id,
    activeProductId: "PROD-TIP",
    activeSprintId,
    navItems: [
      "Home",
      "Products",
      "Projects",
      "Content Map",
      "Ingestion",
      "Tasks",
      "Recommendations",
      "Agents",
      "Modules",
      "Knowledge",
      "Activity",
      "Settings"
    ],
    metrics: [
      { label: "Products", value: context.activeProducts.length, description: "Active product records" },
      { label: "RootWork Items", value: contentMap.summary.totalItems, description: "Mapped content entries" },
      { label: "Open Gaps", value: contentMap.summary.openGaps, description: "Content gaps still unresolved" },
      { label: "Graph Nodes", value: context.graphSummary.nodes, description: "Current graph entities" }
    ],
    panels: [
      panel("organization-context", "Organization", "Organizational Context", "ready"),
      panel("rootwork-content-map", "RootWork", "Content Map", "stubbed"),
      panel("ingestion-run", "Ingestion", "Planned RootWork Run", "stubbed"),
      panel("recommendations", "Recommendations", "What TIP Thinks Comes Next", "stubbed"),
      panel("tasks", "Tasks", "Sprint 002 Queue", "ready"),
      panel("readiness", "Readiness", "Context Packet", "ready")
    ],
    systemReadiness: [
      {
        system: "Mission Control Shell",
        status: "ready",
        note: "Static interface shell is in place and connected to seed data."
      },
      {
        system: "Data Access Layer",
        status: "stubbed",
        note: "In-memory repository interface added; persistence adapter is still planned."
      },
      {
        system: "Crawler Adapter",
        status: "stubbed",
        note: "Mock adapter contract added; live website fetch is not active yet."
      },
      {
        system: "Knowledge Graph",
        status: "stubbed",
        note: "Graph nodes and edges are derived from seeded entities and content maps."
      },
      {
        system: "Organizational Brain",
        status: "stubbed",
        note: "Context packet builder exists; reasoning engine arrives in a later sprint."
      }
    ]
  };
}
