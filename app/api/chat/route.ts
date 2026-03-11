import { NextResponse } from "next/server";

import { callAI } from "@/lib/ai";
import { generateEmbedding } from "@/lib/embed";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ChatRequestBody = {
  message?: string;
  userId?: string | null;
  moduleId?: string | null;
  model?: string | null;
};

type UserRow = {
  id: string;
  ai_model: string | null;
};

type MatchChunkRow = {
  id: string;
  chunk_text: string;
  source_type: "file" | "announcement" | "task" | string;
  similarity: number;
};

type ChatSource = {
  id: string;
  sourceType: string;
  similarity: number;
  excerpt: string;
};

const TOP_K = 5;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function trimExcerpt(text: string, maxLength = 280) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function toPgVector(values: number[]) {
  return `[${values.join(",")}]`;
}

async function resolveUser(bodyUserId?: string | null): Promise<UserRow> {
  const supabase = getSupabaseAdminClient();

  if (bodyUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("id, ai_model")
      .eq("id", bodyUserId)
      .maybeSingle<UserRow>();

    if (error) {
      throw new Error(`Failed to load user ${bodyUserId}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`User not found: ${bodyUserId}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, ai_model")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<UserRow>();

  if (error) {
    throw new Error(`Failed to load default Phase 1 user: ${error.message}`);
  }

  if (!data) {
    throw new Error("No user row found. Create the Phase 1 user in Supabase before using chat.");
  }

  return data;
}

function buildPrompt(question: string, chunks: MatchChunkRow[]) {
  const context = chunks
    .map((chunk, index) => `Context ${index + 1} (${chunk.source_type}, similarity ${chunk.similarity.toFixed(3)}):\n${chunk.chunk_text}`)
    .join("\n\n");

  return [
    "You are an AI assistant helping an NUS student with their coursework.",
    "Use ONLY the context below to answer.",
    "If the answer is not in the context, say so clearly.",
    "Always cite which file or announcement your answer comes from.",
    "If multiple sources support the answer, cite all relevant ones.",
    "Do not invent facts beyond the provided context.",
    "",
    "Context:",
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

    const user = await resolveUser(body.userId);
    const embedding = await generateEmbedding(message);

    const supabase = getSupabaseAdminClient();
    const { data: matches, error: matchError } = await supabase.rpc("match_chunks", {
      query_embedding: toPgVector(embedding),
      match_user_id: user.id,
      match_module_id: body.moduleId ?? null,
      match_count: TOP_K,
    });

    if (matchError) {
      throw new Error(`Vector search failed: ${matchError.message}`);
    }

    const chunks = ((matches ?? []) as MatchChunkRow[]).filter(
      (chunk) => typeof chunk.chunk_text === "string" && chunk.chunk_text.trim().length > 0,
    );

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          answer:
            "I couldn’t find any synced course content for that question yet. Run a sync first, or ask about material that has already been processed.",
          sources: [] satisfies ChatSource[],
          userId: user.id,
          moduleId: body.moduleId ?? null,
        },
        { status: 200 },
      );
    }

    const answer = await callAI(buildPrompt(message, chunks), body.model?.trim() || user.ai_model || undefined);

    const sources: ChatSource[] = chunks.map((chunk) => ({
      id: chunk.id,
      sourceType: chunk.source_type,
      similarity: chunk.similarity,
      excerpt: trimExcerpt(chunk.chunk_text),
    }));

    return NextResponse.json({
      answer,
      sources,
      userId: user.id,
      moduleId: body.moduleId ?? null,
      model: body.model?.trim() || user.ai_model || process.env.AI_MODEL || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
