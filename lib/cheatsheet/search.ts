// lib/cheatsheet/search.ts
import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { tavilySearch } from "@/lib/search/tavily";
import type { GapConcept, SearchResult } from "@/lib/cheatsheet/types";

const DAILY_CAP = 50;

export type SearchFn = (query: string) => Promise<
  Array<{ url: string; title: string; snippet: string }>
>;

export type IncrementUsageFn = (
  userId: string,
  amount: number,
) => Promise<{ allowed: boolean; remaining: number }>;

export type SearchGapsParams = {
  gaps: GapConcept[];
  userId: string;
  search?: SearchFn;
  incrementUsage?: IncrementUsageFn;
};

export type SearchGapsResult = {
  results: SearchResult[];
  degraded: boolean;
  reason?: string;
};

export async function defaultIncrementUsage(
  userId: string,
  amount: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("web_search_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();
  const current = (existing?.count as number | undefined) ?? 0;
  if (current + amount > DAILY_CAP) {
    return { allowed: false, remaining: Math.max(DAILY_CAP - current, 0) };
  }
  await supabase
    .from("web_search_usage")
    .upsert(
      { user_id: userId, date: today, count: current + amount },
      { onConflict: "user_id,date" },
    );
  return { allowed: true, remaining: DAILY_CAP - (current + amount) };
}

export async function searchGaps(params: SearchGapsParams): Promise<SearchGapsResult> {
  const search: SearchFn = params.search ?? ((q) => tavilySearch(q, { maxResults: 3 }));
  const incrementUsage: IncrementUsageFn = params.incrementUsage ?? defaultIncrementUsage;

  if (params.gaps.length === 0) {
    return { results: [], degraded: false };
  }

  const usage = await incrementUsage(params.userId, params.gaps.length);
  if (!usage.allowed) {
    return {
      results: [],
      degraded: true,
      reason: "Daily search quota reached",
    };
  }

  const settled = await Promise.allSettled(params.gaps.map((g) => search(g.concept)));
  const results: SearchResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      return { gap: params.gaps[i], snippets: s.value, failed: false };
    }
    return { gap: params.gaps[i], snippets: [], failed: true };
  });

  return { results, degraded: false };
}
