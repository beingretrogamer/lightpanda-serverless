import { describe, it, assert } from "./harness.js";
import { extractMetadata } from "../src/crawler/metadata.js";
import { extractLinksFromMarkdown } from "../src/crawler/links.js";
import {
  fetchRobotsTxt,
  parseRobotsTxt,
  isUrlAllowed,
} from "../src/crawler/robots.js";
import { discoverSitemaps } from "../src/crawler/sitemap.js";

describe("integration: real HTTP calls", () => {
  it("robots.txt: fetch and parse from a real site", async () => {
    const content = await fetchRobotsTxt("https://www.google.com");
    assert(content !== null, "google should have robots.txt");
    assert(content!.length > 100, "should have substantial content");

    const rules = parseRobotsTxt(content!);
    assert(rules.rules.length > 0, "should have rules");
    assert(rules.sitemaps.length > 0, "google should have sitemap directives");
  });

  it("robots.txt: check google disallow /search", async () => {
    const content = await fetchRobotsTxt("https://www.google.com");
    assert(content !== null, "should fetch robots.txt");
    const rules = parseRobotsTxt(content!, "Googlebot");
    // Google disallows /search for most bots
    const rules2 = parseRobotsTxt(content!);
    assert(
      !isUrlAllowed("https://www.google.com/search?q=test", rules2),
      "/search should be disallowed for *"
    );
  });

  it("sitemap: discover sitemaps from a real site", async () => {
    const result = await discoverSitemaps("https://www.github.com", {
      maxSitemaps: 5,
      maxDepth: 1,
    });
    assert(typeof result.domain === "string", "should have domain");
    assert(Array.isArray(result.sitemaps), "should have sitemaps array");
    // GitHub may or may not have sitemaps, but the call should not throw
  });

  it("metadata: fetch and extract from a real page", async () => {
    const res = await fetch("https://example.com", {
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    const metadata = extractMetadata(html, "https://example.com");

    assert(metadata.title !== null, `should have title: ${metadata.title}`);
    assert(typeof metadata.title === "string", "title is string");
  });

  it("metadata + links: end-to-end with fetched HTML", async () => {
    const res = await fetch("https://example.com", {
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    const metadata = extractMetadata(html, "https://example.com");

    // example.com is simple - it should have a title
    assert(metadata.title !== null, "should have a title");

    // The HTML from example.com contains at least one link
    // Convert to pseudo-markdown for link extraction test
    const linkMatches = html.match(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi);
    if (linkMatches && linkMatches.length > 0) {
      // Build markdown-style links
      const md = linkMatches
        .map((m) => {
          const href = m.match(/href="([^"]+)"/)?.[1] ?? "";
          const text = m.replace(/<[^>]+>/g, "");
          return `[${text}](${href})`;
        })
        .join("\n");
      const links = extractLinksFromMarkdown(md, "https://example.com");
      assert(links.length > 0, "should extract links from markdown");
    }
  });
});
