// Edge Function: /pagarme-webhook
// Recebe os webhooks do Pagar.me (E0.1.2/.4) e reflete o status no payment + booking.
// Autenticação: Basic auth configurado no painel do Pagar.me (secret PAGARME_WEBHOOK_BASIC_AUTH,
// formato "user:pass"), comparado em tempo constante e EXIGIDO em produção (sk_live_).
// Idempotência por id do evento (tabela payment_webhook_event).
// verify_jwt = false (o Pagar.me não envia JWT do Supabase).
// No `pago`: confirma a reserva e pré-gera o voucher (service role, pós-resposta).
//
// POST /functions/v1/pagarme-webhook
// Authorization: Basic <base64(user:pass)>
// { id, type: "order.paid" | "charge.paid" | "charge.refunded" | ..., data: { ...order/charge } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeStatusToPaymentStatus, getGateway } from "../_shared/payments/index.ts";
import { mapChargeStatus, mapRecipientStatus } from "../_shared/payments/pagarme.ts";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";
import { sendBookingConfirmationEmail } from "../_shared/booking-confirmation.ts";
import { refundShouldCancelBooking } from "../_shared/refund.ts";
import { sendWhatsAppTemplate } from "../_shared/whatsapp.ts";
import {
  parseRecipientEvent,
  parseTransferEvent,
  parseWebhookEvent,
  transferStatusToWithdrawalStatus,
  verifyBasicAuth,
  webhookIntentFromType,
} from "./logic.ts";

/**
 * Notifica a confirmação por WhatsApp — só Tarifas Flex+ (`fare_benefits.notifications_sms`).
 * Best-effort: degrada sem config/template e nunca derruba o webhook.
 */
// deno-lint-ignore no-explicit-any
async function notifyBookingConfirmed(admin: any, bookingId: string): Promise<void> {
  const { data: b } = await admin
    .from("booking")
    .select("code, customer_name, customer_phone, profile_id, fare_benefits")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || !b.fare_benefits?.notifications_sms) return;

  let phone: string | null = b.customer_phone ?? null;
  let name: string | null = b.customer_name ?? null;
  if ((!phone || !name) && b.profile_id) {
    // ADR-006: nome vem do profiles; telefone (credencial) vem do auth.users — nunca do profiles.
    if (!name) {
      const { data: p } = await admin
        .from("profiles")
        .select("first_name")
        .eq("id", b.profile_id)
        .maybeSingle();
      name = p?.first_name ?? null;
    }
    if (!phone) {
      const { data: u } = await admin.auth.admin.getUserById(b.profile_id);
      const raw = u?.user?.phone ?? null;
      phone = raw ? (raw.startsWith("+") ? raw : `+${raw}`) : null;
    }
  }
  if (!phone) return;

  // @ts-expect-error - Deno env
  const template = Deno.env.get("WHATSAPP_BOOKING_CONFIRMED_TEMPLATE") ?? "";
  await sendWhatsAppTemplate({
    to: phone,
    template,
    bodyParams: [name ?? "cliente", b.code],
  });
}

/** Em produção (chave sk_live_) o webhook exige Basic auth; em staging (sk_test_) é opcional. */
function isProduction(): boolean {
  return (Deno.env.get("PAGARME_SECRET_KEY") ?? "").startsWith("sk_live_");
}

