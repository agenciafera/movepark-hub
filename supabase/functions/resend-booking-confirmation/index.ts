// Edge Function: /resend-booking-confirmation
// Reenvio do e-mail de confirmação de reserva pela equipe Movepark (Manager › Reservas). Serve
// para o cliente que perdeu o e-mail e para conferir o template em produção sem fazer compra nova.
// É o MESMO envio da confirmação original (`sendBookingConfirmationEmail`: template, voucher em
// anexo, QR da cancela quando há integração), só que com a guarda de exatamente-uma-vez
// (`booking.confirmation_email_sent_at`) zerada antes, de propósito, para o helper enviar de novo.
//
// POST /functions/v1/resend-booking-confirmation
//   Authorization: Bearer <JWT de hub_admin>  (ou a service role, para uso interno pela CLI)
//   { code: "MP-XXXXXX" }
// → { ok: true, code, to, outcome: "sent" | "held", previous_sent_at, sent_at }
//   403 se não for hub_admin | 404 reserva inexistente | 409 reserva que não está confirmada
//   422 sem e-mail de contato | 502 falha no envio (a guarda volta a NULL)
//
// `held`: a unidade tem integração de cancela com entrega pendente; o e-mail sai quando o código
// chegar (integrations/process.ts), como na confirmação original. Reserva cancelada, expirada,
// concluída ou pendente não recebe: o template afirma "sua reserva está confirmada".

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { customerRecipient, sendBookingConfirmationEmail } from "../_shared/booking-confirmation.ts";
import { canResendConfirmation, parseResendInput, resendOutcome } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k)!;
}

/** Claim `role` do JWT (sem verificar assinatura: o gate verify_jwt da plataforma já fez isso). */
function isServiceRole(token: string): boolean {
  if (token === env("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação necessária" }, 401);

  // Quem chama: hub_admin logado (Manager) ou a própria service role (operação interna pela CLI).
  // A assinatura do JWT já foi conferida pelo gate da plataforma (verify_jwt ligado nesta função).
  const token = authHeader.slice("Bearer ".length).trim();
  let callerId = "service_role";
  if (!isServiceRole(token)) {
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
    const { data: isAdmin } = await userClient.rpc("is_hub_admin");
    if (isAdmin !== true) return json({ error: "Só a equipe Movepark reenvia a confirmação." }, 403);
    callerId = userData.user.id;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = parseResendInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { code } = parsed.input;

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: b, error: bErr } = await admin
    .from("booking")
    .select("id, code, status, confirmation_email_sent_at, customer_email, customer_name, profile_id")
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return json({ error: bErr.message }, 500);
  if (!b) return json({ error: "Reserva não encontrada." }, 404);
  if (!canResendConfirmation(b.status)) {
    return json({ error: `A reserva está ${b.status}; só reserva confirmada recebe o e-mail de confirmação.` }, 409);
  }
  const { email } = await customerRecipient(admin, b);
  if (!email) return json({ error: "A reserva não tem e-mail de contato." }, 422);

  // Zera a guarda de propósito: o helper só envia quando o carimbo está NULL.
  const previousSentAt: string | null = b.confirmation_email_sent_at ?? null;
  const { error: clearErr } = await admin
    .from("booking")
    .update({ confirmation_email_sent_at: null })
    .eq("id", b.id);
  if (clearErr) return json({ error: clearErr.message }, 500);

  console.log(`[resend-booking-confirmation] ${callerId} reenviou a confirmação da ${code}`);

  try {
    await sendBookingConfirmationEmail(admin, b.id);
  } catch (e) {
    // O helper já devolveu a guarda a NULL; registra o carimbo antigo para a ficha não perder o histórico.
    if (previousSentAt) {
      await admin.from("booking").update({ confirmation_email_sent_at: previousSentAt }).eq("id", b.id);
    }
    return json({ error: `O e-mail não saiu: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  const { data: after } = await admin
    .from("booking")
    .select("confirmation_email_sent_at")
    .eq("id", b.id)
    .maybeSingle();
  const sentAt: string | null = after?.confirmation_email_sent_at ?? null;
  const held = !sentAt;
  if (held && previousSentAt) {
    // Retido pela integração: o envio futuro vai carimbar; até lá a ficha mantém o histórico antigo.
    await admin.from("booking").update({ confirmation_email_sent_at: previousSentAt }).eq("id", b.id);
  }

  return json({
    ok: true,
    code,
    to: email,
    outcome: resendOutcome(sentAt, held),
    previous_sent_at: previousSentAt,
    sent_at: sentAt,
  });
});
