const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const requireEnv = (name: string): string => {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

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
} as const;
