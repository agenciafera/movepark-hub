// Edge Function: /reconcile-pending-charges
// Rede de segurança do pagamento que ficou PENDENTE para sempre.
//
// Por que existe: as duas conciliações que já havia partem de um pagamento que o nosso banco já
// tem como `paid` (reconcile-confirmations) ou de um estorno já pedido (reconcile-refunds).
// Nenhuma pergunta ao gateway o que aconteceu com um pagamento que ficou em `pending`. Quando o
// webhook `charge.paid` se perde, o cron expira a reserva e o pagamento fica pendente para sempre:
// se o cliente pagou, entrou dinheiro que ninguém no sistema sabe que entrou. Medido em 15/09/2026:
// 5 PIX de agosto presos assim, todos com a reserva já expirada.
//
// Só lê do gateway (`GET /orders/{id}`) e escreve status no nosso banco. Nunca cobra, nunca
// estorna, nunca confirma reserva: quem decide o destino da reserva continua sendo
// `confirm_or_refund_booking`, pelo caminho de sempre.
//
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-reconcile-pending-charges-key.
//
// POST /functions/v1/reconcile-pending-charges   (header: x-reconcile-pending-charges-key)
//   body opcional { "dry_run": true } → só relata o que faria, sem escrever
// → { ok, checked, paid, closed, waiting, itens }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { autorizado, BATCH_LIMIT, decidirPagamentoPendente, pendingCutoffIso } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // A chave interna vem do Vault (a mesma que o cron envia), sem env var para sincronizar.
  const { data: expected } = await admin.rpc("reconcile_pending_charges_expected_key");
  if (!autorizado(expected, req.headers.get("x-reconcile-pending-charges-key"))) {
    return json({ error: "unauthorized" }, 401);
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch {
    // corpo vazio é o caso do cron
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const agora = Date.now();
  // Mais antigo primeiro: é o que está preso há mais tempo.
  const { data: linhas, error } = await admin
    .from("payment")
    .select("id, provider_payment_id, provider_charge_id, booking_id, expires_at, amount, method")
    .eq("provider", "pagarme")
    .eq("status", "pending")
    .not("provider_payment_id", "is", null)
    .lt("created_at", pendingCutoffIso(agora))
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  const itens: Record<string, unknown>[] = [];
  let pagos = 0;
  let encerrados = 0;
  let esperando = 0;

  for (const l of linhas ?? []) {
    let acao;
    try {
      const r = await gateway.getCharge(String(l.provider_payment_id));
      acao = decidirPagamentoPendente({
        httpStatus: r.httpStatus,
        chargeStatus: r.status,
        expiresAt: l.expires_at ?? r.expiresAt,
        nowMs: agora,
      });
    } catch (e) {
      console.error("[reconcile-pending-charges] consulta falhou:", l.provider_payment_id, e);
      esperando += 1;
      itens.push({ payment_id: l.id, acao: "esperar", motivo: "erro de rede" });
      continue;
    }

    itens.push({
      payment_id: l.id,
      booking_id: l.booking_id,
      amount: l.amount,
      method: l.method,
      acao: acao.tipo,
      ...(acao.tipo === "encerrar" ? { status: acao.status, motivo: acao.motivo } : {}),
      ...(acao.tipo === "esperar" ? { motivo: acao.motivo } : {}),
    });

    if (acao.tipo === "esperar") {
      esperando += 1;
      continue;
    }
    if (dryRun) {
      if (acao.tipo === "pagar") pagos += 1;
      else encerrados += 1;
      continue;
    }

    if (acao.tipo === "pagar") {
      // Mesma RPC do webhook: escrita atômica e monotônica, nunca rebaixa pagamento terminal. Daqui
      // em diante o pagamento está `paid` e o destino da reserva volta a ser assunto de
      // `reconcile-confirmations`, que confirma se ainda dá, e estorna se não dá mais.
      const { error: upErr } = await admin.rpc("apply_payment_webhook_status", {
        p_payment_id: l.id,
        p_new_status: "paid",
        p_set_paid_at: true,
      });
      if (upErr) {
        console.error("[reconcile-pending-charges] marcar pago falhou:", l.id, upErr.message);
        continue;
      }
      // Achado grave por natureza: recebemos dinheiro que o banco dava como não recebido.
      console.error(
        `[reconcile-pending-charges] PAGAMENTO RECEBIDO E NAO REGISTRADO: payment=${l.id} booking=${l.booking_id} valor=${l.amount}`,
      );
      pagos += 1;
      continue;
    }

    // `.eq("status", "pending")`: se o webhook chegou entre a leitura e a escrita, ele decide.
    const { error: upErr } = await admin
      .from("payment")
      .update({ status: acao.status })
      .eq("id", l.id)
      .eq("status", "pending");
    if (upErr) {
      console.error("[reconcile-pending-charges] encerrar falhou:", l.id, upErr.message);
      continue;
    }
    encerrados += 1;
  }

  return json({
    ok: true,
    dry_run: dryRun,
    checked: linhas?.length ?? 0,
    paid: pagos,
    closed: encerrados,
    waiting: esperando,
    itens,
  });
});
