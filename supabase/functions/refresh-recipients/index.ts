// Edge Function: /refresh-recipients
// Rotina (pg_cron, C do E2.8) que reavalia no gateway os recebedores ainda em análise/pendência e
// reflete o status em payout_recipient — complementa o webhook (push) com um poll de segurança.
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-refresh-recipients-key.
//
// POST /functions/v1/refresh-recipients   (header: x-refresh-recipients-key: <REFRESH_RECIPIENTS_KEY>)
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { autorizado, decidir, REFRESHABLE } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (
    !autorizado(
      Deno.env.get("REFRESH_RECIPIENTS_KEY"),
      req.headers.get("x-refresh-recipients-key"),
    )
  ) {
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
    .in("status", [...REFRESHABLE])
    .not("external_recipient_id", "is", null)
    .is("deleted_at", null);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const rec of recipients ?? []) {
    try {
      // `kycLink: false` de propósito: emitir link no gateway INVALIDA o anterior e reinicia a
      // validade de 20 minutos. Se o cron emitisse a cada volta, o contador do parceiro voltaria
      // ao topo sozinho e o link que ele abriu no celular morreria no meio da prova de vida.
      // Quem emite é o `create` e o botão de reemitir, ambos ação explícita do parceiro.
      const result = await gateway.getRecipient(rec.external_recipient_id!, { kycLink: false });
      // A decisão (atualizar ou só registrar, e com qual patch) mora em logic.ts, sob
      // teste. Aqui fica só a execução.
      const d = decidir({ id: rec.id, status: rec.status }, result);

      if (d.tipo === "so_evento") {
        console.error(
          "[refresh-recipients] getRecipient sem id",
          rec.external_recipient_id,
          d.httpStatus,
        );
      } else {
        await admin.from("payout_recipient").update(d.patch).eq("id", d.recipientId);
        if (d.mudouStatus) updated += 1;
      }

      await admin.from("payout_recipient_event").insert({
        payout_recipient_id: d.recipientId,
        kind: "refresh",
        http_status: d.httpStatus,
        request: null,
        response: d.response,
      });
    } catch (e) {
      console.error("[refresh-recipients] falha em", rec.external_recipient_id, e);
    }
  }

  return json({ ok: true, checked: recipients?.length ?? 0, updated });
});