/** Agenda uma tarefa pós-resposta (não bloqueia o 2xx); cai pra await se indisponível. */
async function runAfterResponse(task: Promise<unknown>): Promise<void> {
  // @ts-ignore - EdgeRuntime existe no runtime do Supabase
  const waitUntil = typeof EdgeRuntime !== "undefined" ? EdgeRuntime?.waitUntil : undefined;
  if (typeof waitUntil === "function") waitUntil(task);
  else await task;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Marca o evento como processado com sucesso. Idempotência resiliente: numa reentrega, só o que
// COMPLETOU é pulado; um evento cujo processamento não chegou ao fim (crash/timeout) é reprocessado.
// deno-lint-ignore no-explicit-any
async function markProcessed(admin: any, eventId: string): Promise<void> {
  await admin
    .from("payment_webhook_event")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth básica: exigida em produção (fail-closed), opcional em staging.
  if (
    !verifyBasicAuth(
      req.headers.get("Authorization"),
      Deno.env.get("PAGARME_WEBHOOK_BASIC_AUTH"),
      isProduction(),
    )
  ) {
    return json({ error: "Não autorizado" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const ev = parseWebhookEvent(body);
  if (!ev.eventId) return json({ error: "Evento sem id" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotência resiliente: registra o evento. Se já existe (23505) E já foi processado com
  // sucesso (`processed_at`), ignora; se a tentativa anterior NÃO completou (crash/timeout →
  // processed_at nulo), reprocessa — todas as ações abaixo são idempotentes.
  const { error: dupErr } = await admin
    .from("payment_webhook_event")
    .insert({ id: ev.eventId, provider: "pagarme", type: ev.type });
  if (dupErr) {
    if (dupErr.code === "23505") {
      const { data: prev } = await admin
        .from("payment_webhook_event")
        .select("processed_at")
        .eq("id", ev.eventId)
        .maybeSingle();
      if (prev?.processed_at) return json({ ok: true, duplicate: true });
      // tentativa anterior não completou → segue e reprocessa
    } else {
      return json({ error: dupErr.message }, 500);
    }
  }

  // Evento de recebedor (status/KYC mudou no gateway): reflete em payout_recipient (E2.8
  // manutenção). Mantém o status "self-healing" sem depender do botão Sincronizar.
  if (ev.type.startsWith("recipient.")) {
    const rc = parseRecipientEvent(body);
    if (!rc.recipientId) return json({ ok: true, matched: false });
    const { data: rec } = await admin
      .from("payout_recipient")
      .select("id")
      .eq("provider", "pagarme")
      .eq("external_recipient_id", rc.recipientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rec) {
      console.warn("[pagarme-webhook] recipient sem recebedor casado:", rc.recipientId);
      return json({ ok: true, matched: false });
    }
    const status = mapRecipientStatus(rc.rawStatus);
    await admin
      .from("payout_recipient")
      .update({ status, last_provider_status: rc.rawStatus })
      .eq("id", rec.id);
    await runAfterResponse(
      (async () => {
        await admin.from("payout_recipient_event").insert({
          payout_recipient_id: rec.id,
          kind: "webhook",
          http_status: null,
          request: null,
          response: body as Record<string, unknown>,
        });
      })(),
    );
    return json({ ok: true, status });
  }

  // Evento de transferência (saque do recebedor → banco do parceiro): registra em
  // payout_withdrawal (E0.3.3). Idempotente por (provider, external_transfer_id).
  if (ev.type.startsWith("transfer.")) {
    const tr = parseTransferEvent(body);
    if (!tr.transferId || !tr.recipientId) return json({ ok: true, matched: false });

    const { data: rec } = await admin
      .from("payout_recipient")
      .select("company_id")
      .eq("provider", "pagarme")
      .eq("external_recipient_id", tr.recipientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rec) {
      console.warn("[pagarme-webhook] transfer sem recebedor casado:", tr.recipientId);
      return json({ ok: true, matched: false });
    }

    const wStatus = transferStatusToWithdrawalStatus(tr.rawStatus ?? ev.type.split(".")[1]);
    let feeCents = tr.feeCents;
    if (feeCents == null) {
      const { data: feeSetting } = await admin
        .from("app_setting")
        .select("value")
        .eq("key", "payout_withdrawal_fee_cents")
        .maybeSingle();
      feeCents = Number(feeSetting?.value ?? 0) || 0;
    }

    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      company_id: rec.company_id,
      provider: "pagarme",
      external_transfer_id: tr.transferId,
      external_recipient_id: tr.recipientId,
      amount_cents: tr.amountCents ?? 0,
      fee_cents: feeCents,
      status: wStatus,
      raw: body,
    };
    if (wStatus === "created") row.requested_at = nowIso;
    if (wStatus === "paid") row.paid_at = nowIso;

    const { error: wErr } = await admin
      .from("payout_withdrawal")
      .upsert(row, { onConflict: "provider,external_transfer_id" });
    if (wErr) return json({ error: wErr.message }, 500);
    return json({ ok: true, withdrawal: wStatus });
  }

  // Localiza o payment pela order; fallback pelo booking.
  let payment:
    | { id: string; booking_id: string; kind: string | null; fare_target_tier: string | null }
    | null = null;
  if (ev.orderId) {
    const { data } = await admin
      .from("payment")
      .select("id, booking_id, kind, fare_target_tier")
      .eq("provider", "pagarme")
      .eq("provider_payment_id", ev.orderId)
      .maybeSingle();
    payment = data ?? null;
  }
  if (!payment && (ev.bookingId || ev.bookingCode)) {
    let q = admin
      .from("payment")
      .select("id, booking_id, kind, fare_target_tier, booking:booking!inner(code)")
      .eq("provider", "pagarme");
    if (ev.bookingId) q = q.eq("booking_id", ev.bookingId);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const d = data as any;
    payment = d
      ? { id: d.id, booking_id: d.booking_id, kind: d.kind, fare_target_tier: d.fare_target_tier }
      : null;
  }
  if (!payment) {
    // Ack mesmo sem casar (evita reentrega infinita); fica logado.
    console.warn("[pagarme-webhook] payment não encontrado:", ev.orderId, ev.bookingId);
    return json({ ok: true, matched: false });
  }

  // Decide a ação pelo TIPO do evento (não pelo data.status — PIX manda `charge.refunded` com
  // data.status "paid", o refund fica em last_transaction). Sem intent reconhecida, cai no
  // mapeamento genérico por status.
  const intent = webhookIntentFromType(ev.type);

  // Estorno PARCIAL (defensivo — feito no painel da Pagar.me): registra o valor no payment, NÃO
  // cancela nem muda o status pago (a aplicação só emite estorno total).
  if (intent === "partial_refund") {
    const rawData = ((body as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
    const cents = Number(rawData.amount);
    const { data: pay } = await admin
      .from("payment")
      .select("refunded_at")
      .eq("id", payment.id)
      .maybeSingle();
    await admin
      .from("payment")
      .update({
        refunded_at: pay?.refunded_at ?? new Date().toISOString(),
        refunded_amount: Number.isFinite(cents) && cents > 0 ? cents / 100 : null,
      })
      .eq("id", payment.id);
    await markProcessed(admin, ev.eventId);
    return json({ ok: true, partial_refund: true });
  }

  const status =
    intent === "refund"
      ? "refunded"
      : intent === "cancel"
        ? "canceled"
        : intent === "paid"
          ? "paid"
          : mapChargeStatus(ev.rawStatus ?? ev.type.split(".")[1]);
  const paymentStatus = chargeStatusToPaymentStatus(status);

  // Preserva paid_at: um pagamento pago e depois estornado mantém a data do pagamento
  // (necessário para a reconciliação por período — E0.3.3).
  const paymentPatch: Record<string, unknown> = { status: paymentStatus };
  if (status === "paid") paymentPatch.paid_at = new Date().toISOString();
  await admin.from("payment").update(paymentPatch).eq("id", payment.id);

  // Upgrade de Tarifa pago (E2.8-d): promove a Tarifa da reserva, sem confirmar/voucher.
  if (status === "paid" && payment.kind === "fare_upgrade" && payment.fare_target_tier) {
    const { error: upErr } = await admin.rpc("apply_fare_upgrade", {
      p_booking_id: payment.booking_id,
      p_target_tier: payment.fare_target_tier,
    });
    if (upErr) console.error("[pagarme-webhook] apply_fare_upgrade falhou:", upErr.message);
    await markProcessed(admin, ev.eventId);
    return json({ ok: true, status: paymentStatus, fare_upgrade: true });
  }

  // Pagamento aprovado → confirma a reserva OU estorna se a vaga sumiu (caso 4c, ADR-005). A RPC
  // confirm_or_refund_booking concentra a decisão (reconfirma se há vaga; senão sinaliza estorno) e
  // é idempotente: se já confirmada (ex.: confirmação inline do cartão) retorna 'noop'.
  if (status === "paid") {
    const { data: cr } = await admin.rpc("confirm_or_refund_booking", {
      p_booking_id: payment.booking_id,
      p_payment_id: payment.id,
    });
    const outcome = (cr as { outcome?: string; charge_id?: string } | null)?.outcome;

    if (outcome === "needs_refund") {
      // Pago sem vaga (confirmação tardia após expirar): estorna automático — nunca captura sem
      // entregar. O evento `charge.refunded` posterior fecha o ciclo no payment.
      const chargeId = (cr as { charge_id?: string }).charge_id;
      await runAfterResponse(
        (async () => {
          try {
            if (chargeId) {
              await getGateway("pagarme").refundCharge({ chargeId });
              await admin
                .from("payment")
                .update({ refunded_at: new Date().toISOString() })
                .eq("id", payment!.id);
            }
          } catch (e) {
            console.error("[pagarme-webhook] falha ao estornar pago-sem-vaga:", payment!.booking_id, e);
          }
        })(),
      );
    } else {
      // confirmed / reconfirmed / noop (já confirmada) → gera voucher + notifica. generateAndStoreVoucher
      // é o gerador ÚNICO do voucher (idempotente por reserva), mesmo quando o cartão confirmou inline.
      const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://hub.movepark.co";
      await runAfterResponse(
        generateAndStoreVoucher(admin, payment.booking_id, siteUrl).catch((e) =>
          console.error("[pagarme-webhook] falha ao gerar voucher:", payment!.booking_id, e),
        ),
      );

      // Notificação de confirmação por WhatsApp (Tarifa Flex+) — best-effort, pós-resposta.
      await runAfterResponse(
        notifyBookingConfirmed(admin, payment.booking_id).catch((e) =>
          console.error("[pagarme-webhook] falha ao notificar confirmação:", payment!.booking_id, e),
        ),
      );

      // E-mail de confirmação para o cliente — guarda de exatamente-uma-vez no helper, best-effort.
      await runAfterResponse(
        sendBookingConfirmationEmail(admin, payment.booking_id).catch((e) =>
          console.error("[pagarme-webhook] falha ao enviar e-mail de confirmação:", payment!.booking_id, e),
        ),
      );
    }
  }

  // Estorno TOTAL confirmado pelo gateway (E0.3.2): reflete no payment e — se a reserva ainda não
  // começou (confirmada/pendente) — CANCELA + libera a vaga. Reserva em andamento/concluída
  // (checked_in/completed/no_show) só recebe o estorno no payment (não cancela o histórico).
  if (status === "refunded") {
    const { data: pay } = await admin
      .from("payment")
      .select("amount, refunded_at, refunded_amount")
      .eq("id", payment.id)
      .maybeSingle();
    await admin
      .from("payment")
      .update({
        refunded_at: pay?.refunded_at ?? new Date().toISOString(),
        refunded_amount: pay?.refunded_amount ?? pay?.amount ?? null,
      })
      .eq("id", payment.id);

    // Cancela a reserva se ainda confirmada/pendente (regra única em refundShouldCancelBooking).
    // A RPC é idempotente e libera a vaga uma vez; erro é logado, nunca 500 (evita retry infinito).
    const { data: bk } = await admin
      .from("booking")
      .select("status")
      .eq("id", payment.booking_id)
      .maybeSingle();
    if (bk && refundShouldCancelBooking(bk.status)) {
      const { error: cancelErr } = await admin.rpc("cancel_booking_with_release", {
        p_booking_id: payment.booking_id,
        p_reason: "estorno total confirmado pelo gateway",
      });
      if (cancelErr) {
        console.error("[pagarme-webhook] cancelamento pós-estorno falhou:", cancelErr.message);
      }
    }
  }

  // Cancelamento confirmado pelo gateway (expiração do PIX, cancelamento no painel): cancela o
  // booking + libera capacidade. RPC idempotente (noop se já cancelado). Erro é logado e a
  // reconciliação (cron) cobre o straggler — não devolvemos 500 (a RPC recusa reserva terminal
  // por design, o que causaria retry infinito).
  if (status === "canceled") {
    const { error: rpcErr } = await admin.rpc("cancel_booking_with_release", {
      p_booking_id: payment.booking_id,
      p_reason: "cancelamento confirmado pelo gateway",
    });
    if (rpcErr) console.error("[pagarme-webhook] cancel_booking_with_release falhou:", rpcErr.message);
  }

  await markProcessed(admin, ev.eventId);
  return json({ ok: true, status: paymentStatus });
});
