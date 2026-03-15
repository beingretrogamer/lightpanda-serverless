import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Validate API key from X-API-Key or Authorization header.
 * Returns true if valid (or if no key is configured), false if rejected.
 */
export function validateApiKey(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.CRAWLER_API_KEY;
  if (!expected) return true; // no key configured, allow all

  const key =
    (req.headers["x-api-key"] as string) ??
    (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "");

  if (key === expected) return true;

  res.status(401).json({ status: "error", error_message: "Invalid or missing API key" });
  return false;
}
