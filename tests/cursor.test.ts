import { describe, it, assert } from "./harness.js";
import {
  fnv1a,
  createInitialCursor,
  encodeCursor,
  decodeCursor,
  isVisited,
  addVisited,
  addToFrontier,
  takeFromFrontier,
} from "../src/crawler/cursor.js";
import { resolveConfig } from "../src/crawler/types.js";

const config = resolveConfig({ url: "https://example.com" });

describe("cursor.ts", () => {
  it("fnv1a: produces consistent hashes", () => {
    const h1 = fnv1a("https://example.com/page");
    const h2 = fnv1a("https://example.com/page");
    const h3 = fnv1a("https://example.com/other");
    assert(h1 === h2, "same input should produce same hash");
    assert(h1 !== h3, "different input should produce different hash");
    assert(typeof h1 === "number", "hash should be a number");
  });

  it("encode/decode cursor round-trip", () => {
    const cursor = createInitialCursor(config, "example.com", [
      { url: "https://example.com/a", depth: 0 },
      { url: "https://example.com/b", depth: 1 },
    ]);
    addVisited(cursor, "https://example.com/visited");
    cursor.totalPagesCrawled = 5;

    const encoded = encodeCursor(cursor);
    assert(typeof encoded === "string", "encoded should be a string");

    const decoded = decodeCursor(encoded);
    assert(decoded.totalPagesCrawled === 5, "totalPagesCrawled preserved");
    assert(decoded.seedDomain === "example.com", "seedDomain preserved");
    assert(decoded.frontier.length === 2, "frontier preserved");
    assert(decoded.visitedHashes.length === 1, "visited hash preserved");
  });

  it("isVisited/addVisited: tracks visited URLs", () => {
    const cursor = createInitialCursor(config, "example.com", []);
    assert(!isVisited(cursor, "https://example.com/a"), "not visited initially");
    addVisited(cursor, "https://example.com/a");
    assert(isVisited(cursor, "https://example.com/a"), "visited after add");
    assert(!isVisited(cursor, "https://example.com/b"), "other URL not visited");
  });

  it("addVisited: deduplicates", () => {
    const cursor = createInitialCursor(config, "example.com", []);
    addVisited(cursor, "https://example.com/a");
    addVisited(cursor, "https://example.com/a");
    assert(cursor.visitedHashes.length === 1, "should not duplicate hash");
  });

  it("takeFromFrontier: BFS takes from front", () => {
    const cursor = createInitialCursor(config, "example.com", [
      { url: "https://example.com/first", depth: 0 },
      { url: "https://example.com/second", depth: 0 },
      { url: "https://example.com/third", depth: 0 },
    ]);
    const batch = takeFromFrontier(cursor, 2, "bfs");
    assert(batch.length === 2, "should take 2");
    assert(batch[0].url === "https://example.com/first", "BFS: first in first out");
    assert(cursor.frontier.length === 1, "1 remaining");
  });

  it("takeFromFrontier: DFS takes from end", () => {
    const cursor = createInitialCursor(config, "example.com", [
      { url: "https://example.com/first", depth: 0 },
      { url: "https://example.com/second", depth: 0 },
      { url: "https://example.com/third", depth: 0 },
    ]);
    const batch = takeFromFrontier(cursor, 1, "dfs");
    assert(batch.length === 1, "should take 1");
    assert(batch[0].url === "https://example.com/third", "DFS: last in first out");
  });

  it("addToFrontier: respects max size", () => {
    const cursor = createInitialCursor(config, "example.com", []);
    const entries = Array.from({ length: 250 }, (_, i) => ({
      url: `https://example.com/${i}`,
      depth: 0,
    }));
    addToFrontier(cursor, entries);
    assert(cursor.frontier.length === 200, "should cap at 200");
  });
});
