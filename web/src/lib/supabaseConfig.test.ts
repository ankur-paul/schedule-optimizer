import { describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabaseConfig";

const URL = "https://abcd.supabase.co";
const KEY = "anon-key";

describe("supabaseConfig", () => {
  it("returns both values when both are set", () => {
    expect(supabaseConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toEqual({ url: URL, anonKey: KEY });
  });

  it("is null when either var is missing", () => {
    expect(supabaseConfig({})).toBeNull();
    expect(supabaseConfig({ VITE_SUPABASE_URL: URL })).toBeNull();
    expect(supabaseConfig({ VITE_SUPABASE_ANON_KEY: KEY })).toBeNull();
  });

  it("is null when either var is empty or only spaces", () => {
    expect(supabaseConfig({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: KEY })).toBeNull();
    expect(supabaseConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: "  " })).toBeNull();
  });

  it("trims stray spaces from pasted values", () => {
    expect(supabaseConfig({ VITE_SUPABASE_URL: ` ${URL}\n`, VITE_SUPABASE_ANON_KEY: ` ${KEY} ` })).toEqual({ url: URL, anonKey: KEY });
  });
});
