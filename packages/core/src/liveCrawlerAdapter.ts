import type { CrawlRequest, CrawlResult, CrawlerAdapterContract, ExtractedContentRecord, IngestionSource } from "@truaxiom/types";
import { createCrawlRequest } from "./crawlerAdapter";

export interface LiveCrawlerSafetyOptions {
  allowLiveFetch: boolean;
  maxDepth: number;
  maxRecords: number;
  allowedHosts: string[];
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  url: string;
  text(): Promise<string>;
}

export type FetchLike = (url: string) => Promise<FetchLikeResponse>;

const defaultSafety: LiveCrawlerSafetyOptions = {
  allowLiveFetch: false,
  maxDepth: 1,
  maxRecords: 25,
  allowedHosts: ["restoreyour.life"]
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || fallback;
}

function detectTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const topics: string[] = [];

  if (lower.includes("rootwork") || lower.includes("root work")) topics.push("rootwork");
  if (lower.includes("healing")) topics.push("healing");
  if (lower.includes("journal")) topics.push("journaling");
  if (lower.includes("practice") || lower.includes("ritual")) topics.push("practices");
  if (lower.includes("premium") || lower.includes("membership")) topics.push("membership");
  if (lower.includes("wisdom")) topics.push("wisdom");

  return topics.length > 0 ? topics : ["unclassified"];
}

function assertSafeRequest(request: CrawlRequest, safety: LiveCrawlerSafetyOptions): string | null {
  if (!safety.allowLiveFetch) return "Live fetch is disabled. Set allowLiveFetch=true intentionally to use this adapter.";
  if (request.maxDepth > safety.maxDepth) return `Requested maxDepth ${request.maxDepth} exceeds safety maxDepth ${safety.maxDepth}.`;

  const host = new URL(request.rootUrl).hostname.replace(/^www\./, "");
  if (!safety.allowedHosts.includes(host)) return `Host ${host} is not in allowedHosts.`;

  return null;
}

export function createLiveCrawlerAdapter(fetchImpl: FetchLike, safety: LiveCrawlerSafetyOptions = defaultSafety): CrawlerAdapterContract {
  return {
    id: "ADAPTER-WEBSITE-LIVE-SAFE",
    name: "Safe Live Website Crawler Adapter",
    version: "0.1.0",
    sourceTypes: ["website"],
    createRequest(source: IngestionSource) {
      return { ...createCrawlRequest(source), maxDepth: Math.min(source.sections?.length ? 2 : 1, safety.maxDepth) };
    },
    async crawl(request: CrawlRequest): Promise<CrawlResult> {
      const safetyError = assertSafeRequest(request, safety);
      if (safetyError) {
        return {
          requestId: request.id,
          sourceId: request.sourceId,
          status: "failed",
          startedAt: request.requestedAt,
          completedAt: new Date().toISOString(),
          records: [],
          errors: [safetyError],
          summary: {
            requestedPaths: request.includePaths.length,
            fetchedRecords: 0,
            skippedRecords: request.includePaths.length,
            failedRecords: 1
          }
        };
      }

      const records: ExtractedContentRecord[] = [];
      const errors: string[] = [];

      for (const path of request.includePaths.slice(0, safety.maxRecords)) {
        const url = new URL(path, request.rootUrl).toString();

        try {
          const response = await fetchImpl(url);
          const html = await response.text();
          const text = stripHtml(html);

          records.push({
            id: `EXT-LIVE-${request.sourceId}-${records.length + 1}`,
            sourceId: request.sourceId,
            productId: request.productId,
            url: response.url || url,
            title: extractTitle(html, url),
            format: "html",
            excerpt: text.slice(0, 420),
            detectedType: url.includes("blog") || url.includes("wisdom") ? "article" : "page",
            detectedIntent: url.includes("premium") || url.includes("membership") ? "conversion" : "education",
            detectedTopics: detectTopics(text),
            status: response.ok ? "mapped" : "failed",
            httpStatus: response.status,
            canonicalUrl: response.url || url,
            discoveredAt: new Date().toISOString(),
            metadata: {
              adapter: "safe-live-crawler",
              liveFetch: true,
              safety
            }
          });
        } catch (error) {
          errors.push(`${url}: ${String(error)}`);
        }
      }

      return {
        requestId: request.id,
        sourceId: request.sourceId,
        status: errors.length > 0 && records.length === 0 ? "failed" : "completed",
        startedAt: request.requestedAt,
        completedAt: new Date().toISOString(),
        records,
        errors,
        summary: {
          requestedPaths: request.includePaths.length,
          fetchedRecords: records.length,
          skippedRecords: Math.max(request.includePaths.length - records.length - errors.length, 0),
          failedRecords: errors.length
        }
      };
    }
  };
}

export function describeLiveCrawlerSafety(safety: LiveCrawlerSafetyOptions = defaultSafety): string[] {
  return [
    safety.allowLiveFetch ? "Live fetch enabled." : "Live fetch disabled by default.",
    `Allowed hosts: ${safety.allowedHosts.join(", ")}`,
    `Max depth: ${safety.maxDepth}`,
    `Max records: ${safety.maxRecords}`
  ];
}
