import Lightpanda from "../index.js";
import type {
  CrawlConfig,
  CrawlBatchResult,
  CrawlPage,
  CrawlCursor,
  ResolvedCrawlConfig,
  FrontierEntry,
  PageLink,
  PageImage,
  PageMetadata,
  StopReason,
} from "./types.js";
import { resolveConfig } from "./types.js";
import {
  fetchRobotsTxt,
  parseRobotsTxt,
  isUrlAllowed,
  getCrawlDelay,
} from "./robots.js";
import { discoverSitemaps } from "./sitemap.js";
import { extractMetadata } from "./metadata.js";
import {
  extractLinksFromMarkdown,
  extractImagesFromMarkdown,
  normalizeUrl,
  matchesPattern,
  passesDomainFilter,
} from "./links.js";
import {
  createInitialCursor,
  encodeCursor,
  decodeCursor,
  isVisited,
  addVisited,
  addToFrontier,
  takeFromFrontier,
} from "./cursor.js";

/**
 * Crawl a batch of pages. Supports cursor-based pagination for serverless.
 *
 * First call: provide config, no cursor.
 * Subsequent calls: provide the cursor from the previous response.
 * When cursor is null in the response, the crawl is complete.
 */
export async function crawlBatch(
  config: CrawlConfig,
  cursorStr?: string
): Promise<CrawlBatchResult> {
  const startTime = Date.now();
  const resolved = resolveConfig(config);
  let cursor: CrawlCursor;

  if (cursorStr) {
    cursor = decodeCursor(cursorStr);
  } else {
    cursor = await initializeCrawl(resolved);
  }

  const pages: CrawlPage[] = [];
  let stopReason: StopReason = "complete";

  // Main crawl loop — process batches until budget exhausted
  while (cursor.frontier.length > 0) {
    // Check total page limit
    if (cursor.totalPagesCrawled >= resolved.maxPages) {
      stopReason = "limit";
      break;
    }

    // Check time budget (leave margin for encoding response)
    const elapsed = Date.now() - startTime;
    if (elapsed + resolved.pageTimeout + 2000 > resolved.timeBudget) {
      stopReason = "time_budget";
      break;
    }

    // Check crawl-delay compliance
    const seedRules = cursor.robotsCache[cursor.seedDomain];
    if (seedRules && cursor.lastFetchTime !== null) {
      const delay = getCrawlDelay(seedRules);
      if (delay !== null) {
        const since = Date.now() - cursor.lastFetchTime;
        if (since < delay) {
          stopReason = "crawl_delay";
          break;
        }
      }
    }

    // Take a batch from the frontier
    const batchSize = Math.min(
      resolved.concurrency,
      resolved.maxPages - cursor.totalPagesCrawled
    );
    const batch = takeFromFrontier(cursor, batchSize, resolved.strategy);
    if (batch.length === 0) break;

    // Process batch concurrently
    const results = await Promise.all(
      batch.map((entry) =>
        crawlSinglePage(entry, resolved, cursor).catch(
          (err): CrawlPage => ({
            url: entry.url,
            status: "error",
            status_code: null,
            markdown: "",
            metadata: null,
            links: [],
            images: [],
            depth: entry.depth,
            fetchTime: 0,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      )
    );

    // Update cursor with results
    for (const page of results) {
      pages.push(page);
      addVisited(cursor, page.url);
      cursor.totalPagesCrawled++;

      // Add discovered links to frontier
      if (
        page.status === "completed" &&
        (resolved.source === "all" || resolved.source === "links")
      ) {
        const newEntries: FrontierEntry[] = [];
        for (const link of page.links) {
          if (link.type === "external" && !resolved.includeExternalLinks) continue;
          const normalized = normalizeUrl(link.url);
          if (!normalized) continue;
          if (isVisited(cursor, normalized)) continue;
          if (page.depth + 1 > resolved.maxDepth) continue;
          if (!passesDomainFilter(normalized, cursor.seedDomain, resolved.includeSubdomains, resolved.includeExternalLinks)) continue;
          if (resolved.excludePatterns.length > 0 && matchesPattern(normalized, resolved.excludePatterns)) continue;
          if (resolved.includePatterns.length > 0 && !matchesPattern(normalized, resolved.includePatterns)) continue;

          newEntries.push({ url: normalized, depth: page.depth + 1 });
        }
        addToFrontier(cursor, newEntries);
      }
    }

    cursor.lastFetchTime = Date.now();
  }

  // Determine if crawl is complete
  if (cursor.frontier.length === 0) {
    stopReason = "complete";
  }

  const isComplete =
    stopReason === "complete" || cursor.totalPagesCrawled >= resolved.maxPages;

  return {
    pages,
    cursor: isComplete ? null : encodeCursor(cursor),
    stats: {
      pagesCrawled: pages.length,
      totalPagesCrawled: cursor.totalPagesCrawled,
      pagesRemaining: cursor.frontier.length,
      elapsed: Date.now() - startTime,
      stopReason,
    },
  };
}

/**
 * Initialize a fresh crawl: fetch robots.txt, discover sitemaps, seed frontier.
 */
async function initializeCrawl(
  config: ResolvedCrawlConfig
): Promise<CrawlCursor> {
  const seedUrl = normalizeUrl(config.url) || config.url;
  const seedDomain = new URL(seedUrl).hostname;
  const initialUrls: FrontierEntry[] = [];

  // Create cursor early so we can populate robotsCache
  const cursor = createInitialCursor(config, seedDomain, []);

  // Fetch and cache robots.txt
  if (config.obeyRobots) {
    const robotsTxt = await fetchRobotsTxt(seedUrl);
    if (robotsTxt) {
      cursor.robotsCache[seedDomain] = parseRobotsTxt(robotsTxt);
    }
  }

  // Discover sitemaps and seed frontier
  if (config.source === "all" || config.source === "sitemaps") {
    const discovery = await discoverSitemaps(seedUrl, {
      maxSitemaps: 50,
      maxDepth: 3,
    });
    for (const sitemapUrl of discovery.urls) {
      const normalized = normalizeUrl(sitemapUrl.url);
      if (normalized) {
        initialUrls.push({ url: normalized, depth: 0 });
      }
    }
  }

  // Add seed URL to frontier
  if (config.source === "all" || config.source === "links") {
    const normalized = normalizeUrl(seedUrl);
    if (normalized && !initialUrls.some((e) => e.url === normalized)) {
      // For "links" source, seed should be first; for "all", add if not already from sitemap
      initialUrls.unshift({ url: normalized, depth: 0 });
    }
  }

  addToFrontier(cursor, initialUrls);
  return cursor;
}

/**
 * Crawl a single page: dual-fetch (plain HTTP for metadata + Lightpanda for markdown).
 */
async function crawlSinglePage(
  entry: FrontierEntry,
  config: ResolvedCrawlConfig,
  cursor: CrawlCursor
): Promise<CrawlPage> {
  const start = Date.now();
  const { url, depth } = entry;

  // Check robots.txt
  const seedRules = cursor.robotsCache[cursor.seedDomain];
  if (config.obeyRobots && seedRules && !isUrlAllowed(url, seedRules)) {
    return {
      url,
      status: "disallowed",
      status_code: null,
      markdown: "",
      metadata: null,
      links: [],
      images: [],
      depth,
      fetchTime: Date.now() - start,
    };
  }

  // Check include/exclude patterns
  if (config.excludePatterns.length > 0 && matchesPattern(url, config.excludePatterns)) {
    return {
      url,
      status: "skipped",
      status_code: null,
      markdown: "",
      metadata: null,
      links: [],
      images: [],
      depth,
      fetchTime: Date.now() - start,
    };
  }
  if (config.includePatterns.length > 0 && !matchesPattern(url, config.includePatterns)) {
    return {
      url,
      status: "skipped",
      status_code: null,
      markdown: "",
      metadata: null,
      links: [],
      images: [],
      depth,
      fetchTime: Date.now() - start,
    };
  }

  try {
    let metadata: PageMetadata | null = null;
    let markdown = "";
    let statusCode: number | null = null;

    if (config.render) {
      // Dual-fetch: plain HTTP (metadata) + Lightpanda (markdown) in parallel
      const [htmlResult, markdownResult] = await Promise.allSettled([
        config.extractMetadata ? fetchHtmlHead(url, config.pageTimeout) : Promise.resolve(null),
        Lightpanda.fetch(url, {
          dump: "markdown",
          strip: config.strip,
          timeout: config.pageTimeout,
        }),
      ]);

      // Extract metadata from plain HTML
      if (
        config.extractMetadata &&
        htmlResult.status === "fulfilled" &&
        htmlResult.value
      ) {
        metadata = extractMetadata(htmlResult.value.html, url);
        statusCode = htmlResult.value.statusCode;
      }

      // Get markdown content
      if (markdownResult.status === "fulfilled") {
        markdown = markdownResult.value;
      } else {
        throw markdownResult.reason;
      }
    } else {
      // render: false — plain HTTP only, no Lightpanda
      const result = await fetchHtmlHead(url, config.pageTimeout);
      if (result) {
        statusCode = result.statusCode;
        if (config.extractMetadata) {
          metadata = extractMetadata(result.html, url);
        }
        // Basic markdown from plain HTML — just strip tags
        markdown = stripHtmlToText(result.html);
      }
    }

    // Extract links and images from markdown
    const links: PageLink[] = extractLinksFromMarkdown(markdown, url);
    const images: PageImage[] = extractImagesFromMarkdown(markdown);

    return {
      url,
      status: "completed",
      status_code: statusCode,
      markdown,
      metadata,
      links,
      images,
      depth,
      fetchTime: Date.now() - start,
    };
  } catch (err) {
    return {
      url,
      status: "error",
      status_code: null,
      markdown: "",
      metadata: null,
      links: [],
      images: [],
      depth,
      fetchTime: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch HTML via plain HTTP for metadata extraction.
 * Lightweight — no browser rendering.
 */
async function fetchHtmlHead(
  url: string,
  timeout: number
): Promise<{ html: string; statusCode: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LightpandaCrawler/1.0" },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
    const html = await res.text();
    return { html, statusCode: res.status };
  } catch {
    return null;
  }
}

/**
 * Very basic HTML-to-text for render:false mode.
 */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
