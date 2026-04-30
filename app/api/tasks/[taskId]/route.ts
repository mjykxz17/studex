export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, description_html")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; title: string | null; due_at: string | null; description_html: string | null }>();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Task not found" }, { status: 404 });

  return Response.json({
    id: data.id,
    title: data.title ?? "Untitled task",
    dueAt: data.due_at,
    descriptionHtml: sanitizeHtml(data.description_html),
  });
}
