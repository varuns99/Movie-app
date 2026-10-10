import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The publishable (anon) key is public by design; Row Level Security in the
// database is what protects data. Never put a secret/service_role key here.
export const hasSupabase = Boolean(url && anonKey);

// PKCE puts the reset-link code in the URL query (?code=...) instead of the
// hash, which would clash with the app's #tonight/#watchlist/#history routing.
export const supabase = hasSupabase
  ? createClient(url as string, anonKey as string, { auth: { flowType: "pkce" } })
  : null;
