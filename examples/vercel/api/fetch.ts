import type { VercelRequest, VercelResponse } from "@vercel/node";
import Lightpanda from "@sendwithxmit/serverless-agent-browser";
import type { DumpFormat } from "@sendwithxmit/serverless-agent-browser";

const VALID_FORMATS: DumpFormat[] = ["html", "markdown", "semantic_tree", "semantic_tree_text"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = (req.query["url"] as string) || "https://example.com";
  const format = (req.query["format"] as string) || "markdown";

  if (!VALID_FORMATS.includes(format as DumpFormat)) {
    res.status(400).json({ error: "Invalid format. Use: html, markdown, semantic_tree, semantic_tree_text" });
    return;
  }

  try {
    const content = await Lightpanda.fetch(url, {
      dump: format as DumpFormat,
      insecureTls: true, // workaround for Lambda/AL2023 cert issues
      timeout: 25_000,
    });

    const contentType = format === "html" ? "text/html" : "text/plain";
    res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
    res.status(200).send(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
