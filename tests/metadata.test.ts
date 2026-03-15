import { describe, it, assert } from "./harness.js";
import { extractMetadata } from "../src/crawler/metadata.js";

describe("metadata.ts", () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Page Title</title>
  <meta name="description" content="A test page for metadata extraction">
  <meta name="author" content="Test Author">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="OG Title">
  <meta property="og:description" content="OG Description">
  <meta property="og:image" content="https://example.com/image.png">
  <meta property="og:url" content="https://example.com/page">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Test Site">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Twitter Title">
  <meta name="twitter:description" content="Twitter Desc">
  <meta name="twitter:image" content="https://example.com/tw.png">
  <meta name="twitter:site" content="@testsite">
  <link rel="canonical" href="https://example.com/canonical">
  <script type="application/ld+json">
    {"@type": "Article", "name": "Test"}
  </script>
</head>
<body><h1>Hello</h1></body>
</html>`;

  it("extracts title", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.title === "Test Page Title", `title: ${m.title}`);
  });

  it("extracts meta description", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(
      m.meta_description === "A test page for metadata extraction",
      `desc: ${m.meta_description}`
    );
  });

  it("extracts canonical URL", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(
      m.canonical_url === "https://example.com/canonical",
      `canonical: ${m.canonical_url}`
    );
  });

  it("extracts language", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.language === "en", `lang: ${m.language}`);
  });

  it("extracts author", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.author === "Test Author", `author: ${m.author}`);
  });

  it("extracts Open Graph metadata", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.og !== null, "og should not be null");
    assert(m.og!.title === "OG Title", `og.title: ${m.og!.title}`);
    assert(m.og!.description === "OG Description", `og.desc`);
    assert(
      m.og!.image === "https://example.com/image.png",
      `og.image: ${m.og!.image}`
    );
    assert(m.og!.type === "article", `og.type: ${m.og!.type}`);
  });

  it("extracts Twitter Card metadata", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.twitter !== null, "twitter should not be null");
    assert(m.twitter!.card === "summary_large_image", "twitter.card");
    assert(m.twitter!.title === "Twitter Title", "twitter.title");
    assert(m.twitter!.site === "@testsite", "twitter.site");
  });

  it("extracts JSON-LD", () => {
    const m = extractMetadata(sampleHtml, "https://example.com");
    assert(m.jsonLd !== null, "jsonLd should not be null");
    assert(m.jsonLd!.length === 1, "should have 1 JSON-LD object");
    assert(
      (m.jsonLd![0] as any)["@type"] === "Article",
      "JSON-LD type"
    );
  });

  it("handles HTML with no metadata gracefully", () => {
    const m = extractMetadata("<html><body>Hello</body></html>", "https://x.com");
    assert(m.title === null, "no title");
    assert(m.og === null, "no og");
    assert(m.twitter === null, "no twitter");
    assert(m.jsonLd === null, "no jsonLd");
  });

  it("handles HTML entities in title", () => {
    const html = `<head><title>Tom &amp; Jerry&#39;s &quot;Show&quot;</title></head>`;
    const m = extractMetadata(html, "https://x.com");
    assert(m.title === `Tom & Jerry's "Show"`, `title: ${m.title}`);
  });
});
