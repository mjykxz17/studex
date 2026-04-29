// lib/search/tavily.ts
import "server-only";

import { env } from "@/lib/env";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export type TavilySnippet = {
  url: string;
  title: string;
  snippet: string;
};

type TavilyResponse = {
  results?: Array<{ url: string; title: string; content: string }>;
};

export async function tavilySearch(
  query: string,
  options: { maxResults?: number } = {},
): Promise<TavilySnippet[]> {
  const apiKey = env.tavilyApiKey;
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options.maxResults ?? 3,
      search_depth: "basic",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as TavilyResponse;
  return (data.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.content,
  }));
}
