import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  if (!client) {
    client = createClient(url, publishableKey);
  }

  return client;
}
