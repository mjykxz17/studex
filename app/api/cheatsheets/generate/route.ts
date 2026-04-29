// app/api/cheatsheets/generate/route.ts
import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getAnthropicClient } from "@/lib/llm/anthropic";
import { encodeSseEvent } from "@/lib/cheatsheet/sse";
import { runOrchestrator } from "@/lib/cheatsheet/orchestrate";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { StreamEvent } from "@/lib/cheatsheet/types";

type GenerateBody = {
  course_id?: string;
  source_file_ids?: string[];
  title?: string;
};

export async function POST(req: Request): Promise<Response> {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.course_id || !Array.isArray(body.source_file_ids) || body.source_file_ids.length === 0) {
    return Response.json(
      { error: "course_id and non-empty source_file_ids required" },
      { status: 400 },
    );
  }

  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  // Auto-title default: "<course code> — <weekday>, <date>"
  let title = body.title?.trim();
  if (!title) {
    const { data: course } = await supabase
      .from("courses")
      .select("code")
      .eq("id", body.course_id)
      .maybeSingle();
    const code =
      (course as { code?: string } | null)?.code ??
      (Array.isArray(course) ? (course[0] as { code?: string } | undefined)?.code : undefined) ??
      "Cheatsheet";
    const d = new Date();
    title = `${code} — ${d.toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
  }

  const { data: created, error } = await supabase
    .from("cheatsheets")
    .insert({
      user_id: user.id,
      course_id: body.course_id,
      title,
      source_file_ids: body.source_file_ids,
      status: "streaming",
    })
    .select("id")
    .single();
  if (error || !created) {
    return Response.json(
      { error: error?.message ?? "Failed to create cheatsheet row" },
      { status: 500 },
    );
  }
  const cheatsheetId = (created as { id: string }).id;

  const anthropic = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(ev)));
      };
      try {
        await runOrchestrator({
          cheatsheetId,
          userId: user.id,
          sourceFileIds: body.source_file_ids ?? [],
          anthropic,
          emit,
        });
      } catch (err) {
        emit({
          type: "failed",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-cheatsheet-id": cheatsheetId,
    },
  });
}
