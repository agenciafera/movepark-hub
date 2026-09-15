// Edge Function: /refresh-recipients
// Rotina (pg_cron, C do E2.8) que reavalia no gateway os recebedores ainda em análise/pendência e
// reflete o status em payout_recipient — complementa o webhook (push) com um poll de segurança.
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-refresh-recipients-key.
//
// Na mesma volta lê o SALDO dos recebedores ativos (`GET /recipients/{id}/balance`, com recuo de 1h)
// e guarda a foto com carimbo. É a única fonte confiável: o webhook `transfer.*` nunca chegou nesta
// conta e a transferência automática do gateway não passa por nós.
//
// POST /functions/v1/refresh-recipients   (header: x-refresh-recipients-key: <REFRESH_RECIPIENTS_KEY>)
// → { ok, checked, updated, balances }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import {
  autorizado,
  decidir,
  decidirSaldo,
  precisaSondarRecebedor,
  REFRESHABLE,
  saldoVencido,
} from "./logic.ts";

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

  // ── segunda passada: o saldo real no gateway ──────────────────────────────
  // Por que aqui e não derivado dos nossos registros: `payout_withdrawal` só é alimentada pelo
  // webhook `transfer.*`, que nunca chegou nesta conta, e recebedor com transferência automática
  // (a Virapark é mensal, dia 10) manda o dinheiro para o banco sem passar por nós. Qualquer número
  // que a gente deduzisse afirmaria um saldo que ninguém leu. Quem sabe é o gateway.
  const agora = Date.now();
  const { data: ativos } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, balance_synced_at")
    .eq("provider", "pagarme")
    .eq("status", "active")
    .not("external_recipient_id", "is", null)
    .is("deleted_at", null);

  let saldos = 0;
  for (const rec of ativos ?? []) {
    if (!saldoVencido(rec.balance_synced_at, agora)) continue;
    try {
      const b = await gateway.getRecipientBalance(rec.external_recipient_id!);
      const patch = decidirSaldo(b, new Date().toISOString());
      if (!patch) {
        // Leitura ruim mantém a foto anterior, com a data antiga. Zerar aqui faria o parceiro ler
        // que o dinheiro sumiu.
        console.error("[refresh-recipients] saldo sem resposta boa:", rec.external_recipient_id, b.httpStatus);
        if (precisaSondarRecebedor(b.httpStatus)) {
          // 404 no saldo pode ser "recebedor sem movimento" ou "recebedor que a chave atual nem
          // enxerga". A segunda é grave (repasse e split iriam falhar), então vale a pergunta.
          const r = await gateway.getRecipient(rec.external_recipient_id!, { kycLink: false });
          console.error(
            `[refresh-recipients] recebedor ${rec.external_recipient_id}: saldo 404, GET /recipients devolveu ${r.httpStatus}`,
          );
          await admin.from("payout_recipient_event").insert({
            payout_recipient_id: rec.id,
            kind: "refresh",
            http_status: r.httpStatus,
            request: null,
            response: r.raw,
          });
          // O carimbo fica na ficha para o painel da Movepark acusar e para o botão de repasse
          // sumir. O `status` continua intocado: rebaixá-lo deslistaria o parceiro do site.
          await admin
            .from("payout_recipient")
            .update({ gateway_missing_at: r.httpStatus === 404 ? new Date().toISOString() : null })
            .eq("id", rec.id);
        }
        continue;
      }
      // Leitura boa é prova de que o recebedor existe: limpa o alerta se ele estava marcado.
      await admin
        .from("payout_recipient")
        .update({ ...patch, gateway_missing_at: null })
        .eq("id", rec.id);
      saldos += 1;
    } catch (e) {
      console.error("[refresh-recipients] falha ao ler saldo de", rec.external_recipient_id, e);
    }
  }

  // ── terceira passada: o saldo do MASTER (E0.3.5) ──────────────────────────
  // Estornar exige saldo no master, senão a Pagar.me recusa. O Manager compara com o colchão
  // (`pagarme_master_float_cents`) e avisa. Mesmo recuo de 1h dos recebedores.
  let master = false;
  try {
    const settings = await loadGatewaySettings(admin);
    if (settings.moveparkRecipientId) {
      const { data: atual } = await admin
        .from("gateway_account_balance")
        .select("synced_at")
        .eq("provider", "pagarme")
        .maybeSingle();
      if (saldoVencido(atual?.synced_at, agora)) {
        const b = await gateway.getRecipientBalance(settings.moveparkRecipientId);
        const patch = decidirSaldo(b, new Date().toISOString());
        if (patch) {
          await admin.from("gateway_account_balance").upsert({
            provider: "pagarme",
            recipient_id: settings.moveparkRecipientId,
            available_cents: patch.balance_available_cents,
            waiting_cents: patch.balance_waiting_cents,
            transferred_cents: patch.balance_transferred_cents,
            synced_at: patch.balance_synced_at,
          });
          master = true;
        } else {
          console.error("[refresh-recipients] saldo do master sem resposta boa:", b.httpStatus);
        }
      }
    }
  } catch (e) {
    console.error("[refresh-recipients] falha ao ler saldo do master", e);
  }

  return json({ ok: true, checked: recipients?.length ?? 0, updated, balances: saldos, master });
});
