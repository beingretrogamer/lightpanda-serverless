import { describe, it, assert } from "./harness.js";
import {
  extractLinksFromMarkdown,
  extractImagesFromMarkdown,
  normalizeUrl,
  matchesPattern,
  passesDomainFilter,
} from "../src/crawler/links.js";

describe("links.ts", () => {
  it("extractLinksFromMarkdown: basic link extraction", () => {
    const md = `Check out [Example](https://example.com) and [Google](https://google.com)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    assert(links.length === 2, `found ${links.length} links`);
    assert(links[0].anchor_text === "Example", "first anchor text");
    assert(links[0].url === "https://example.com/", "first url");
    assert(links[0].type === "internal", "first should be internal");
    assert(links[1].type === "external", "second should be external");
  });

  it("extractLinksFromMarkdown: skips javascript and mailto", () => {
    const md = `[Click](javascript:alert(1)) and [Email](mailto:test@x.com)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    assert(links.length === 0, "should skip non-http links");
  });

  it("extractLinksFromMarkdown: cleans anchor text formatting", () => {
    const md = `[**Bold Link**](https://example.com/a) and [\`code\`](https://example.com/b)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    assert(links[0].anchor_text === "Bold Link", `cleaned: ${links[0].anchor_text}`);
    assert(links[1].anchor_text === "code", `cleaned: ${links[1].anchor_text}`);
  });

  it("extractLinksFromMarkdown: deduplicates by URL", () => {
    const md = `[Link1](https://example.com) and [Link2](https://example.com)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    assert(links.length === 1, "should deduplicate");
  });

  it("extractLinksFromMarkdown: does not extract images as links", () => {
    const md = `![Alt text](https://example.com/image.png)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    assert(links.length === 0, "should not extract image as link");
  });

  it("extractImagesFromMarkdown: basic extraction", () => {
    const md = `![Logo](https://example.com/logo.png) and ![](https://example.com/empty.jpg)`;
    const images = extractImagesFromMarkdown(md);
    assert(images.length === 2, `found ${images.length} images`);
    assert(images[0].alt === "Logo", "first alt");
    assert(images[1].alt === "", "second alt empty");
  });

  it("normalizeUrl: strips fragments and trailing slash", () => {
    assert(
      normalizeUrl("https://example.com/page/#section") === "https://example.com/page",
      "should strip fragment and trailing slash"
    );
  });

  it("normalizeUrl: returns empty for non-http", () => {
    assert(normalizeUrl("ftp://x.com") === "", "should reject ftp");
    assert(normalizeUrl("not a url") === "", "should reject invalid");
  });

  it("matchesPattern: single star", () => {
    assert(
      matchesPattern("https://example.com/docs/api", ["https://example.com/docs/*"]),
      "single * should match path segment"
    );
    assert(
      !matchesPattern("https://example.com/docs/v2/api", ["https://example.com/docs/*"]),
      "single * should not match across /"
    );
  });

  it("matchesPattern: double star", () => {
    assert(
      matchesPattern("https://example.com/docs/v2/api", ["https://example.com/docs/**"]),
      "** should match across /"
    );
  });

  it("passesDomainFilter: same domain", () => {
    assert(
      passesDomainFilter("https://example.com/page", "example.com", false, false),
      "same domain should pass"
    );
    assert(
      !passesDomainFilter("https://other.com/page", "example.com", false, false),
      "different domain should fail"
    );
  });

  it("passesDomainFilter: subdomains", () => {
    assert(
      passesDomainFilter("https://blog.example.com/post", "example.com", true, false),
      "subdomain should pass when includeSubdomains=true"
    );
    assert(
      !passesDomainFilter("https://blog.example.com/post", "example.com", false, false),
      "subdomain should fail when includeSubdomains=false"
    );
  });

  it("passesDomainFilter: external links", () => {
    assert(
      passesDomainFilter("https://other.com/page", "example.com", false, true),
      "external should pass when includeExternalLinks=true"
    );
  });
});
