// ============================================================
// Page Metadata (ported from Python crawler's _extract_metadata)
// ============================================================

export interface OgMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  site_name: string | null;
}

export interface TwitterMetadata {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
}

export interface PageMetadata {
  title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  language: string | null;
  author: string | null;
  robots: string | null;
  og: OgMetadata | null;
  twitter: TwitterMetadata | null;
  jsonLd: unknown[] | null;
}

// ============================================================
// Links & Images
// ============================================================

export interface PageLink {
  url: string;
  anchor_text: string;
  type: "internal" | "external";
  location: "content" | "navigational";
}

export interface PageImage {
  url: string;
  alt: string;
}

// ============================================================
// Robots.txt
// ============================================================

export interface RobotsRule {
  pattern: string;
  allow: boolean;
}

export interface RobotsRules {
  rules: RobotsRule[];
  crawlDelay: number | null;
  sitemaps: string[];
}

// ============================================================
// Sitemap Discovery
// ============================================================

export interface SitemapUrl {
  url: string;
  lastmod?: string;
  priority?: number;
  source: string;
}

export interface SitemapInfo {
  url: string;
  type: "index" | "urlset";
  urlCount: number;
}

export interface DiscoverResult {
  domain: string;
  sitemaps: SitemapInfo[];
  totalUrls: number;
  urls: SitemapUrl[];
  hasMore: boolean;
}

// ============================================================
// Crawl Configuration
// ============================================================

export type CrawlStrategy = "bfs" | "dfs";
export type CrawlSource = "all" | "sitemaps" | "links";

export interface CrawlConfig {
  url: string;
  source?: CrawlSource;
  strategy?: CrawlStrategy;
  maxDepth?: number;
  maxPages?: number;
  concurrency?: number;
  timeBudget?: number;
  render?: boolean;
  obeyRobots?: boolean;
  extractMetadata?: boolean;
  includeSubdomains?: boolean;
  includeExternalLinks?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  pageTimeout?: number;
  strip?: string[];
}

export interface ResolvedCrawlConfig {
  url: string;
  source: CrawlSource;
  strategy: CrawlStrategy;
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  timeBudget: number;
  render: boolean;
  obeyRobots: boolean;
  extractMetadata: boolean;
  includeSubdomains: boolean;
  includeExternalLinks: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  pageTimeout: number;
  strip: string[];
}

export const DEFAULT_CONFIG: Omit<ResolvedCrawlConfig, "url"> = {
  source: "all",
  strategy: "bfs",
  maxDepth: 10,
  maxPages: 100,
  concurrency: 3,
  timeBudget: 55_000,
  render: true,
  obeyRobots: true,
  extractMetadata: false,
  includeSubdomains: false,
  includeExternalLinks: false,
  includePatterns: [],
  excludePatterns: [],
  pageTimeout: 15_000,
  strip: ["css"],
};

export function resolveConfig(config: CrawlConfig): ResolvedCrawlConfig {
  return { ...DEFAULT_CONFIG, ...config } as ResolvedCrawlConfig;
}

// ============================================================
// Crawl Page Result
// ============================================================

export interface CrawlPage {
  url: string;
  status: "completed" | "error" | "disallowed" | "skipped";
  status_code: number | null;
  markdown: string;
  metadata: PageMetadata | null;
  links: PageLink[];
  images: PageImage[];
  depth: number;
  fetchTime: number;
  error?: string;
}

// ============================================================
// Crawl Batch Result
// ============================================================

export type StopReason = "complete" | "limit" | "time_budget" | "crawl_delay";

export interface CrawlBatchResult {
  pages: CrawlPage[];
  cursor: string | null;
  stats: {
    pagesCrawled: number;
    totalPagesCrawled: number;
    pagesRemaining: number;
    elapsed: number;
    stopReason: StopReason;
  };
}

// ============================================================
// Cursor State (internal)
// ============================================================

export interface FrontierEntry {
  url: string;
  depth: number;
}

export interface CrawlCursor {
  visitedHashes: number[];
  frontier: FrontierEntry[];
  config: ResolvedCrawlConfig;
  robotsCache: Record<string, RobotsRules>;
  totalPagesCrawled: number;
  lastFetchTime: number | null;
  seedDomain: string;
}
