// app/api/cheatsheets/route.ts
import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("course_id");
  if (!courseId) {
    return Response.json({ error: "course_id is required" }, { status: 400 });
  }
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("cheatsheets")
    .select("id, title, status, course_id, created_at, completed_at")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ cheatsheets: data ?? [] });
}
