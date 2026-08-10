import type { Agent, ActivityEvent, KnowledgeObject, Module, Organization, OrganizationContextPacket, Product, Project } from "@truaxiom/types";
import { summarizeGraph, type KnowledgeGraphSnapshot } from "./knowledgeGraph";

interface BuildContextPacketInput {
  organization: Organization;
  products: Product[];
  projects: Project[];
  agents: Agent[];
  modules: Module[];
  knowledgeObjects: KnowledgeObject[];
  activity: ActivityEvent[];
  graph: KnowledgeGraphSnapshot;
}

export function buildOrganizationContextPacket(input: BuildContextPacketInput): OrganizationContextPacket {
  return {
    organization: input.organization,
    activeProducts: input.products.filter((product) => product.status === "active"),
    activeProjects: input.projects.filter((project) => project.status === "active"),
    activeAgents: input.agents.filter((agent) => agent.status === "active" || agent.status === "planned"),
    installedModules: input.modules.filter((module) => module.status === "active" || module.status === "planned"),
    recentKnowledge: input.knowledgeObjects.slice(0, 10),
    recentActivity: input.activity.slice(0, 10),
    graphSummary: summarizeGraph(input.graph)
  };
}

export function describeContextReadiness(packet: OrganizationContextPacket): string[] {
  const notes: string[] = [];

  if (packet.activeProducts.length === 0) notes.push("No active products are registered.");
  if (packet.installedModules.length === 0) notes.push("No installable intelligence modules are registered.");
  if (packet.graphSummary.nodes === 0) notes.push("Knowledge Graph has not been seeded.");
  if (packet.recentActivity.length === 0) notes.push("No platform activity has been recorded.");

  if (notes.length === 0) {
    notes.push("Organizational context packet is ready for Mission Control display.");
  }

  return notes;
}
