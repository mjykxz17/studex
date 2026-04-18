export const dynamic = "force-dynamic";

import { downloadCanvasFile } from "@/lib/canvas";
import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

function buildInlineDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, "").replace(/["\\]/g, "").trim() || "canvas-file";
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function buildPreviewHeaders(source: Response, filename: string) {
  const headers = new Headers();

  for (const headerName of ["content-type", "content-length", "etag", "last-modified", "accept-ranges"]) {
    const value = source.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Content-Disposition", buildInlineDisposition(filename));
  return headers;
}

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

  if (error) {
    return Response.json({ error: `Failed to load file metadata: ${error.message}` }, { status: 500 });
  }

  if (!data?.canvas_file_id) {
    return Response.json({ error: "File not found." }, { status: 404 });
  }

  const download = await downloadCanvasFile(data.canvas_file_id);

  if (!download) {
    return Response.json({ error: "Canvas file is unavailable for preview." }, { status: 404 });
  }

  const headers = buildPreviewHeaders(download.response, data.filename ?? "canvas-file");

  if (download.response.body) {
    return new Response(download.response.body, {
      status: 200,
      headers,
    });
  }

  return new Response(await download.response.arrayBuffer(), {
    status: 200,
    headers,
  });
}
