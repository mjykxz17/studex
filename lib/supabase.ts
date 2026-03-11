import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let browserClient: SupabaseClient | undefined;

export const createSupabaseBrowserClient = () =>
  createClient(env.supabaseUrl, env.supabaseAnonKey);

export const getSupabaseBrowserClient = () => {
  browserClient ??= createSupabaseBrowserClient();
  return browserClient;
};
