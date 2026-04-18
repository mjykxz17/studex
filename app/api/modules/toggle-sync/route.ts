import { NextResponse } from "next/server";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ToggleSyncBody = {
  moduleId?: string;
  sync_enabled?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ToggleSyncBody;

    if (!body.moduleId || typeof body.sync_enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const user = await ensureDemoUser();
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("modules")
      .update({ sync_enabled: body.sync_enabled })
      .eq("id", body.moduleId)
      .eq("user_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update sync setting.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
