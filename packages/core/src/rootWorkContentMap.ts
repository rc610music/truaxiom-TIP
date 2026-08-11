import type { ContentGap, ContentMap, ContentMapItem } from "@truaxiom/types";
import { ingestionSources } from "./seed";

const now = "2026-08-10T22:30:00-04:00";
const rootWorkSource = ingestionSources.find((source) => source.id === "SRC-ROOTWORK-WEBSITE");

export const rootWorkContentItems: ContentMapItem[] = [
  {
    id: "CONTENT-ROOTWORK-HOME",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "RootWork Home",
    type: "page",
    url: "https://restoreyour.life",
    section: "home",
    intent: "trust",
    lifecycleStatus: "mapped",
    primaryTopic: "RootWork brand promise",
    secondaryTopics: ["self-development", "spiritual growth", "personal transformation"],
    audience: "People seeking practical inner work and grounded personal growth",
    funnelStage: "top",
    confidence: "medium",
    lastObservedAt: now,
    freshness: "current",
    tags: ["homepage", "brand", "positioning"]
  },
  {
    id: "CONTENT-ROOTWORK-WISDOM",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "Wisdom / Blog Library",
    type: "article",
    section: "blog",
    intent: "education",
    lifecycleStatus: "needs_review",
    primaryTopic: "RootWork teachings and reflective content",
    secondaryTopics: ["consciousness", "healing", "journaling", "self-awareness"],
    audience: "Readers looking for practical spiritual and emotional guidance",
    funnelStage: "middle",
    confidence: "low",
    lastObservedAt: now,
    freshness: "unknown",
    notes: ["Needs crawler-backed article inventory.", "Needs canonical topic map and duplicate detection."],
    tags: ["blog", "wisdom", "content-intelligence"]
  },
  {
    id: "CONTENT-ROOTWORK-PRACTICES",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "RootWork Practices",
    type: "practice",
    section: "practices",
    intent: "support",
    lifecycleStatus: "needs_review",
    primaryTopic: "Guided practices and daily growth exercises",
    secondaryTopics: ["breathwork", "journaling", "reflection", "embodiment"],
    audience: "Users who want repeatable self-growth exercises",
    funnelStage: "post-conversion",
    confidence: "low",
    lastObservedAt: now,
    freshness: "unknown",
    notes: ["Needs structured practice taxonomy: duration, purpose, emotional state, root type fit."],
    tags: ["practices", "daily-use", "taxonomy"]
  },
  {
    id: "CONTENT-ROOTWORK-RESOURCES",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "RootWork Resources",
    type: "resource",
    section: "resources",
    intent: "education",
    lifecycleStatus: "needs_review",
    primaryTopic: "Support resources and self-guided materials",
    secondaryTopics: ["worksheets", "guides", "tools", "reflection prompts"],
    audience: "Users seeking practical tools between sessions or app visits",
    funnelStage: "middle",
    confidence: "low",
    lastObservedAt: now,
    freshness: "unknown",
    notes: ["Needs inventory of downloadable or embedded resources."],
    tags: ["resources", "downloads", "tools"]
  },
  {
    id: "CONTENT-ROOTWORK-ROOT-TYPES",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "Root Types System",
    type: "quiz",
    section: "root-types",
    intent: "conversion",
    lifecycleStatus: "planned",
    primaryTopic: "RootWork personality/archetype onboarding system",
    secondaryTopics: ["Visionary", "Grounded", "Firestarter", "Seeker", "Nurturer", "Rebel", "Harmonizer", "Skeptic", "Alchemist"],
    audience: "New visitors who need a personalized entry point into RootWork",
    funnelStage: "top",
    confidence: "verified",
    freshness: "current",
    notes: ["Known Root Types framework should become a major content and onboarding pillar."],
    tags: ["root-types", "quiz", "personalization"]
  },
  {
    id: "CONTENT-ROOTWORK-PREMIUM",
    productId: "PROD-ROOTWORK",
    sourceId: rootWorkSource?.id,
    title: "RootWork Premium",
    type: "offer",
    section: "membership",
    intent: "conversion",
    lifecycleStatus: "planned",
    primaryTopic: "RootWork Premium membership offer",
    secondaryTopics: ["premium tools", "daily lineup", "journaling", "digital altar", "affirmations"],
    audience: "Users ready to turn RootWork into an ongoing practice",
    funnelStage: "bottom",
    confidence: "medium",
    freshness: "current",
    notes: ["Needs clear offer ladder and value explanation tied to user outcomes."],
    tags: ["membership", "premium", "conversion"]
  }
];

