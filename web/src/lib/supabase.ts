import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabaseConfig";

const config = supabaseConfig(import.meta.env);

/**
 * The Supabase client, or `null` without `web/.env.local` (see `scripts/setup-auth.sh`). Its session lives in
 * `localStorage` under its own `sb-…` key, apart from the app's data.
 */
export const supabase: SupabaseClient | null = config ? createClient(config.url, config.anonKey) : null;
