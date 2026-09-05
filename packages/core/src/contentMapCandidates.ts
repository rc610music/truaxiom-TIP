import type {
  ConfidenceStatus,
  ContentGap,
  ContentIntent,
  ContentItemType,
  ContentMap,
  ContentMapItem,
  ExtractedContentRecord,
  Priority
} from "@truaxiom/types";

export interface ContentMapCandidate {
  id: string;
  extractedRecordId: string;
  productId: string;
  title: string;
  url?: string;
  proposedType: ContentItemType;
  proposedIntent: ContentIntent;
  proposedSection: string;
  primaryTopic: string;
  secondaryTopics: string[];
  confidence: ConfidenceStatus;
  rationale: string;
  status: "candidate" | "accepted" | "rejected" | "needs_review";
}

export interface ContentMapCandidateWorkflow {
  id: string;
  productId: string;
  createdAt: string;
  candidateCount: number;
  acceptedCount: number;
  needsReviewCount: number;
  candidates: ContentMapCandidate[];
  proposedGaps: ContentGap[];
}

const sprintTimestamp = "2026-08-10T22:57:00-04:00";

function inferSection(record: ExtractedContentRecord): string {
  const url = record.url.toLowerCase();
  if (url.includes("wisdom") || url.includes("blog")) return "wisdom";
  if (url.includes("practice")) return "practices";
  if (url.includes("resource")) return "resources";
  if (url.includes("premium") || url.includes("membership")) return "premium";
  return "core";
}

function inferPriority(record: ExtractedContentRecord): Priority {
  if (record.detectedIntent === "conversion") return "critical";
  if (record.detectedTopics.length <= 1) return "high";
  return "medium";
}

function inferConfidence(record: ExtractedContentRecord): ConfidenceStatus {
  if (record.httpStatus && record.httpStatus >= 200 && record.httpStatus < 300 && record.detectedTopics.length >= 2) return "high";
  if (record.httpStatus && record.httpStatus >= 200 && record.httpStatus < 300) return "medium";
  return "low";
}

export function createContentMapCandidates(records: ExtractedContentRecord[]): ContentMapCandidate[] {
  return records.map((record) => ({
    id: `CMC-${record.id}`,
    extractedRecordId: record.id,
    productId: record.productId,
    title: record.title,
    url: record.canonicalUrl ?? record.url,
    proposedType: record.detectedType ?? "page",
    proposedIntent: record.detectedIntent ?? "awareness",
    proposedSection: inferSection(record),
    primaryTopic: record.detectedTopics[0] ?? "unclassified",
    secondaryTopics: record.detectedTopics.slice(1),
    confidence: inferConfidence(record),
    rationale: "Generated from extracted crawler metadata and section/path heuristics.",
    status: inferConfidence(record) === "high" ? "candidate" : "needs_review"
  }));
}

// Keep the ingestion-facing name explicit while preserving the shorter public
// helper used by the original content-map workflow.
export const createContentMapCandidatesFromExtractedRecords = createContentMapCandidates;

export function createContentItemsFromCandidates(candidates: ContentMapCandidate[]): ContentMapItem[] {
  return candidates.map((candidate) => ({
    id: `CMI-${candidate.extractedRecordId}`,
    productId: candidate.productId,
    title: candidate.title,
    type: candidate.proposedType,
    url: candidate.url,
    section: candidate.proposedSection,
    intent: candidate.proposedIntent,
    lifecycleStatus: candidate.status === "needs_review" ? "needs_review" : "mapped",
    primaryTopic: candidate.primaryTopic,
    secondaryTopics: candidate.secondaryTopics,
    funnelStage: candidate.proposedIntent === "conversion" ? "bottom" : "middle",
    confidence: candidate.confidence,
    lastObservedAt: sprintTimestamp,
    freshness: "new",
    notes: [candidate.rationale],
    tags: ["crawler-candidate", candidate.proposedSection, candidate.proposedIntent]
  }));
}

