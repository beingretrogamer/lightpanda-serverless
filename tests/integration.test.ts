import { describe, it, assert } from "./harness.js";
import { extractMetadata } from "../src/crawler/metadata.js";
import { extractLinksFromMarkdown } from "../src/crawler/links.js";
import {
  fetchRobotsTxt,
  parseRobotsTxt,
  isUrlAllowed,
} from "../src/crawler/robots.js";
import { discoverSitemaps } from "../src/crawler/sitemap.js";

async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
}

describe("integration: real HTTP calls", () => {
  it("robots.txt: fetch and parse from a real site", async () => {
    const content = await fetchRobotsTxt("https://www.google.com");
    if (content === null) {
      console.log("      (skipped: network unavailable)");
      return;
    }
    assert(content.length > 100, "should have substantial content");

    const rules = parseRobotsTxt(content);
    assert(rules.rules.length > 0, "should have rules");
    assert(rules.sitemaps.length > 0, "google should have sitemap directives");
  });

  it("robots.txt: check google disallow /search", async () => {
    const content = await fetchRobotsTxt("https://www.google.com");
    if (content === null) {
      console.log("      (skipped: network unavailable)");
      return;
    }
    const rules = parseRobotsTxt(content);
    assert(
      !isUrlAllowed("https://www.google.com/search?q=test", rules),
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
  });

  it("metadata: fetch and extract from a real page", async () => {
    const res = await safeFetch("https://example.com");
    if (!res) {
      console.log("      (skipped: network unavailable)");
      return;
    }
    const html = await res.text();
    const metadata = extractMetadata(html, "https://example.com");

    assert(metadata.title !== null, `should have title: ${metadata.title}`);
    assert(typeof metadata.title === "string", "title is string");
  });

  it("metadata + links: end-to-end with fetched HTML", async () => {
    const res = await safeFetch("https://example.com");
    if (!res) {
      console.log("      (skipped: network unavailable)");
      return;
    }
    const html = await res.text();
    const metadata = extractMetadata(html, "https://example.com");

    assert(metadata.title !== null, "should have a title");

    const linkMatches = html.match(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi);
    if (linkMatches && linkMatches.length > 0) {
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
