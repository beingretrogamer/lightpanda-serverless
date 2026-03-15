import type { VercelRequest, VercelResponse } from "@vercel/node";
import { crawlBatch } from "@sendwithxmit/serverless-agent-browser/crawler";
import { validateApiKey } from "../../lib/auth.js";
import { mapCrawlPage } from "../../lib/mapper.js";

/**
 * POST /api/crawl/page
 *
 * Single page crawl with structured content extraction.
 * Drop-in replacement for the Python crawler's /api/crawl/page endpoint.
 *
 * Body: { url: string, respect_robots_txt?: boolean }
 * Returns: { status: "success", data: CrawledPageData }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", error_message: "Method not allowed. Use POST." });
    return;
  }

  if (!validateApiKey(req, res)) return;

  const body = req.body as { url?: string; respect_robots_txt?: boolean } | undefined;

  if (!body?.url) {
    res.status(400).json({ status: "error", error_message: "Missing required field: url" });
    return;
  }

  try {
    const result = await crawlBatch({
      url: body.url,
      maxPages: 1,
      source: "links",
      extractMetadata: true,
      render: true,
      obeyRobots: body.respect_robots_txt ?? false,
      pageTimeout: 25_000,
      timeBudget: 55_000,
      strip: ["css"],
    });

    const page = result.pages[0];
    if (!page || page.status === "error") {
      const errorMsg = page?.error ?? "Failed to crawl page";
      res.status(200).json({
        status: "error",
        error_message: errorMsg,
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: mapCrawlPage(page),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: "error", error_message: message });
  }
}