export function proposeContentGapsFromCandidates(
  candidates: ContentMapCandidate[],
  fallbackProductId = "PROD-ROOTWORK"
): ContentGap[] {
  const gaps: ContentGap[] = [];
  const sections = new Set(candidates.map((candidate) => candidate.proposedSection));
  const hasConversion = candidates.some((candidate) => candidate.proposedIntent === "conversion");
  const needsReview = candidates.filter((candidate) => candidate.status === "needs_review");

  if (!sections.has("wisdom")) {
    gaps.push({
      id: "GAP-CANDIDATE-WISDOM-MISSING",
      productId: candidates[0]?.productId ?? fallbackProductId,
      gapType: "missing_topic",
      title: "Wisdom section not detected in crawl candidates",
      description: "The crawler candidate workflow did not detect a Wisdom / blog section. This may indicate a crawler path issue or missing content inventory.",
      priority: "high",
      relatedItemIds: [],
      recommendedAction: "Verify crawl paths and map Wisdom articles into the content inventory.",
      expectedImpact: "Improves RootWork content discovery and future recommendation quality.",
      status: "open"
    });
  }

  if (!hasConversion) {
    gaps.push({
      id: "GAP-CANDIDATE-CONVERSION-MISSING",
      productId: candidates[0]?.productId ?? fallbackProductId,
      gapType: "weak_conversion",
      title: "No conversion-intent page detected",
      description: "The candidate workflow did not identify a conversion-oriented page or offer path.",
      priority: "critical",
      relatedItemIds: [],
      recommendedAction: "Ensure Premium or membership paths are crawlable and mapped.",
      expectedImpact: "Strengthens the connection between educational content and paid RootWork offers.",
      status: "open"
    });
  }

  if (needsReview.length > 0) {
    gaps.push({
      id: "GAP-CANDIDATE-REVIEW-QUEUE",
      productId: candidates[0]?.productId ?? fallbackProductId,
      gapType: "brand_alignment",
      title: "Candidate content needs human review",
      description: `${needsReview.length} candidate item(s) need review before being treated as reliable organizational knowledge.`,
      priority: "medium",
      relatedItemIds: needsReview.map((candidate) => `CMI-${candidate.extractedRecordId}`),
      recommendedAction: "Review candidate titles, intent, topics, and section placement.",
      expectedImpact: "Protects brand accuracy and prevents low-confidence data from shaping recommendations.",
      status: "open"
    });
  }

  return gaps;
}

export function createContentMapCandidateWorkflow(records: ExtractedContentRecord[]): ContentMapCandidateWorkflow {
  const candidates = createContentMapCandidates(records);
  const proposedGaps = proposeContentGapsFromCandidates(candidates);

  return {
    id: "CMW-ROOTWORK-SPRINT-002",
    productId: records[0]?.productId ?? "PROD-ROOTWORK",
    createdAt: sprintTimestamp,
    candidateCount: candidates.length,
    acceptedCount: candidates.filter((candidate) => candidate.status === "accepted").length,
    needsReviewCount: candidates.filter((candidate) => candidate.status === "needs_review").length,
    candidates,
    proposedGaps
  };
}

export function mergeCandidatesIntoContentMap(contentMap: ContentMap, candidates: ContentMapCandidate[]): ContentMap {
  const candidateItems = createContentItemsFromCandidates(candidates);
  const existingUrls = new Set(contentMap.items.map((item) => item.url).filter(Boolean));
  const newItems = candidateItems.filter((item) => !item.url || !existingUrls.has(item.url));
  const nextItems = [...contentMap.items, ...newItems];

  return {
    ...contentMap,
    updatedAt: sprintTimestamp,
    items: nextItems,
    gaps: [...contentMap.gaps, ...proposeContentGapsFromCandidates(candidates)],
    summary: {
      totalItems: nextItems.length,
      mappedItems: nextItems.filter((item) => item.lifecycleStatus === "mapped").length,
      needsReview: nextItems.filter((item) => item.lifecycleStatus === "needs_review").length,
      openGaps: contentMap.gaps.filter((gap) => gap.status === "open").length + proposeContentGapsFromCandidates(candidates).length,
      staleItems: nextItems.filter((item) => item.lifecycleStatus === "stale").length
    }
  };
}

export function summarizeCandidateWorkflow(workflow: ContentMapCandidateWorkflow): string[] {
  return [
    `${workflow.candidateCount} candidate item(s) generated`,
    `${workflow.needsReviewCount} candidate item(s) need review`,
    `${workflow.proposedGaps.length} proposed gap(s) created`,
    `workflow: ${workflow.id}`
  ];
}
