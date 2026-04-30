export const dynamic = "force-dynamic";

import { downloadCanvasFile } from "@/lib/canvas";
import { ensureDemoUser } from "@/lib/demo-user";
import { renderDocxToHtml } from "@/lib/file-render";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("canvas_files")
    .select("id, canvas_file_id, filename")
    .eq("id", fileId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; canvas_file_id: string | null; filename: string | null }>();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data?.canvas_file_id) return Response.json({ error: "Not found" }, { status: 404 });

  const download = await downloadCanvasFile(data.canvas_file_id);
  if (!download) return Response.json({ error: "Canvas unavailable" }, { status: 404 });

  const buf = Buffer.from(await download.response.arrayBuffer());
  const html = await renderDocxToHtml(buf);
  return Response.json({ filename: data.filename, html });
}
