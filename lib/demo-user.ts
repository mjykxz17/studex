import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PHASE1_USER_EMAIL = "phase1-local@studex.local";

export type DemoUserRow = {
  id: string;
  email: string | null;
  last_synced_at: string | null;
};

export async function ensureDemoUser(): Promise<DemoUserRow> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("id, email, last_synced_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<DemoUserRow>();

  if (fetchError) {
    throw new Error(`Failed to load demo user: ${fetchError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({
      email: DEFAULT_PHASE1_USER_EMAIL,
    })
    .select("id, email, last_synced_at")
    .single<DemoUserRow>();

  if (insertError || !created) {
    throw new Error(`Failed to create demo user: ${insertError?.message ?? "Unknown error"}`);
  }

  return created;
}
