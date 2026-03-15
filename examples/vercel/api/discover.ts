import type { VercelRequest, VercelResponse } from "@vercel/node";
import { discoverSitemaps } from "@sendwithxmit/serverless-agent-browser/crawler";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = req.query["url"] as string;

  if (!url) {
    res.status(400).json({ error: "Missing required 'url' query parameter" });
    return;
  }

  try {
    const result = await discoverSitemaps(url, {
      maxSitemaps: 50,
      maxDepth: 3,
    });

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
