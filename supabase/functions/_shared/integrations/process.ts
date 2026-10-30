// Processamento de uma entrega da fila de integrações (docs/specs/integracoes.md § 5.5 e § 5.6).
// Usado pelo cron (Edge `integration-deliver`) e pela tentativa imediata na confirmação do
// pagamento (`dispatch.ts`). Nunca lança: o resultado volta como string para a contagem.
//
// Depois do código:      voucher refeito com o QR da cancela; e-mail retido sai agora; se o
//                        e-mail já tinha saído com o QR do Hub, o cliente recebe o voucher novo.
// Retenção vencida:      o e-mail retido sai com o QR do Hub e a equipe e o parceiro são avisados.
// Falha definitiva:      idem, avisando que a fila parou de tentar.

import { getProvider } from "./registry.ts";
import { redactForTrail } from "./trail.ts";
import { nextRetryDelaySeconds, shouldGiveUp } from "./schedule.ts";
import { BOOKING_INPUT_SELECT, bookingRowToReserveInput, SENDABLE } from "./input.ts";
import { generateAndStoreVoucher } from "../voucher/pdf.ts";
import { mapBookingRowToVoucher, VOUCHER_BOOKING_SELECT } from "../voucher/fields.ts";
import { customerRecipient, sendBookingConfirmationEmail, voucherAttachment } from "../booking-confirmation.ts";
import {
  getEmailConfig,
  sendEmail,
  sendPartnerEmail,
  siteUrl,
  tplAccessCodeUpdated,
  tplIntegrationAlert,
} from "../email.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Linha devolvida por `integration_delivery_claim`. */
export interface ClaimedDelivery {
  id: string;
  connection_id: string;
  company_id: string;
  source: "hub" | "site";
  booking_id: string | null;
  wl_order_id: number | null;
  operation: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  hold_until: string | null;
  email_held_at: string | null;
  hold_released_at: string | null;
  provider: string;
  location_id: string;
  connection_enabled: boolean;
  config: unknown;
}

export type DeliveryResult = "delivered" | "retried" | "failed" | "cancelled";

async function finish(admin: Admin, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("integration_delivery").update(patch).eq("id", id);
  if (error) console.error("[integrations] falha ao gravar a entrega:", id, error.message);
}

