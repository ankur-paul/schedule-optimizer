import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const config = supabaseConfig(import.meta.env);

/**
 * The Supabase client, or `null` without `web/.env.local` (see `scripts/setup-auth.sh`). Its session lives in
 * `localStorage` under its own `sb-…` key, apart from the app's data.
 */
export const supabase: SupabaseClient | null = config ? createClient(config.url, config.anonKey) : null;
