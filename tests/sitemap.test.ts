import { describe, it, assert } from "./harness.js";
import { parseSitemapXml, discoverSitemaps } from "../src/crawler/sitemap.js";

describe("sitemap.ts", () => {
  it("parseSitemapXml: parses urlset", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc><lastmod>2025-01-01</lastmod><priority>0.8</priority></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    assert(result.type === "urlset", `type: ${result.type}`);
    assert(result.entries.length === 2, `entries: ${result.entries.length}`);
    assert(result.entries[0].url === "https://example.com/page1", "first url");
    assert(result.entries[0].lastmod === "2025-01-01", "lastmod");
    assert(result.entries[0].priority === 0.8, "priority");
    assert(result.entries[1].lastmod === undefined, "no lastmod");
  });

  it("parseSitemapXml: parses sitemap index", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;
    const result = parseSitemapXml(xml);
    assert(result.type === "index", `type: ${result.type}`);
    assert(result.childSitemaps.length === 2, "2 child sitemaps");
    assert(
      result.childSitemaps[0] === "https://example.com/sitemap-posts.xml",
      "first child"
    );
  });

  it("parseSitemapXml: detects urlset-based index", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/sitemap-1.xml</loc></url>
  <url><loc>https://example.com/sitemap-2.xml</loc></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    assert(
      result.type === "index",
      "should detect as index when URLs look like sitemaps"
    );
  });

  it("discoverSitemaps: real fetch against a domain", async () => {
    // Use a known site with sitemaps
    const result = await discoverSitemaps("https://www.google.com", {
      maxSitemaps: 3,
      maxDepth: 1,
    });
    assert(typeof result.domain === "string", "domain should be a string");
    assert(Array.isArray(result.sitemaps), "sitemaps should be array");
    assert(typeof result.totalUrls === "number", "totalUrls should be number");
    assert(typeof result.hasMore === "boolean", "hasMore should be boolean");
  });
});
