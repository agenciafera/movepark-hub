/**
 * Clients Supabase da suíte E2E.
 *
 * - `admin`: service_role. Usado para asserts de banco (ignora RLS), para a
 *   limpeza da fixture e para gerar o magic link do bypass de auth.
 * - `anon`: mesma chave pública do app. Usado para trocar o token do magic
 *   link por uma sessão de verdade.
 *
 * Nenhum dos dois persiste sessão: quem persiste é o navegador do Playwright.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";
import { env } from "./env";

const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export const admin = createClient<Database>(env.supabaseUrl, env.serviceRoleKey, noPersist);

export const anon = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, noPersist);
