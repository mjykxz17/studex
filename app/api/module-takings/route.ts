export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const VALID_STATUSES = new Set(["completed", "in_progress", "planning", "dropped"]);

export async function GET() {
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("module_takings")
    .select("id, module_code, status, semester, grade, bucket_override")
    .eq("user_id", user.id)
    .order("module_code", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ takings: data ?? [] });
}

export async function POST(request: Request) {
  const user = await ensureDemoUser();
  const body = (await request.json()) as {
    module_code?: string;
    status?: string;
    semester?: string | null;
    grade?: string | null;
    bucket_override?: string | null;
  };
  if (!body.module_code || typeof body.module_code !== "string") {
    return Response.json({ error: "module_code required" }, { status: 400 });
  }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }
  const payload = {
    user_id: user.id,
    module_code: body.module_code,
    status: body.status,
    semester: body.semester ?? null,
    grade: body.grade ?? null,
    bucket_override: body.bucket_override ?? null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("module_takings").upsert(payload, {
    onConflict: "user_id,module_code",
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await ensureDemoUser();
  const body = (await request.json()) as { module_code?: string };
  if (!body.module_code) return Response.json({ error: "module_code required" }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("module_takings")
    .delete()
    .eq("user_id", user.id)
    .eq("module_code", body.module_code);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
