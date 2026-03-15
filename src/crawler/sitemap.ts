import { gunzipSync } from "node:zlib";
import type { DiscoverResult, SitemapInfo, SitemapUrl } from "./types.js";
import { fetchRobotsTxt, parseRobotsTxt, getSitemapUrls } from "./robots.js";

const COMMON_LOCATIONS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap-0.xml",
  "/sitemap1.xml",
  "/sitemap.php",
  "/sitemap.txt",
];

export interface DiscoverOptions {
  maxSitemaps?: number;
  maxDepth?: number;
}

/**
 * Discover all sitemaps for a domain and enumerate their URLs.
 * Flow: robots.txt → Sitemap: directives → common locations → recursive resolution.
 */
export async function discoverSitemaps(
  domain: string,
  opts: DiscoverOptions = {}
): Promise<DiscoverResult> {
  const maxSitemaps = opts.maxSitemaps ?? 50;
  const maxDepth = opts.maxDepth ?? 3;
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;
  const parsedOrigin = new URL(origin);
  const domainName = parsedOrigin.hostname;

  const allSitemaps: SitemapInfo[] = [];
  const allUrls: SitemapUrl[] = [];
  let sitemapCount = 0;
  let hasMore = false;

  // Step 1: Check robots.txt for Sitemap: directives
  const robotsTxt = await fetchRobotsTxt(origin);
  let sitemapSeedUrls: string[] = [];

  if (robotsTxt) {
    const rules = parseRobotsTxt(robotsTxt);
    sitemapSeedUrls = getSitemapUrls(rules);
  }

  // Step 2: If no sitemaps in robots.txt, try common locations
  if (sitemapSeedUrls.length === 0) {
    for (const path of COMMON_LOCATIONS) {
      const url = new URL(path, origin).href;
      const content = await fetchSitemapContent(url);
      if (content) {
        sitemapSeedUrls.push(url);
        break; // Use first found
      }
    }
  }

  // Step 3: Recursively resolve all sitemaps
  for (const seedUrl of sitemapSeedUrls) {
    if (sitemapCount >= maxSitemaps) {
      hasMore = true;
      break;
    }
    await resolveSitemap(
      seedUrl,
      0,
      maxDepth,
      maxSitemaps,
      allSitemaps,
      allUrls,
      { count: sitemapCount, hasMore },
      (c) => { sitemapCount = c.count; hasMore = c.hasMore; }
    );
  }

  return {
    domain: domainName,
    sitemaps: allSitemaps,
    totalUrls: allUrls.length,
    urls: allUrls,
    hasMore,
  };
}

interface Counter {
  count: number;
  hasMore: boolean;
}

async function resolveSitemap(
  url: string,
  depth: number,
  maxDepth: number,
  maxSitemaps: number,
  sitemaps: SitemapInfo[],
  urls: SitemapUrl[],
  counter: Counter,
  updateCounter: (c: Counter) => void
): Promise<void> {
  if (counter.count >= maxSitemaps) {
    counter.hasMore = true;
    updateCounter(counter);
    return;
  }
  if (depth > maxDepth) {
    counter.hasMore = true;
    updateCounter(counter);
    return;
  }

  const content = await fetchSitemapContent(url);
  if (!content) return;

  counter.count++;
  updateCounter(counter);

  const parsed = parseSitemapXml(content);

  if (parsed.type === "index") {
    sitemaps.push({ url, type: "index", urlCount: parsed.childSitemaps.length });

    for (const childUrl of parsed.childSitemaps) {
      if (counter.count >= maxSitemaps) {
        counter.hasMore = true;
        updateCounter(counter);
        break;
      }
      await resolveSitemap(
        childUrl,
        depth + 1,
        maxDepth,
        maxSitemaps,
        sitemaps,
        urls,
        counter,
        updateCounter
      );
    }
  } else {
    // urlset
    sitemaps.push({ url, type: "urlset", urlCount: parsed.entries.length });
    for (const entry of parsed.entries) {
      urls.push({ ...entry, source: url });
    }
  }
}

interface ParsedSitemapIndex {
  type: "index";
  childSitemaps: string[];
  entries: never[];
}

interface ParsedSitemapUrlset {
  type: "urlset";
  childSitemaps: never[];
  entries: Array<{ url: string; lastmod?: string; priority?: number }>;
}

type ParsedSitemap = ParsedSitemapIndex | ParsedSitemapUrlset;

/**
 * Parse sitemap XML using regex. Detects index vs urlset.
 * Handles the urlset-based index heuristic from the Python crawler.
 */
export function parseSitemapXml(content: string): ParsedSitemap {
  // Check for <sitemap> elements → this is an index
  const sitemapBlockRe = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
  const childSitemaps: string[] = [];
  let sitemapMatch;

  while ((sitemapMatch = sitemapBlockRe.exec(content)) !== null) {
    const loc = extractTag(sitemapMatch[1], "loc");
    if (loc) childSitemaps.push(loc);
  }

  if (childSitemaps.length > 0) {
    return { type: "index", childSitemaps, entries: [] as never[] };
  }

  // Parse <url> elements
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/gi;
  const entries: Array<{ url: string; lastmod?: string; priority?: number }> = [];
  const potentialSitemaps: string[] = [];
  let urlMatch;

  while ((urlMatch = urlBlockRe.exec(content)) !== null) {
    const block = urlMatch[1];
    const loc = extractTag(block, "loc");
    if (!loc) continue;

    const lastmod = extractTag(block, "lastmod") ?? undefined;
    const priorityStr = extractTag(block, "priority");
    const priority = priorityStr ? parseFloat(priorityStr) : undefined;

    // Heuristic: detect urlset-based sitemap index
    if (
      loc.endsWith(".xml") &&
      loc.toLowerCase().includes("sitemap")
    ) {
      potentialSitemaps.push(loc);
    }

    entries.push({ url: loc, lastmod, priority: isNaN(priority as number) ? undefined : priority });
  }

  // If most URLs look like sitemap references, treat as an index
  if (potentialSitemaps.length > 0 && potentialSitemaps.length >= entries.length / 2) {
    return {
      type: "index",
      childSitemaps: potentialSitemaps,
      entries: [] as never[],
    };
  }

  return { type: "urlset", childSitemaps: [] as never[], entries };
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Fetch sitemap content. Handles .xml.gz (gzip) and plain XML.
 */
async function fetchSitemapContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LightpandaCrawler/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    if (url.endsWith(".gz")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return gunzipSync(buffer).toString("utf-8");
    }

    return await res.text();
  } catch {
    return null;
  }
}
