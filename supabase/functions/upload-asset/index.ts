// Edge Function: /upload-asset
// Upload de imagens públicas (fotos de location, logo da empresa, hero de
// destino, imagens de blog) pro bucket `assets-public`, executado com
// `service_role` (ignora a RLS do Storage) APÓS validar o chamador.
//
// Motivo: a RLS de Storage não aplica a identidade do JWT assimétrico (ES256)
// em alguns estados de signing key, derrubando o upload autenticado mesmo de
// hub_admin. Centralizar aqui é mais robusto e mais seguro pro bucket público
// (mesmo padrão de `voucher-pdf`, que escreve via service_role).
//
// POST /functions/v1/upload-asset   (multipart/form-data)
// Authorization: Bearer <JWT>
//   file: File            — a imagem
//   dir:  string          — "<company_id>" | "destinations/<slug>" | "blog/<slug>"
//   name: string          — prefixo do nome ("photo", "logo", "hero"…)
//
// Autorização:
//   - dir = <company_id> → hub_admin OU membro (profile_company) da empresa
//   - dir = destinations/* | blog/* → hub_admin
//
// Resposta: { url }  (URL pública/CDN) | { error }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildObjectPath, classifyDir, validateImage } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "assets-public";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  // Parse do multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "Envio inválido (esperado multipart/form-data)." }, 400);
  }
  const file = form.get("file");
  const dir = String(form.get("dir") ?? "");
  const name = String(form.get("name") ?? "file");

  if (!(file instanceof File)) return jsonResponse({ error: "Arquivo ausente." }, 400);

  const classified = classifyDir(dir);
  if (!classified.ok) return jsonResponse({ error: classified.error }, 400);

  const valid = validateImage({ type: file.type, size: file.size });
  if (!valid.ok) return jsonResponse({ error: valid.error }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Autorização por escopo
  const { data: profile } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
  const isHubAdmin = profile?.role === "hub_admin";

  if (classified.target.scope === "company") {
    if (!isHubAdmin) {
      const { data: membership } = await admin
        .from("profile_company")
        .select("company_id")
        .eq("profile_id", uid)
        .eq("company_id", classified.target.companyId)
        .maybeSingle();
      if (!membership) return jsonResponse({ error: "Sem acesso a esta empresa." }, 403);
    }
  } else if (!isHubAdmin) {
    return jsonResponse({ error: "Acesso restrito a administradores." }, 403);
  }

  const rand = crypto.randomUUID().slice(0, 7);
  const path = buildObjectPath(dir, name, file.name, rand);

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (upErr) return jsonResponse({ error: upErr.message }, 400);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return jsonResponse({ url: pub.publicUrl }, 201);
});
