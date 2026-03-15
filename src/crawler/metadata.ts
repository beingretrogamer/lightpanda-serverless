import type { PageMetadata, OgMetadata, TwitterMetadata } from "./types.js";

/**
 * Extract metadata from HTML <head> section.
 * Pure function, regex-based — no external dependencies.
 */
export function extractMetadata(html: string, url: string): PageMetadata {
  // Extract <head> block for efficiency
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html;

  const title = extractTitle(head);
  const meta_description = extractMeta(head, "description");
  const canonical_url = extractCanonical(head);
  const language = extractLanguage(html);
  const author = extractMeta(head, "author");
  const robots = extractMeta(head, "robots");
  const og = extractOg(head);
  const twitter = extractTwitter(head);
  const jsonLd = extractJsonLd(head);

  return {
    title,
    meta_description,
    canonical_url,
    language,
    author,
    robots,
    og,
    twitter,
    jsonLd,
  };
}

function extractTitle(head: string): string | null {
  const match = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

/**
 * Extract <meta> tag by name attribute.
 * Handles both name="..." content="..." and content="..." name="..." orderings.
 */
function extractMeta(head: string, name: string): string | null {
  // Pattern 1: name="..." ... content="..."
  const p1 = new RegExp(
    `<meta[^>]*name\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*?)["'][^>]*>`,
    "i"
  );
  const m1 = head.match(p1);
  if (m1) return decodeEntities(m1[1]);

  // Pattern 2: content="..." ... name="..."
  const p2 = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']*?)["'][^>]*name\\s*=\\s*["']${name}["'][^>]*>`,
    "i"
  );
  const m2 = head.match(p2);
  if (m2) return decodeEntities(m2[1]);

  return null;
}

/**
 * Extract <meta> tag by property attribute (used for OG and some Twitter tags).
 */
function extractMetaProperty(head: string, property: string): string | null {
  // Pattern 1: property="..." ... content="..."
  const p1 = new RegExp(
    `<meta[^>]*property\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*?)["'][^>]*>`,
    "i"
  );
  const m1 = head.match(p1);
  if (m1) return decodeEntities(m1[1]);

  // Pattern 2: content="..." ... property="..."
  const p2 = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']*?)["'][^>]*property\\s*=\\s*["']${property}["'][^>]*>`,
    "i"
  );
  const m2 = head.match(p2);
  if (m2) return decodeEntities(m2[1]);

  return null;
}

function extractCanonical(head: string): string | null {
  const match = head.match(
    /<link[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  if (match) return match[1];

  // Reversed attribute order
  const match2 = head.match(
    /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["'][^>]*>/i
  );
  return match2 ? match2[1] : null;
}

function extractLanguage(html: string): string | null {
  const match = html.match(/<html[^>]*lang\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function extractOg(head: string): OgMetadata | null {
  const title = extractMetaProperty(head, "og:title");
  const description = extractMetaProperty(head, "og:description");
  const image = extractMetaProperty(head, "og:image");
  const url = extractMetaProperty(head, "og:url");
  const type = extractMetaProperty(head, "og:type");
  const site_name = extractMetaProperty(head, "og:site_name");

  if (!title && !description && !image && !url) return null;
  return { title, description, image, url, type, site_name };
}

function extractTwitter(head: string): TwitterMetadata | null {
  // Twitter uses both name="twitter:*" and property="twitter:*"
  const card =
    extractMeta(head, "twitter:card") ??
    extractMetaProperty(head, "twitter:card");
  const title =
    extractMeta(head, "twitter:title") ??
    extractMetaProperty(head, "twitter:title");
  const description =
    extractMeta(head, "twitter:description") ??
    extractMetaProperty(head, "twitter:description");
  const image =
    extractMeta(head, "twitter:image") ??
    extractMetaProperty(head, "twitter:image");
  const site =
    extractMeta(head, "twitter:site") ??
    extractMetaProperty(head, "twitter:site");

  if (!card && !title && !description && !image) return null;
  return { card, title, description, image, site };
}

function extractJsonLd(head: string): unknown[] | null {
  const regex =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results: unknown[] = [];
  let match;

  while ((match = regex.exec(head)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return results.length > 0 ? results : null;
}

/** Decode common HTML entities */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
