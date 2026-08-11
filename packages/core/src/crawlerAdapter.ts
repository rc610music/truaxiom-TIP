import type {
  CrawlRequest,
  CrawlResult,
  CrawlerAdapterContract,
  ExtractedContentRecord,
  IngestionSource
} from "@truaxiom/types";

const sprintTimestamp = "2026-08-10T22:37:00-04:00";

export function createCrawlRequest(source: IngestionSource): CrawlRequest {
  return {
    id: `CRAWL-${source.id}-${Date.now()}`,
    sourceId: source.id,
    productId: source.productId,
    rootUrl: source.url,
    includePaths: source.sections ?? ["/"],
    excludePaths: ["/login", "/account", "/checkout"],
    maxDepth: 2,
    requestedAt: sprintTimestamp
  };
}

export function createMockExtractedRecord(input: {
  id: string;
  source: IngestionSource;
  path: string;
  title: string;
  excerpt: string;
  topics: string[];
}): ExtractedContentRecord {
  return {
    id: input.id,
    sourceId: input.source.id,
    productId: input.source.productId,
    url: new URL(input.path, input.source.url).toString(),
    title: input.title,
    format: "text",
    excerpt: input.excerpt,
    detectedType: input.path.includes("blog") || input.path.includes("wisdom") ? "article" : "page",
    detectedIntent: input.path.includes("premium") ? "conversion" : "education",
    detectedTopics: input.topics,
    status: "mapped",
    httpStatus: 200,
    canonicalUrl: new URL(input.path, input.source.url).toString(),
    discoveredAt: sprintTimestamp,
    metadata: {
      adapter: "mock-rootwork-crawler",
      sprint: "SPRINT-002",
      liveFetch: false
    }
  };
}

export function createMockCrawlResult(source: IngestionSource): CrawlResult {
  const request = createCrawlRequest(source);
  const records: ExtractedContentRecord[] = [
    createMockExtractedRecord({
      id: "EXT-ROOTWORK-HOME",
      source,
      path: "/",
      title: "RootWork Home",
      excerpt: "RootWork introduces the wellness brand, its philosophy, and the invitation into grounded personal growth.",
      topics: ["rootwork", "personal growth", "healing"]
    }),
    createMockExtractedRecord({
      id: "EXT-ROOTWORK-WISDOM",
      source,
      path: "/wisdom",
      title: "Wisdom Library",
      excerpt: "The wisdom section should hold articles, reflections, practices, and deeper educational material.",
      topics: ["wisdom", "education", "self development"]
    }),
    createMockExtractedRecord({
      id: "EXT-ROOTWORK-PRACTICES",
      source,
      path: "/practices",
      title: "RootWork Practices",
      excerpt: "Practice content supports rituals, grounding exercises, journaling, breathwork, and repeatable growth habits.",
      topics: ["practices", "rituals", "journaling", "grounding"]
    }),
    createMockExtractedRecord({
      id: "EXT-ROOTWORK-PREMIUM",
      source,
      path: "/premium",
      title: "RootWork Premium",
      excerpt: "Premium positions deeper access, membership value, and ongoing support for users ready to commit.",
      topics: ["premium", "membership", "conversion"]
    })
  ];

  return {
    requestId: request.id,
    sourceId: source.id,
    status: "completed",
    startedAt: request.requestedAt,
    completedAt: sprintTimestamp,
    records,
    errors: [],
    summary: {
      requestedPaths: request.includePaths.length,
      fetchedRecords: records.length,
      skippedRecords: 0,
      failedRecords: 0
    }
  };
}

export const rootWorkCrawlerAdapterContract: CrawlerAdapterContract = {
  id: "ADAPTER-ROOTWORK-CRAWLER-MOCK",
  name: "RootWork Mock Website Crawler Adapter",
  version: "0.1.0",
  sourceTypes: ["website"],
  createRequest: createCrawlRequest,
  async crawl(request) {
    const source: IngestionSource = {
      id: request.sourceId,
      productId: request.productId,
      label: "Runtime RootWork Source",
      url: request.rootUrl,
      sourceType: "website",
      crawlFrequency: "manual",
      sections: request.includePaths,
      enabled: true
    };

    return createMockCrawlResult(source);
  }
};

export function summarizeCrawlResult(result: CrawlResult): string[] {
  return [
    `${result.summary.fetchedRecords} record(s) fetched`,
    `${result.summary.failedRecords} failed record(s)`,
    `${result.records.length} extracted content record(s) ready for mapping`,
    `status: ${result.status}`
  ];
}
