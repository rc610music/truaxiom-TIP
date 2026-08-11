import type { ContentMap, IngestionRun, IngestionSource, KnowledgeObject } from "@truaxiom/types";

const defaultRunTime = "2026-08-10T22:30:00-04:00";

export interface PlannedIngestionRun {
  source: IngestionSource;
  run: IngestionRun;
  steps: string[];
  expectedOutputs: string[];
  safeguards: string[];
}

export function createQueuedIngestionRun(source: IngestionSource, startedAt = defaultRunTime): IngestionRun {
  return {
    id: `RUN-${source.id}-${startedAt.replace(/[-:]/g, "").slice(0, 13)}`,
    sourceId: source.id,
    startedAt,
    status: "queued",
    discoveredItems: 0,
    createdKnowledgeObjects: 0,
    notes: ["Queued from static Sprint 002 ingestion runner. No live crawl performed yet."]
  };
}

export function planIngestionRun(source: IngestionSource): PlannedIngestionRun {
  return {
    source,
    run: createQueuedIngestionRun(source),
    steps: [
      "Load source configuration and enabled sections.",
      "Discover reachable URLs under approved source scope.",
      "Classify each discovered URL by section and content type.",
      "Extract title, summary, topic, audience, freshness, and canonical URL.",
      "Create or update content map items.",
      "Create knowledge objects for approved or high-confidence content.",
      "Flag duplicates, thin pages, stale pages, and conversion gaps.",
      "Emit an ingestion report for Mission Control review."
    ],
    expectedOutputs: [
      "Content map items",
      "Knowledge objects",
      "Content clusters",
      "Content gaps",
      "Recommendations",
      "Review tasks"
    ],
    safeguards: [
      "Respect source scope; do not crawl unrelated domains.",
      "Do not publish or modify external content during ingestion.",
      "Keep confidence low until crawler-backed evidence exists.",
      "Preserve provenance for every generated knowledge object."
    ]
  };
}

export function completeIngestionRunFromContentMap(run: IngestionRun, map: ContentMap, completedAt = defaultRunTime): IngestionRun {
  return {
    ...run,
    completedAt,
    status: "completed",
    discoveredItems: map.items.length,
    createdKnowledgeObjects: map.items.filter((item) => item.lifecycleStatus === "mapped" || item.confidence === "verified").length,
    notes: [
      ...(run.notes ?? []),
      `Mapped ${map.items.length} content items.`,
      `Detected ${map.gaps.filter((gap) => gap.status === "open").length} open content gaps.`
    ]
  };
}

export function contentMapItemToKnowledgeObject(item: ContentMap["items"][number]): KnowledgeObject {
  return {
    id: item.canonicalKnowledgeObjectId ?? `KNO-${item.id}`,
    name: item.title,
    description: `${item.primaryTopic}. ${item.secondaryTopics.join(", ")}`,
    status: item.lifecycleStatus === "gap" ? "planned" : "active",
    sourceType: "website",
    sourceUri: item.url,
    confidence: item.confidence,
    approvalStatus: item.lifecycleStatus === "mapped" ? "approved" : "needs_review",
    freshness: item.freshness,
    createdAt: item.lastObservedAt ?? defaultRunTime,
    updatedAt: item.lastObservedAt ?? defaultRunTime,
    tags: [item.type, item.section, ...(item.tags ?? [])]
  };
}

export function contentMapToKnowledgeObjects(map: ContentMap): KnowledgeObject[] {
  return map.items.map(contentMapItemToKnowledgeObject);
}
