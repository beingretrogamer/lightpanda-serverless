import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    name: "Lightpanda Serverless",
    description: "Headless browser crawler as a Vercel function",
    endpoints: {
      fetch: {
        path: "/api/fetch",
        method: "GET",
        params: {
          url: "URL to fetch (default: https://example.com)",
          format: "Output format: html | markdown | semantic_tree | semantic_tree_text (default: markdown)",
        },
        example: "/api/fetch?url=https://example.com&format=markdown",
      },
      discover: {
        path: "/api/discover",
        method: "GET",
        params: {
          url: "Domain or URL to discover sitemaps for",
        },
        example: "/api/discover?url=https://example.com",
        description: "Discover sitemaps and count pages. No browser rendering needed.",
      },
      crawl: {
        path: "/api/crawl",
        method: "POST",
        body: {
          config: {
            url: "Starting URL (required)",
            source: "all | sitemaps | links (default: all)",
            strategy: "bfs | dfs (default: bfs)",
            maxPages: "Max pages total (default: 100)",
            maxDepth: "Max link depth (default: 10)",
            render: "Use JS rendering (default: true)",
            obeyRobots: "Respect robots.txt (default: true)",
          },
          cursor: "Continuation cursor from previous response (optional)",
        },
        description: "Crawl pages with BFS/DFS. Returns cursor for pagination.",
      },
    },
  });
}
