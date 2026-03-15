import type { VercelRequest, VercelResponse } from "@vercel/node";
import { discoverSitemaps } from "@sendwithxmit/serverless-agent-browser/crawler";
import type { SitemapUrl } from "@sendwithxmit/serverless-agent-browser/crawler";
import { validateApiKey } from "../../lib/auth.js";

/**
 * Contenter-compatible sitemap page entry.
 */
interface SitemapPage {
  url: string;
  sitemap_slug: string;
  sitemap_url: string;
  priority?: number;
  lastmod?: string;
}

/**
 * Extract relative path from an absolute URL.
 */
function toRelativePath(absoluteUrl: string, baseUrl: string): string {
  try {
    const parsed = new URL(absoluteUrl);
    const base = new URL(baseUrl);
    if (parsed.origin === base.origin) {
      return parsed.pathname + parsed.search;
    }
  } catch {
    // fall through
  }
  return absoluteUrl;
}

/**
 * Derive a sitemap slug from its full URL.
 * e.g. "https://example.com/post-sitemap.xml" -> "post-sitemap.xml"
 */
function deriveSitemapSlug(sitemapUrl: string): string {
  try {
    const pathname = new URL(sitemapUrl).pathname;
    return pathname.split("/").pop() ?? "sitemap.xml";
  } catch {
    return "sitemap.xml";
  }
}

function mapSitemapUrl(entry: SitemapUrl, baseUrl: string): SitemapPage {
  return {
    url: toRelativePath(entry.url, baseUrl),
    sitemap_slug: deriveSitemapSlug(entry.source),
    sitemap_url: entry.source,
    priority: entry.priority,
    lastmod: entry.lastmod,
  };
}

/**
 * POST /api/sitemap/pages
 *
 * Discover sitemap pages for a domain.
 * Drop-in replacement for the Python crawler's /api/sitemap/pages endpoint.
 *
 * Body: { url: string, sitemap_url?: string, priority_threshold?: number }
 * Returns: SitemapResponse
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", error_message: "Method not allowed. Use POST." });
    return;
  }

  if (!validateApiKey(req, res)) return;

  const body = req.body as { url?: string; sitemap_url?: string; priority_threshold?: number } | undefined;

  if (!body?.url) {
    res.status(400).json({ status: "error", error_message: "Missing required field: url" });
    return;
  }

  try {
    const result = await discoverSitemaps(body.url, {
      maxSitemaps: 50,
      maxDepth: 3,
    });

    let urls = result.urls;

    // Filter by priority threshold if requested
    if (body.priority_threshold != null) {
      urls = urls.filter((u) => (u.priority ?? 0) >= body.priority_threshold!);
    }

    const mappedUrls = urls.map((u) => mapSitemapUrl(u, body.url!));

    res.status(200).json({
      status: "success",
      total_urls: result.totalUrls,
      urls: mappedUrls,
      retrieved_at: new Date().toISOString(),
      hasMore: result.hasMore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: "error", error_message: message });
  }
}
