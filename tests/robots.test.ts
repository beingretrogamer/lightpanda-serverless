import { describe, it, assert } from "./harness.js";
import {
  parseRobotsTxt,
  isUrlAllowed,
  getCrawlDelay,
  getSitemapUrls,
  fetchRobotsTxt,
} from "../src/crawler/robots.js";

describe("robots.ts", () => {
  it("parseRobotsTxt: basic disallow", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow: /admin/\nDisallow: /private`
    );
    assert(rules.rules.length === 2, "should have 2 rules");
    assert(rules.rules[0].pattern === "/admin/", "first rule pattern");
    assert(rules.rules[0].allow === false, "first rule is disallow");
  });

  it("parseRobotsTxt: allow + disallow with longest match", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow: /\nAllow: /public/`
    );
    assert(
      isUrlAllowed("https://example.com/public/page", rules),
      "/public/page should be allowed (longer match)"
    );
    assert(
      !isUrlAllowed("https://example.com/admin/page", rules),
      "/admin/page should be disallowed"
    );
  });

  it("parseRobotsTxt: crawl-delay", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nCrawl-delay: 2\nDisallow: /x`
    );
    assert(getCrawlDelay(rules) === 2000, "crawl delay should be 2000ms");
  });

  it("parseRobotsTxt: sitemap directives", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/sitemap2.xml`
    );
    const sitemaps = getSitemapUrls(rules);
    assert(sitemaps.length === 2, "should find 2 sitemaps");
    assert(
      sitemaps[0] === "https://example.com/sitemap.xml",
      "first sitemap URL"
    );
  });

  it("parseRobotsTxt: user-agent specific group", () => {
    const rules = parseRobotsTxt(
      `User-agent: LightpandaCrawler\nDisallow: /secret/\n\nUser-agent: *\nDisallow: /`,
      "LightpandaCrawler"
    );
    assert(
      isUrlAllowed("https://example.com/public", rules),
      "LightpandaCrawler should be able to access /public"
    );
    assert(
      !isUrlAllowed("https://example.com/secret/page", rules),
      "LightpandaCrawler should not access /secret/"
    );
  });

  it("isUrlAllowed: wildcard * in pattern", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow: /search*q=`
    );
    assert(
      !isUrlAllowed("https://example.com/search?q=test", rules),
      "should block /search?q=..."
    );
    assert(
      isUrlAllowed("https://example.com/search-results", rules),
      "should allow /search-results (no q=)"
    );
  });

  it("isUrlAllowed: $ anchor", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow: /exact$`
    );
    assert(
      !isUrlAllowed("https://example.com/exact", rules),
      "should block /exact exactly"
    );
    assert(
      isUrlAllowed("https://example.com/exact/more", rules),
      "should allow /exact/more (no $ match)"
    );
  });

  it("isUrlAllowed: empty rules = allow all", () => {
    const rules = parseRobotsTxt(`User-agent: *\nDisallow:`);
    assert(
      isUrlAllowed("https://example.com/anything", rules),
      "empty disallow should allow all"
    );
  });

  it("fetchRobotsTxt: real fetch against example.com", async () => {
    const content = await fetchRobotsTxt("https://example.com");
    // example.com may or may not have robots.txt — both null and string are valid
    assert(
      content === null || typeof content === "string",
      "should return null or string"
    );
  });
});