export async function processDelivery(
  admin: Admin,
  d: ClaimedDelivery,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<DeliveryResult> {
  const attempts = (d.attempts ?? 0) + 1;
  try {
    if (d.source !== "hub" || !d.booking_id) {
      // Vendas do site entram na Fase 3.
      await finish(admin, d.id, { status: "failed", attempts, last_error: "Origem ainda não suportada" });
      return "failed";
    }
    if (!d.connection_enabled) {
      await finish(admin, d.id, { status: "cancelled", attempts, last_error: "Integração desligada" });
      await releaseHold(admin, d.id, { retrying: false, error: "Integração desligada", alert: false });
      return "cancelled";
    }

    const { data: b, error: bErr } = await admin
      .from("booking")
      .select(BOOKING_INPUT_SELECT)
      .eq("id", d.booking_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!b || !SENDABLE.has(b.status)) {
      await finish(admin, d.id, {
        status: "cancelled",
        attempts,
        last_error: b ? `Reserva ${b.status}` : "Reserva não encontrada",
      });
      await releaseHold(admin, d.id, { retrying: false, error: null, alert: false, email: false });
      return "cancelled";
    }

    const provider = getProvider(d.provider);
    const { data: secret } = await admin.rpc("integration_connection_secret", { p_connection_id: d.connection_id });
    if (!secret) {
      await finish(admin, d.id, { status: "failed", attempts, last_error: "Integração sem token salvo" });
      await failedForGood(admin, d.id, "Integração sem token salvo");
      return "failed";
    }

    let cfg: unknown;
    try {
      cfg = provider.parseConfig(d.config);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finish(admin, d.id, { status: "failed", attempts, last_error: msg });
      await failedForGood(admin, d.id, msg);
      return "failed";
    }

    const out = await provider.reserve(cfg, String(secret), bookingRowToReserveInput(b), opts);

    await admin.from("integration_attempt").insert({
      delivery_id: d.id,
      http_status: out.httpStatus,
      duration_ms: out.durationMs,
      request: redactForTrail(out.request),
      response: out.response ?? null,
      error: out.ok ? null : out.error,
    });

    if (out.ok) {
      const { error: codeErr } = await admin.from("integration_access_code").insert({
        connection_id: d.connection_id,
        company_id: d.company_id,
        booking_id: d.booking_id,
        delivery_id: d.id,
        code: out.code,
      });
      // 23505: já há código ativo (corrida com outra tentativa). O que vale é o primeiro.
      if (codeErr && codeErr.code !== "23505") throw new Error(codeErr.message);
      await finish(admin, d.id, {
        status: "delivered",
        attempts,
        delivered_at: new Date().toISOString(),
        external_code: out.code,
        last_status: out.httpStatus,
        last_error: null,
      });
      await afterAccessCode(admin, d.id, d.booking_id);
      return "delivered";
    }

    if (out.kind === "auth") {
      await admin.from("integration_connection").update({ auth_failed_at: new Date().toISOString() }).eq("id", d.connection_id);
    }
    if (out.kind !== "transient" || shouldGiveUp(attempts, d.max_attempts ?? 28)) {
      await finish(admin, d.id, { status: "failed", attempts, last_status: out.httpStatus, last_error: out.error });
      await failedForGood(admin, d.id, out.error);
      return "failed";
    }
    await finish(admin, d.id, {
      attempts,
      next_attempt_at: new Date(Date.now() + nextRetryDelaySeconds(attempts) * 1000).toISOString(),
      last_status: out.httpStatus,
      last_error: out.error,
    });
    return "retried";
  } catch (e) {
    // Erro nosso (banco, e-mail): tenta de novo pela agenda, sem perder a entrega.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[integrations] erro ao processar a entrega:", d.id, msg);
    await finish(admin, d.id, {
      attempts,
      next_attempt_at: new Date(Date.now() + nextRetryDelaySeconds(attempts) * 1000).toISOString(),
      last_error: msg,
    });
    return "retried";
  }
}

/** Depois do código: voucher novo e o e-mail certo para o cliente. */
async function afterAccessCode(admin: Admin, deliveryId: string, bookingId: string): Promise<void> {
  await generateAndStoreVoucher(admin, bookingId, siteUrl()).catch((e) =>
    console.error("[integrations] falha ao refazer o voucher:", bookingId, e)
  );
  // Relê depois de marcar `delivered`: um e-mail retido entre a reivindicação e agora conta.
  const { data: row } = await admin
    .from("integration_delivery")
    .select("email_held_at, hold_released_at")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row?.email_held_at) return;
  if (!row.hold_released_at) {
    await sendBookingConfirmationEmail(admin, bookingId).catch((e) =>
      console.error("[integrations] falha ao soltar o e-mail de confirmação:", bookingId, e)
    );
  } else {
    await sendAccessCodeUpdatedEmail(admin, bookingId).catch((e) =>
      console.error("[integrations] falha ao mandar o voucher atualizado:", bookingId, e)
    );
  }
}

/**
 * Solta a retenção uma vez só (update condicional) e, se havia e-mail retido, manda agora com o
 * QR do Hub (`email: false` não manda). `alert` avisa a equipe e o parceiro.
 */
