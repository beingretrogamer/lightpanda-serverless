import type { VercelRequest, VercelResponse } from "@vercel/node";
import { crawlBatch } from "@lightpanda/serverless/crawler";
import type { CrawlConfig } from "@lightpanda/serverless/crawler";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = req.body as { config?: CrawlConfig; cursor?: string } | undefined;

  if (!body?.config?.url) {
    res.status(400).json({
      error: "Missing required field: config.url",
      example: {
        config: {
          url: "https://example.com",
          maxPages: 10,
          source: "all",
        },
      },
    });
    return;
  }

  try {
    const result = await crawlBatch(body.config, body.cursor);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