export const rootWorkContentGaps: ContentGap[] = [
  {
    id: "GAP-ROOTWORK-ARTICLE-INVENTORY",
    productId: "PROD-ROOTWORK",
    gapType: "thin_content",
    title: "Crawler-backed article inventory missing",
    description: "TIP needs an actual URL-level index of all RootWork articles before it can safely recommend new content or detect duplicates.",
    priority: "critical",
    relatedItemIds: ["CONTENT-ROOTWORK-WISDOM"],
    recommendedAction: "Implement website crawl manifest and extract page title, URL, section, topic, summary, freshness, and canonical status.",
    expectedImpact: "Prevents duplicate content and gives Content Intelligence a reliable baseline.",
    status: "open"
  },
  {
    id: "GAP-ROOTWORK-PRACTICE-TAXONOMY",
    productId: "PROD-ROOTWORK",
    gapType: "missing_topic",
    title: "Practice taxonomy not structured yet",
    description: "RootWork practices need metadata for emotional state, duration, root type fit, intention, and user outcome.",
    priority: "high",
    relatedItemIds: ["CONTENT-ROOTWORK-PRACTICES"],
    recommendedAction: "Create a structured practice schema and map existing practices into it.",
    expectedImpact: "Allows the RootWork Agent to recommend the right practice for the right user context.",
    status: "open"
  },
  {
    id: "GAP-ROOTWORK-OFFER-PATH",
    productId: "PROD-ROOTWORK",
    gapType: "weak_conversion",
    title: "Premium conversion path needs mapping",
    description: "RootWork Premium should connect clearly from article education and free practices into paid membership value.",
    priority: "high",
    relatedItemIds: ["CONTENT-ROOTWORK-HOME", "CONTENT-ROOTWORK-PREMIUM", "CONTENT-ROOTWORK-ROOT-TYPES"],
    recommendedAction: "Map the visitor journey from homepage to Root Types to practices to Premium offer.",
    expectedImpact: "Improves product clarity and creates a measurable path from content to membership.",
    status: "open"
  }
];

export const rootWorkContentMap: ContentMap = {
  id: "CMAP-ROOTWORK-0001",
  productId: "PROD-ROOTWORK",
  sourceIds: rootWorkSource ? [rootWorkSource.id] : [],
  generatedAt: now,
  updatedAt: now,
  items: rootWorkContentItems,
  clusters: [
    {
      id: "CLUSTER-ROOTWORK-FOUNDATION",
      productId: "PROD-ROOTWORK",
      name: "RootWork Foundation",
      description: "Core pages and messages that explain what RootWork is and why it matters.",
      topic: "brand-positioning",
      itemIds: ["CONTENT-ROOTWORK-HOME", "CONTENT-ROOTWORK-PREMIUM"],
      targetAudience: "New visitors and potential members",
      strategicRole: "pillar",
      coverageScore: 58
    },
    {
      id: "CLUSTER-ROOTWORK-WISDOM",
      productId: "PROD-ROOTWORK",
      name: "Wisdom Library",
      description: "Educational articles and reflective content that build trust and teach the RootWork philosophy.",
      topic: "education-content",
      itemIds: ["CONTENT-ROOTWORK-WISDOM", "CONTENT-ROOTWORK-RESOURCES"],
      targetAudience: "Readers and returning users",
      strategicRole: "supporting",
      coverageScore: 34
    },
    {
      id: "CLUSTER-ROOTWORK-PRACTICE",
      productId: "PROD-ROOTWORK",
      name: "Practice Engine",
      description: "Exercises, tools, prompts, and rituals that turn the brand into daily action.",
      topic: "practice-system",
      itemIds: ["CONTENT-ROOTWORK-PRACTICES", "CONTENT-ROOTWORK-ROOT-TYPES"],
      targetAudience: "Users seeking repeatable inner work",
      strategicRole: "retention",
      coverageScore: 42
    }
  ],
  gaps: rootWorkContentGaps,
  summary: {
    totalItems: rootWorkContentItems.length,
    mappedItems: rootWorkContentItems.filter((item) => item.lifecycleStatus === "mapped").length,
    needsReview: rootWorkContentItems.filter((item) => item.lifecycleStatus === "needs_review").length,
    openGaps: rootWorkContentGaps.filter((gap) => gap.status === "open").length,
    staleItems: rootWorkContentItems.filter((item) => item.freshness === "stale").length
  }
};

export function getContentMapSummary(map: ContentMap) {
  return {
    ...map.summary,
    clusters: map.clusters.length,
    averageCoverageScore: Math.round(map.clusters.reduce((sum, cluster) => sum + cluster.coverageScore, 0) / map.clusters.length)
  };
}

export function getPriorityContentGaps(map: ContentMap): ContentGap[] {
  const rank = { urgent: 5, critical: 4, high: 3, medium: 2, low: 1 } as const;
  return [...map.gaps].sort((a, b) => rank[b.priority] - rank[a.priority]);
}

export function getContentItemsBySection(map: ContentMap): Record<string, ContentMapItem[]> {
  return map.items.reduce<Record<string, ContentMapItem[]>>((sections, item) => {
    sections[item.section] = sections[item.section] ?? [];
    sections[item.section].push(item);
    return sections;
  }, {});
}
