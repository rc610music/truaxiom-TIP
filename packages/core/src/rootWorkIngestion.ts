import type { IngestionSource, KnowledgeObject, Recommendation } from "@truaxiom/types";

export interface RootWorkContentSection {
  id: string;
  label: string;
  pathHint: string;
  purpose: string;
  recommendedSignals: string[];
}

export const rootWorkContentSections: RootWorkContentSection[] = [
  {
    id: "ROOTWORK-BLOG",
    label: "Blog",
    pathHint: "/blog",
    purpose: "Long-form articles, essays, reflections, and educational writing.",
    recommendedSignals: ["topic coverage", "freshness", "internal links", "related practices", "resource gaps"]
  },
  {
    id: "ROOTWORK-RESOURCES",
    label: "Resources",
    pathHint: "/resources",
    purpose: "Downloadable or reference assets that help visitors apply RootWork concepts.",
    recommendedSignals: ["worksheet opportunities", "guide opportunities", "content-to-resource conversion"]
  },
  {
    id: "ROOTWORK-PRACTICES",
    label: "Practices",
    pathHint: "/practices",
    purpose: "Guided practices, rituals, breathwork, journaling, and applied exercises.",
    recommendedSignals: ["practice gaps", "difficulty level", "duration", "supporting article links"]
  },
  {
    id: "ROOTWORK-PAGES",
    label: "Core Pages",
    pathHint: "/",
    purpose: "Primary website pages, product descriptions, membership messaging, and user onboarding copy.",
    recommendedSignals: ["brand clarity", "conversion path", "CTA quality", "audience fit"]
  }
];

export function buildRootWorkIngestionSummary(source: IngestionSource): string {
  const sectionList = source.sections?.join(", ") ?? "no sections configured";
  return `${source.label} is configured for ${source.crawlFrequency} ingestion across: ${sectionList}.`;
}

export function findKnowledgeGaps(knowledgeObjects: KnowledgeObject[], recommendations: Recommendation[]): string[] {
  const knownTags = new Set(knowledgeObjects.flatMap((object) => object.tags ?? []));
  const recommendedTags = new Set(recommendations.flatMap((recommendation) => recommendation.tags ?? []));
  const gaps: string[] = [];

  for (const tag of recommendedTags) {
    if (!knownTags.has(tag)) gaps.push(tag);
  }

  return gaps;
}
