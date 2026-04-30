export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ pageId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { pageId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("canvas_pages")
    .select("id, title, body_html")
    .eq("id", pageId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; title: string | null; body_html: string | null }>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Page not found" }, { status: 404 });
  }

  return Response.json({
    id: data.id,
    title: data.title ?? "Untitled page",
    bodyHtml: sanitizeHtml(data.body_html),
  });
}
