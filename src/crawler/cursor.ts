import { deflateSync, inflateSync } from "node:zlib";
import type {
  CrawlCursor,
  CrawlStrategy,
  FrontierEntry,
  ResolvedCrawlConfig,
  RobotsRules,
} from "./types.js";

const COMPRESSED_PREFIX = "z:";
const MAX_FRONTIER_SIZE = 200;

/**
 * FNV-1a 32-bit hash. Fast, good distribution, tiny implementation.
 */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Create an initial cursor from config and seed URLs.
 */
export function createInitialCursor(
  config: ResolvedCrawlConfig,
  seedDomain: string,
  initialUrls: FrontierEntry[]
): CrawlCursor {
  return {
    visitedHashes: [],
    frontier: initialUrls.slice(0, MAX_FRONTIER_SIZE),
    config,
    robotsCache: {},
    totalPagesCrawled: 0,
    lastFetchTime: null,
    seedDomain,
  };
}

/**
 * Encode cursor state to a string for transport.
 * Compresses with zlib if the JSON exceeds 100KB.
 */
export function encodeCursor(state: CrawlCursor): string {
  const json = JSON.stringify(state);

  if (json.length > 100_000) {
    const compressed = deflateSync(Buffer.from(json));
    return COMPRESSED_PREFIX + compressed.toString("base64");
  }

  return Buffer.from(json).toString("base64");
}

/**
 * Decode a cursor string back to state.
 */
export function decodeCursor(encoded: string): CrawlCursor {
  if (encoded.startsWith(COMPRESSED_PREFIX)) {
    const compressed = Buffer.from(
      encoded.slice(COMPRESSED_PREFIX.length),
      "base64"
    );
    const json = inflateSync(compressed).toString("utf-8");
    return JSON.parse(json) as CrawlCursor;
  }

  const json = Buffer.from(encoded, "base64").toString("utf-8");
  return JSON.parse(json) as CrawlCursor;
}

/**
 * Check if a URL has been visited (by hash).
 */
export function isVisited(cursor: CrawlCursor, url: string): boolean {
  const hash = fnv1a(url);
  return cursor.visitedHashes.includes(hash);
}

/**
 * Mark a URL as visited.
 */
export function addVisited(cursor: CrawlCursor, url: string): void {
  const hash = fnv1a(url);
  if (!cursor.visitedHashes.includes(hash)) {
    cursor.visitedHashes.push(hash);
  }
}

/**
 * Add URLs to the frontier, respecting max size.
 * BFS: append to end (FIFO). DFS: append to end (LIFO — takeFromFrontier pops from end).
 */
export function addToFrontier(
  cursor: CrawlCursor,
  entries: FrontierEntry[]
): void {
  const remaining = MAX_FRONTIER_SIZE - cursor.frontier.length;
  if (remaining <= 0) return;
  cursor.frontier.push(...entries.slice(0, remaining));
}

/**
 * Take URLs from the frontier.
 * BFS: shift from front. DFS: pop from end.
 */
export function takeFromFrontier(
  cursor: CrawlCursor,
  count: number,
  strategy: CrawlStrategy
): FrontierEntry[] {
  const batch: FrontierEntry[] = [];
  const take = Math.min(count, cursor.frontier.length);

  for (let i = 0; i < take; i++) {
    const entry = strategy === "bfs"
      ? cursor.frontier.shift()
      : cursor.frontier.pop();
    if (entry) batch.push(entry);
  }

  return batch;
}
