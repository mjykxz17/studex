import { NextResponse } from "next/server";

import { callAIText } from "@/lib/ai";
import { type ChatSource } from "@/lib/contracts";
import { ensureDemoUser } from "@/lib/demo-user";
import { generateEmbedding } from "@/lib/embed";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ChatRequestBody = {
  message?: string;
  moduleId?: string | null;
  model?: string | null;
};

type MatchChunkRow = {
  id: string;
  source_id?: string | null;
  chunk_text: string;
  source_type: string;
  source_label?: string | null;
  module_code?: string | null;
  similarity: number;
};

type GroupedSource = {
  sourceId: string;
  sourceType: string;
  label: string;
  moduleCode: string;
  similarity: number;
  texts: string[];
};

const TOP_K = 8;
const MIN_SIMILARITY = 0.2;
const MAX_SOURCES = 5;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function toPgVector(values: number[]) {
  return `[${values.join(",")}]`;
}

function trimExcerpt(text: string, maxLength = 280) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function groupSources(matches: MatchChunkRow[]): GroupedSource[] {
  const grouped = new Map<string, GroupedSource>();

  for (const match of matches) {
    if (match.similarity < MIN_SIMILARITY || !match.chunk_text.trim()) {
      continue;
    }

    const key = match.source_id || match.id;
    const existing = grouped.get(key);

    if (existing) {
      if (existing.texts.length < 2) {
        existing.texts.push(match.chunk_text);
      }
      existing.similarity = Math.max(existing.similarity, match.similarity);
      continue;
    }

    if (grouped.size >= MAX_SOURCES) {
      break;
    }

    grouped.set(key, {
      sourceId: key,
      sourceType: match.source_type,
      label: match.source_label?.trim() || `${match.module_code ?? "General"} · ${match.source_type}`,
      moduleCode: match.module_code?.trim() || "General",
      similarity: match.similarity,
      texts: [match.chunk_text],
    });
  }

  return Array.from(grouped.values());
}

function buildPrompt(question: string, sources: GroupedSource[]) {
  const context = sources
    .map(
      (source, index) =>
        `Source ${index + 1}: ${source.label}\nModule: ${source.moduleCode}\nType: ${source.sourceType}\nContext:\n${source.texts.join("\n\n")}`,
    )
    .join("\n\n");

  return [
    "You are Studex, an AI assistant helping an NUS student with synced course material.",
    "Answer ONLY from the provided sources.",
    "If the answer is not supported by the sources, say that you could not find it in synced material.",
    "When you make a claim, cite the exact source labels in parentheses.",
    "Do not invent deadlines, policies, or file details.",
    "",
    "Sources:",
    context,
    "",
    `Student question: ${question}`,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const message = body.message?.trim();

    if (!message) {
      return badRequest("message is required.");
    }

    const user = await ensureDemoUser();
    const embedding = await generateEmbedding(message);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: toPgVector(embedding),
      match_user_id: user.id,
      match_module_id: body.moduleId ?? null,
      match_count: TOP_K,
    });

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }

    const groupedSources = groupSources((data ?? []) as MatchChunkRow[]);

    if (groupedSources.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn’t find relevant synced material for that question yet. Try syncing the module again or ask about content already stored in Canvas.",
        sources: [] satisfies ChatSource[],
        moduleId: body.moduleId ?? null,
        model: body.model?.trim() || user.ai_model || process.env.AI_MODEL || null,
      });
    }

    const answer = await callAIText(buildPrompt(message, groupedSources), body.model?.trim() || user.ai_model || undefined);
    const sources: ChatSource[] = groupedSources.map((source) => ({
      id: source.sourceId,
      label: source.label,
      moduleCode: source.moduleCode,
      sourceType: source.sourceType,
      similarity: source.similarity,
      excerpt: trimExcerpt(source.texts.join(" ")),
    }));

    return NextResponse.json({
      answer,
      sources,
      moduleId: body.moduleId ?? null,
      model: body.model?.trim() || user.ai_model || process.env.AI_MODEL || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
