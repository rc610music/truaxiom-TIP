import type { GraphEdge, GraphNode, KnowledgeObject } from "@truaxiom/types";

export interface KnowledgeGraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  knowledgeObjects: KnowledgeObject[];
}

export function createGraphNode(node: GraphNode): GraphNode {
  return node;
}

export function createGraphEdge(edge: GraphEdge): GraphEdge {
  return edge;
}

export function summarizeGraph(snapshot: KnowledgeGraphSnapshot) {
  return {
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    knowledgeObjects: snapshot.knowledgeObjects.length,
    verifiedKnowledgeObjects: snapshot.knowledgeObjects.filter((item) => item.confidence === "verified").length,
    staleKnowledgeObjects: snapshot.knowledgeObjects.filter((item) => item.freshness === "stale").length
  };
}

export function getConnectedNodes(snapshot: KnowledgeGraphSnapshot, nodeId: string) {
  const connectedIds = new Set<string>();

  snapshot.edges.forEach((edge) => {
    if (edge.fromNodeId === nodeId) connectedIds.add(edge.toNodeId);
    if (edge.toNodeId === nodeId) connectedIds.add(edge.fromNodeId);
  });

  return snapshot.nodes.filter((node) => connectedIds.has(node.id));
}
