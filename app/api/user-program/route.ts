export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const KNOWN_PROGRAMS = ["bcomp-isc-2024", "bcomp-cs-2024"];

export async function GET() {
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("user_programs")
    .select("program_id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle<{ program_id: string }>();
  return Response.json({
    current: data?.program_id ?? null,
    available: KNOWN_PROGRAMS,
  });
}

export async function POST(request: Request) {
  const user = await ensureDemoUser();
  const body = (await request.json()) as { program_id?: string };
  if (!body.program_id || !KNOWN_PROGRAMS.includes(body.program_id)) {
    return Response.json({ error: "unknown program_id" }, { status: 400 });
  }
  const supabase = getSupabaseAdminClient();
  // Demote any existing primary, then upsert the new one.
  await supabase
    .from("user_programs")
    .update({ is_primary: false })
    .eq("user_id", user.id);
  const { error } = await supabase.from("user_programs").upsert(
    {
      user_id: user.id,
      program_id: body.program_id,
      is_primary: true,
    },
    { onConflict: "user_id,program_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