async function releaseHold(
  admin: Admin,
  deliveryId: string,
  o: { retrying: boolean; error: string | null; alert: boolean; email?: boolean },
): Promise<boolean> {
  const { data: row } = await admin
    .from("integration_delivery")
    .update({ hold_released_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .is("hold_released_at", null)
    .select("id, booking_id, company_id, connection_id, email_held_at")
    .maybeSingle();
  if (!row) return false;
  await afterHoldReleased(admin, row, o);
  return true;
}

/** Falha definitiva: solta a retenção (se ainda não soltou) e avisa que a fila parou. */
async function failedForGood(admin: Admin, deliveryId: string, error: string | null): Promise<void> {
  const released = await releaseHold(admin, deliveryId, { retrying: false, error, alert: true });
  if (released) return;
  // A retenção já tinha vencido (o aviso de "seguimos tentando" saiu); avisa que parou.
  const { data: row } = await admin
    .from("integration_delivery")
    .select("id, booking_id, company_id, connection_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (row) await sendIntegrationAlert(admin, row, { retrying: false, error });
}

/** Ação depois que a retenção foi solta (pela Edge, quando os 15 minutos vencem, ou aqui). */
export async function afterHoldReleased(
  admin: Admin,
  row: { id: string; booking_id: string | null; company_id: string; connection_id: string; email_held_at: string | null },
  o: { retrying: boolean; error: string | null; alert?: boolean; email?: boolean },
): Promise<void> {
  if (!row.booking_id) return;
  // Reserva cancelada antes do código: o e-mail retido não sai (não há o que confirmar).
  if (row.email_held_at && o.email !== false) {
    await sendBookingConfirmationEmail(admin, row.booking_id).catch((e) =>
      console.error("[integrations] falha ao soltar o e-mail de confirmação:", row.booking_id, e)
    );
  }
  if (o.alert !== false) await sendIntegrationAlert(admin, row, o);
}

async function supportInbox(admin: Admin): Promise<string | null> {
  const { data } = await admin.from("app_setting").select("value").eq("key", "support_inbox").maybeSingle();
  const v = String((data as { value?: string } | null)?.value ?? "").trim();
  if (v) return v;
  return (await getEmailConfig(admin)).inbox;
}

async function sendIntegrationAlert(
  admin: Admin,
  row: { booking_id: string | null; company_id: string; connection_id: string },
  o: { retrying: boolean; error: string | null },
): Promise<void> {
  try {
    if (!row.booking_id) return;
    const [{ data: b }, { data: conn }] = await Promise.all([
      admin
        .from("booking")
        .select("code, check_in_at, location:location!inner(name), vehicle:vehicle(license_plate)")
        .eq("id", row.booking_id)
        .maybeSingle(),
      admin.from("integration_connection").select("provider").eq("id", row.connection_id).maybeSingle(),
    ]);
    if (!b) return;
    const providerName = conn ? getProvider(conn.provider).name : "integração";
    const { from } = await getEmailConfig(admin);
    if (!from) return;
    const base = {
      bookingCode: b.code,
      providerName,
      locationName: b.location?.name ?? "",
      checkInAt: b.check_in_at,
      plate: b.vehicle?.license_plate ?? null,
      error: o.error,
      retrying: o.retrying,
    };

    const team = await supportInbox(admin);
    if (team) {
      const t = tplIntegrationAlert({ ...base, bookingUrl: `${siteUrl()}/manager/bookings/${b.code}` });
      await sendEmail({ from, to: team, subject: t.subject, html: t.html });
    }

    const { data: membros } = await admin.rpc("partner_digest_recipients", { p_company_id: row.company_id });
    const para = ((membros ?? []) as unknown[]).map((m) => String(m)).filter(Boolean);
    if (para.length) {
      const p = tplIntegrationAlert({ ...base, bookingUrl: `${siteUrl()}/operator/bookings/${b.code}` });
      await sendPartnerEmail(admin, { companyId: row.company_id, from, to: para, subject: p.subject, html: p.html });
    }
  } catch (e) {
    console.error("[integrations] alerta não enviado:", row.booking_id, e);
  }
}

/** O QR da cancela chegou depois do voucher: manda o voucher novo, em anexo. */
async function sendAccessCodeUpdatedEmail(admin: Admin, bookingId: string): Promise<void> {
  const { data: b } = await admin
    .from("booking")
    .select(`${VOUCHER_BOOKING_SELECT}, customer_name, customer_email, profile_id`)
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return;
  const { email, name } = await customerRecipient(admin, b);
  if (!email) return;
  const { from } = await getEmailConfig(admin);
  if (!from) return;
  const voucher = mapBookingRowToVoucher(b);
  const tpl = tplAccessCodeUpdated(voucher, name, `${siteUrl()}/bookings/${voucher.code}`);
  const attachments = await voucherAttachment(admin, bookingId, voucher);
  const res = await sendEmail({ from, to: email, subject: tpl.subject, html: tpl.html, attachments });
  if (!res.ok) throw new Error(res.error ?? "falha no SMTP");
}
