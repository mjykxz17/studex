import { NextResponse } from "next/server";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ModuleRow = {
  id: string;
  code: string | null;
  title: string | null;
  sync_enabled: boolean | null;
};

export async function GET() {
  try {
    const user = await ensureDemoUser();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("modules")
      .select("id, code, title, sync_enabled")
      .eq("user_id", user.id)
      .order("code", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const modules = ((data ?? []) as ModuleRow[]).map((module) => ({
      id: module.id,
      code: module.code ?? "MOD",
      title: module.title ?? "Untitled module",
      sync_enabled: module.sync_enabled ?? true,
    }));

    return NextResponse.json({ modules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load modules.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
