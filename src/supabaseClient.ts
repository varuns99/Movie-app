import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The publishable (anon) key is public by design; Row Level Security in the
// database is what protects data. Never put a secret/service_role key here.
export const hasSupabase = Boolean(url && anonKey);

export const supabase = hasSupabase ? createClient(url as string, anonKey as string) : null;
