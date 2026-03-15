import type { CrawlPage, PageLink, PageImage } from "@sendwithxmit/serverless-agent-browser/crawler";

/**
 * Contenter-compatible response types.
 * Matches the interfaces in contenter/src/integrations/crawler/client.ts.
 */

export interface CrawledLink {
  url: string;
  anchor_text: string;
  type: "internal" | "external";
  location?: "content" | "navigational";
}

export interface CrawledImage {
  url: string;
  alt_text: string;
  location: string;
}

export interface CrawledPageData {
  url: string;
  title: string;
  meta_description: string | null;
  canonical_url: string | null;
  robots: string | null;
  author: string | null;
  language: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_url: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image: string | null;
  page_schema: unknown;
  status_code: number;
  content_snippet: string;
  text_length: number;
  links: CrawledLink[];
  images: CrawledImage[];
  links_count: {
    total: number;
    internal: number;
    external: number;
    content: number;
    navigational: number;
  };
  processed_at: string;
}

function mapLinks(links: PageLink[]): CrawledLink[] {
  return links.map((l) => ({
    url: l.url,
    anchor_text: l.anchor_text,
    type: l.type,
    location: l.location,
  }));
}

function mapImages(images: PageImage[]): CrawledImage[] {
  return images.map((i) => ({
    url: i.url,
    alt_text: i.alt,
    location: "content",
  }));
}

function computeLinkCounts(links: PageLink[]) {
  let internal = 0;
  let external = 0;
  let content = 0;
  let navigational = 0;
  for (const l of links) {
    if (l.type === "internal") internal++;
    else external++;
    if (l.location === "content") content++;
    else navigational++;
  }
  return { total: links.length, internal, external, content, navigational };
}

/**
 * Map a Lightpanda CrawlPage to contenter's CrawledPageData format.
 */
export function mapCrawlPage(page: CrawlPage): CrawledPageData {
  const md = page.metadata;
  return {
    url: page.url,
    title: md?.title ?? "",
    meta_description: md?.meta_description ?? null,
    canonical_url: md?.canonical_url ?? null,
    robots: md?.robots ?? null,
    author: md?.author ?? null,
    language: md?.language ?? null,
    og_title: md?.og?.title ?? null,
    og_description: md?.og?.description ?? null,
    og_image: md?.og?.image ?? null,
    og_url: md?.og?.url ?? null,
    twitter_title: md?.twitter?.title ?? null,
    twitter_description: md?.twitter?.description ?? null,
    twitter_image: md?.twitter?.image ?? null,
    page_schema: md?.jsonLd ?? null,
    status_code: page.status_code ?? 200,
    content_snippet: page.markdown,
    text_length: page.markdown.length,
    links: mapLinks(page.links),
    images: mapImages(page.images),
    links_count: computeLinkCounts(page.links),
    processed_at: new Date().toISOString(),
  };
}
