// Apart from supabase.ts so the public timetable page can read the env without bundling the Supabase client.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** The project URL and anon key from the env, or `null` when either is missing or blank (the app then runs as v1). */
export function supabaseConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}
