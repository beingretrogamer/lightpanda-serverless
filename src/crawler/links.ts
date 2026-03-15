import type { PageLink, PageImage } from "./types.js";

/**
 * Extract links from markdown content.
 * Lightpanda already resolves all URLs to absolute, so no resolution needed.
 */
export function extractLinksFromMarkdown(
  markdown: string,
  baseUrl: string
): PageLink[] {
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  const seen = new Set<string>();
  const links: PageLink[] = [];
  const totalLength = markdown.length;
  const baseHost = safeHostname(baseUrl);

  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    let anchorText = match[1].trim();
    let url = match[2].trim();

    if (!url) continue;
    // Skip non-http links
    if (
      url.startsWith("javascript:") ||
      url.startsWith("mailto:") ||
      url.startsWith("tel:") ||
      url.startsWith("data:")
    )
      continue;

    // Skip image references that look like links (![alt](url) matched partially)
    if (match.index > 0 && markdown[match.index - 1] === "!") continue;

    // Clean anchor text — remove markdown formatting
    anchorText = cleanAnchorText(anchorText);
    if (!anchorText) continue;

    // Normalize URL
    url = normalizeUrl(url);
    if (!url) continue;

    // Deduplicate by URL
    if (seen.has(url)) continue;
    seen.add(url);

    // Categorize
    const type = isInternalLink(baseHost, url) ? "internal" : "external";
    const location = getLinkLocation(match.index, totalLength);

    links.push({ url, anchor_text: anchorText, type, location });
  }

  return links;
}

/**
 * Extract images from markdown ![alt](url) syntax.
 */
export function extractImagesFromMarkdown(markdown: string): PageImage[] {
  const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const seen = new Set<string>();
  const images: PageImage[] = [];

  let match;
  while ((match = imgPattern.exec(markdown)) !== null) {
    const alt = match[1].trim();
    const url = match[2].trim();

    if (!url || seen.has(url)) continue;
    seen.add(url);

    images.push({ url, alt });
  }

  return images;
}

/**
 * Clean markdown formatting from anchor text.
 */
function cleanAnchorText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
    .replace(/__(.*?)__/g, "$1") // __bold__
    .replace(/\*(.*?)\*/g, "$1") // *italic*
    .replace(/_(.*?)_/g, "$1") // _italic_
    .replace(/`(.*?)`/g, "$1") // `code`
    .trim();
}

/**
 * Determine if a link is in navigational position (header/footer)
 * based on its character position in the markdown.
 * First and last 15% are considered navigational.
 */
function getLinkLocation(
  position: number,
  totalLength: number
): "content" | "navigational" {
  if (totalLength === 0) return "content";
  const ratio = position / totalLength;
  return ratio < 0.15 || ratio > 0.85 ? "navigational" : "content";
}

/**
 * Check if a link URL is internal to the base domain.
 */
function isInternalLink(baseHost: string, linkUrl: string): boolean {
  const linkHost = safeHostname(linkUrl);
  if (!linkHost) return false;
  return linkHost === baseHost || linkHost.endsWith(`.${baseHost}`);
}

/**
 * Safely extract hostname from a URL string.
 */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Normalize a URL: strip fragments, trailing slashes, lowercase host.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Only keep http(s)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    // Strip fragment
    parsed.hash = "";
    // Remove trailing slash from pathname (except root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    return "";
  }
}

/**
 * Check if a URL matches any of the given wildcard patterns.
 * * matches any chars except /
 * ** matches any chars including /
 */
export function matchesPattern(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(url)) return true;
  }
  return false;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex chars
    .replace(/\*\*/g, "{{DOUBLESTAR}}") // Temp placeholder
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/{{DOUBLESTAR}}/g, ".*"); // ** matches anything

  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a URL passes the domain filter relative to the seed domain.
 */
export function passesDomainFilter(
  url: string,
  seedDomain: string,
  includeSubdomains: boolean,
  includeExternalLinks: boolean
): boolean {
  if (includeExternalLinks) return true;

  const linkHost = safeHostname(url);
  if (!linkHost) return false;

  if (linkHost === seedDomain) return true;
  if (includeSubdomains && linkHost.endsWith(`.${seedDomain}`)) return true;

  return false;
}
