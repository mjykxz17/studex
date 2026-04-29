import { requireEnv } from "@/lib/config";

export const env = {
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requireEnv("SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return requireEnv("SUPABASE_SERVICE_KEY");
  },
  get anthropicApiKey() {
    return requireEnv("ANTHROPIC_API_KEY");
  },
  get tavilyApiKey() {
    return requireEnv("TAVILY_API_KEY");
  },
} as const;
