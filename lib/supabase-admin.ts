import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let serviceClient: SupabaseClient | undefined;

const createSupabaseAdminClient = () =>
  createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

export const getSupabaseAdminClient = () => {
  serviceClient ??= createSupabaseAdminClient();
  return serviceClient;
};
