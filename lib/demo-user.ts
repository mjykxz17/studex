import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PHASE1_USER_EMAIL = "phase1-local@studex.local";
const DEFAULT_AI_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";

export type DemoUserRow = {
  id: string;
  email: string | null;
  ai_model: string | null;
  last_synced_at: string | null;
};

export async function ensureDemoUser(): Promise<DemoUserRow> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("id, email, ai_model, last_synced_at")
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
      ai_provider: "anthropic",
      ai_model: DEFAULT_AI_MODEL,
    })
    .select("id, email, ai_model, last_synced_at")
    .single<DemoUserRow>();

  if (insertError || !created) {
    throw new Error(`Failed to create demo user: ${insertError?.message ?? "Unknown error"}`);
  }

  return created;
}
