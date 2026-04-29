export type ConfigRequirement = {
  key: string;
  required: boolean;
  present: boolean;
  description: string;
};

const CONFIG_KEYS = [
  { key: "SUPABASE_URL", required: true, description: "Supabase project URL" },
  { key: "SUPABASE_ANON_KEY", required: true, description: "Supabase browser key" },
  { key: "SUPABASE_SERVICE_KEY", required: true, description: "Supabase service role key" },
  { key: "CANVAS_TOKEN", required: true, description: "Canvas API token" },
  { key: "CANVAS_BASE_URL", required: false, description: "Canvas base URL" },
  { key: "ANTHROPIC_API_KEY", required: false, description: "Anthropic API key (BYOK; powers cheatsheet generation)" },
  { key: "TAVILY_API_KEY", required: false, description: "Tavily search API key (powers cheatsheet gap-fill)" },
] as const;

export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function hasSupabaseConfig() {
  return Boolean(readEnv("SUPABASE_URL") && readEnv("SUPABASE_ANON_KEY") && readEnv("SUPABASE_SERVICE_KEY"));
}

export function getConfigRequirements(): ConfigRequirement[] {
  return CONFIG_KEYS.map((entry) => ({
    ...entry,
    present: Boolean(readEnv(entry.key)),
  }));
}

export function getServerHealth() {
  const requirements = getConfigRequirements();
  const missingRequired = requirements.filter((entry) => entry.required && !entry.present).map((entry) => entry.key);

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    requirements,
  };
}
