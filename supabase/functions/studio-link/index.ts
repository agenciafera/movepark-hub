// Edge Function: /studio-link
// Devolve o link autenticado do Mastra Studio para o Manager abrir em nova aba.
//
// GET /functions/v1/studio-link
// Authorization: Bearer <JWT hub_admin>
// -> 200 { url }
//
// ## Por que isto é uma função, e não uma variável VITE_
//
// O Studio autentica pelo parâmetro `auth_header`, e o valor dele é o
// `MASTRA_ADMIN_TOKEN`: acesso total à API dos dois agentes, incluindo ler qualquer
// conversa e disparar execução. Variável `VITE_*` é assada no bundle em build e servida
// a quem baixar o JS, mesmo sem login. O token viraria público.
//
// Aqui ele só sai depois de conferir o papel do chamador no banco, e vive como secret do
// projeto. O front nunca o vê antes do clique, e nunca o guarda.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// @ts-expect-error - Deno global
const env = (k: string) => Deno.env.get(k) ?? "";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Faltou o token de sessão." }, 401);

  const SUPABASE_URL = env("SUPABASE_URL");
  const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const { data: usuario, error: erroAuth } = await admin.auth.getUser(jwt);
  if (erroAuth || !usuario?.user) return json({ error: "Sessão inválida." }, 401);

  const { data: perfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", usuario.user.id)
    .maybeSingle();

  // Só o super admin. O Studio não tem noção de empresa: quem entra lê conversa de todos.
  if (perfil?.role !== "hub_admin") return json({ error: "Acesso restrito." }, 403);

  const base = env("MASTRA_STUDIO_URL").replace(/\/+$/, "");
  const token = env("MASTRA_ADMIN_TOKEN");
  if (!base || !token) {
    return json(
      { error: "Studio não configurado: faltam MASTRA_STUDIO_URL ou MASTRA_ADMIN_TOKEN." },
      503,
    );
  }

  // O Studio lê este parâmetro uma vez e guarda no localStorage dele. O `Bearer ` faz
  // parte do valor, porque ele usa a string inteira como header Authorization.
  const url = `${base}/?auth_header=${encodeURIComponent(`Bearer ${token}`)}`;
  return json({ url });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
