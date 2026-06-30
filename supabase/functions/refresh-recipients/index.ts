// Edge Function: /refresh-recipients
// Rotina (pg_cron, C do E2.8) que reavalia no gateway os recebedores ainda em análise/pendência e
// reflete o status em payout_recipient — complementa o webhook (push) com um poll de segurança.
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-refresh-recipients-key.
//
// POST /functions/v1/refresh-recipients   (header: x-refresh-recipients-key: <REFRESH_RECIPIENTS_KEY>)
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Status que ainda podem mudar no gateway (vale reavaliar). 'active'/'refused' são terminais.
const REFRESHABLE = ["pending", "action_required"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("REFRESH_RECIPIENTS_KEY");
  if (!expected || req.headers.get("x-refresh-recipients-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const { data: recipients, error } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, status")
    .eq("provider", "pagarme")
    .in("status", REFRESHABLE)
    .not("external_recipient_id", "is", null)
    .is("deleted_at", null);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const rec of recipients ?? []) {
    try {
      const result = await gateway.getRecipient(rec.external_recipient_id!);
      if (!result.externalId) continue; // resposta inválida do gateway: não mexe
      await admin
        .from("payout_recipient")
        .update({
          status: result.status,
          last_provider_status: result.rawStatus,
          kyc_url: result.kycUrl,
          requirements: result.requirements,
        })
        .eq("id", rec.id);
      if (result.status !== rec.status) updated += 1;
      await admin.from("payout_recipient_event").insert({
        payout_recipient_id: rec.id,
        kind: "refresh",
        http_status: result.httpStatus,
        request: null,
        response: result.raw,
      });
    } catch (e) {
      console.error("[refresh-recipients] falha em", rec.external_recipient_id, e);
    }
  }

  return json({ ok: true, checked: recipients?.length ?? 0, updated });
});
