// Edge Function: /update-recipient-payout
// Atualiza a config de repasse de UMA empresa (E0.3.3): cadência de transferência e/ou antecipação
// automática. Grava as colunas em payout_recipient (nossa fonte da verdade) e, se o recebedor já
// existe no gateway, aplica via PATCH transfer-settings / automatic-anticipation-settings (ADR-004).
// Restrito a hub_admin. Loga a interação em payout_recipient_event (kind 'update').
//
// POST /functions/v1/update-recipient-payout
// Authorization: Bearer <JWT hub_admin>
// { "company_id": "uuid", "transfer"?: {enabled,interval,day}, "anticipation"?: {enabled,type,volume_percentage,delay,days} }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { gatewayErrorMessage } from "../sync-recipient/logic.ts";
import { parseUpdatePayoutInput, toRecipientColumns } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
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
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

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

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Só hub_admin configura repasse.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== "hub_admin") {
    return jsonResponse({ error: "Acesso restrito a administradores." }, 403);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseUpdatePayoutInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  // Recebedor da empresa (vivo).
  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("id, provider, external_recipient_id")
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient) {
    return jsonResponse({ error: "Empresa não tem recebedor. Crie o recebedor antes." }, 404);
  }

  // 1) Grava a intenção nas colunas (nossa fonte da verdade; herança por NULL segue valendo).
  const { error: upErr } = await admin
    .from("payout_recipient")
    .update(toRecipientColumns(input))
    .eq("id", recipient.id);
  if (upErr) return jsonResponse({ error: upErr.message }, 500);

  // 2) Aplica no gateway se o recebedor já existe lá. Erro do gateway vira `warning` (não derruba o
  //    save) — útil no caso da antecipação, que exige liberação prévia na Pagar.me.
  let warning: string | null = null;
  if (recipient.external_recipient_id) {
    let gateway;
    try {
      gateway = getGateway(recipient.provider ?? "pagarme");
    } catch (e) {
      if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
      throw e;
    }
    const rid = recipient.external_recipient_id;
    if (input.transfer) {
      const r = await gateway.updateTransferSettings(rid, input.transfer);
      if ((r.httpStatus ?? 0) >= 400) {
        warning = gatewayErrorMessage(r.raw) ?? "O gateway recusou a cadência de transferência.";
      }
      await admin.from("payout_recipient_event").insert({
        payout_recipient_id: recipient.id,
        kind: "update",
        http_status: r.httpStatus,
        request: { transfer: input.transfer },
        response: r.raw,
      });
    }
    if (input.anticipation) {
      const r = await gateway.updateAnticipationSettings(rid, input.anticipation);
      if ((r.httpStatus ?? 0) >= 400) {
        warning = gatewayErrorMessage(r.raw)
          ?? "O gateway recusou a antecipação (pode exigir liberação na Pagar.me).";
      }
      await admin.from("payout_recipient_event").insert({
        payout_recipient_id: recipient.id,
        kind: "update",
        http_status: r.httpStatus,
        request: { anticipation: input.anticipation },
        response: r.raw,
      });
    }
  }

  return jsonResponse({ ok: true, warning });
});
