// Edge Function: /marketing-unsubscribe
//
// Descadastro de marketing pelo token do e-mail. Público de propósito (`verify_jwt=false`):
// quem clica em "descadastrar" está no cliente de e-mail, sem sessão, e exigir login para sair de
// uma lista é a definição de dark pattern.
//
// POST /functions/v1/marketing-unsubscribe   { "token": uuid, "channel"?: "email" | "whatsapp" }
// → { ok: true }
//
// O token é o `marketing_contact.unsubscribe_token` (uuid aleatório, unique). Não aceita e-mail
// cru: com e-mail, qualquer um descadastraria qualquer pessoa só sabendo o endereço.
//
// Responde `{ ok: true }` mesmo para token desconhecido. Dizer "esse token não existe" transforma
// o endpoint em oráculo para descobrir quais tokens são válidos, e não há nada de útil a fazer
// com a diferença do lado de quem clicou.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { channelsFor, isValidToken, normalizeChannel, patchFor } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token = "";
  let channel: ReturnType<typeof normalizeChannel> = "all";
  try {
    const body = await req.json();
    token = String(body?.token ?? "").trim();
    channel = normalizeChannel(body?.channel);
  } catch {
    return json({ error: "payload inválido" }, 400);
  }

  // Formato errado nem chega ao banco.
  if (!isValidToken(token)) return json({ ok: true });

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: contato } = await admin
    .from("marketing_contact")
    .select("id, contact_key")
    .eq("unsubscribe_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contato) return json({ ok: true });

  await admin
    .from("marketing_contact")
    .update(patchFor(channel, new Date().toISOString()))
    .eq("id", contato.id);

  // A supressão é a trava que sobrevive a uma ressincronização de contatos: o `marketing_sync_contacts`
  // recria o contato a partir das reservas, e sem esta linha uma reserva nova traria a pessoa de volta.
  await admin.from("marketing_suppression").upsert(
    channelsFor(channel).map((c) => ({
      contact_key: contato.contact_key,
      channel: c,
      reason: "descadastro pelo link do e-mail",
    })),
    { onConflict: "contact_key,channel" },
  );

  return json({ ok: true });
});
