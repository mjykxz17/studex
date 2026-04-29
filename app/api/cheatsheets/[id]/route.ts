import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("cheatsheets")
    .select(
      "id, user_id, course_id, title, source_file_ids, markdown, citations, status, failure_reason, created_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ cheatsheet: data });
}
