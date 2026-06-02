import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = !!url && !!anonKey;

const isServer = import.meta.env.SSR ?? false;

export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder",
  {
    auth: {
      persistSession: hasSupabaseEnv && !isServer,
      autoRefreshToken: hasSupabaseEnv && !isServer,
      detectSessionInUrl: hasSupabaseEnv && !isServer,
    },
  },
);
