import type { RobotsRules, RobotsRule } from "./types.js";

/**
 * Fetch robots.txt for a domain. Returns null on 404 or error.
 */
export async function fetchRobotsTxt(domain: string): Promise<string | null> {
  const url = domain.startsWith("http")
    ? new URL("/robots.txt", domain).href
    : `https://${domain}/robots.txt`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LightpandaCrawler/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse robots.txt content into structured rules for a given user-agent.
 * Follows Google's robots.txt spec: longest match wins, group-specific rules
 * take precedence over wildcard rules.
 */
export function parseRobotsTxt(
  content: string,
  userAgent: string = "*"
): RobotsRules {
  const sitemaps: string[] = [];
  const groupRules: RobotsRule[] = [];
  const wildcardRules: RobotsRule[] = [];
  let crawlDelay: number | null = null;
  let wildcardCrawlDelay: number | null = null;

  let currentAgents: string[] = [];
  let inRelevantGroup = false;
  let inWildcardGroup = false;

  const ua = userAgent.toLowerCase();

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Sitemap directives are global (not per-group)
    if (/^sitemap:\s*/i.test(line)) {
      const sitemapUrl = line.replace(/^sitemap:\s*/i, "").trim();
      if (sitemapUrl) sitemaps.push(sitemapUrl);
      continue;
    }

    if (/^user-agent:\s*/i.test(line)) {
      const agent = line.replace(/^user-agent:\s*/i, "").trim().toLowerCase();
      // If we were tracking agents and hit a new User-agent block, reset
      if (currentAgents.length > 0 && !inRelevantGroup && !inWildcardGroup) {
        currentAgents = [];
      }
      currentAgents.push(agent);
      inRelevantGroup = currentAgents.some(
        (a) => a === ua || ua.includes(a) || a.includes(ua)
      );
      inWildcardGroup = currentAgents.includes("*");
      continue;
    }

    if (/^allow:\s*/i.test(line)) {
      const pattern = line.replace(/^allow:\s*/i, "").trim();
      if (!pattern) continue;
      const rule: RobotsRule = { pattern, allow: true };
      if (inRelevantGroup) groupRules.push(rule);
      else if (inWildcardGroup) wildcardRules.push(rule);
      continue;
    }

    if (/^disallow:\s*/i.test(line)) {
      const pattern = line.replace(/^disallow:\s*/i, "").trim();
      // Empty Disallow means allow everything
      if (!pattern) continue;
      const rule: RobotsRule = { pattern, allow: false };
      if (inRelevantGroup) groupRules.push(rule);
      else if (inWildcardGroup) wildcardRules.push(rule);
      continue;
    }

    if (/^crawl-delay:\s*/i.test(line)) {
      const delay = parseFloat(line.replace(/^crawl-delay:\s*/i, "").trim());
      if (!isNaN(delay)) {
        if (inRelevantGroup) crawlDelay = delay * 1000;
        else if (inWildcardGroup) wildcardCrawlDelay = delay * 1000;
      }
      continue;
    }
  }

  // Use group-specific rules if available, else fall back to wildcard
  const rules = groupRules.length > 0 ? groupRules : wildcardRules;
  const finalDelay = crawlDelay ?? wildcardCrawlDelay;

  return { rules, crawlDelay: finalDelay, sitemaps };
}

/**
 * Convert a robots.txt pattern to a regex.
 * Supports * (match anything) and $ (end anchor).
 */
function patternToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/[.+?^{}()|[\]\\]/g, "\\$&") // Escape regex chars except * and $
    .replace(/\*/g, ".*"); // * → .*

  if (regex.endsWith("\\$")) {
    // Escaped $ at end means literal $
  } else if (regex.endsWith("$")) {
    // Real $ anchor — keep it
  } else {
    regex += ".*"; // No anchor — match anything after
  }

  return new RegExp(`^${regex}`);
}

/**
 * Check if a URL is allowed by the given robots.txt rules.
 * Uses Google-style longest-match-wins semantics.
 */
export function isUrlAllowed(url: string, rules: RobotsRules): boolean {
  if (rules.rules.length === 0) return true;

  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;

  let bestMatch: { length: number; allow: boolean } | null = null;

  for (const rule of rules.rules) {
    const regex = patternToRegex(rule.pattern);
    if (regex.test(path)) {
      const matchLength = rule.pattern.replace(/\*/g, "").length;
      if (!bestMatch || matchLength > bestMatch.length) {
        bestMatch = { length: matchLength, allow: rule.allow };
      } else if (matchLength === bestMatch.length && rule.allow) {
        // At equal length, Allow wins
        bestMatch = { length: matchLength, allow: true };
      }
    }
  }

  return bestMatch?.allow ?? true;
}

/**
 * Get the crawl delay in milliseconds, or null if none specified.
 */
export function getCrawlDelay(rules: RobotsRules): number | null {
  return rules.crawlDelay;
}

/**
 * Get sitemap URLs from robots.txt.
 */
export function getSitemapUrls(rules: RobotsRules): string[] {
  return rules.sitemaps;
}
