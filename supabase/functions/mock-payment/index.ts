// Edge Function: /mock-payment
// MVP de pagamento mockado. Confirma a reserva em background após delay.
//
// POST /functions/v1/mock-payment
// Authorization: Bearer <JWT>
// {
//   "booking_code": "MP-XXXXXX",
//   "method": "pix" | "card",
//   "card_number": "4111 1111 1111 1111"  // só pra method=card
// }
//
// Comportamento:
//  - card_number termina em 0002 → retorna 402 "Cartão recusado"
//  - card → confirma em 1 segundo
//  - pix  → confirma em 3 segundos
//
// Resposta imediata (202):
// {
//   "payment_id": "...",
//   "status": "pending",
//   "expected_confirmation_in_seconds": 3,
//   "pix_payload": "00020126..."   // string fake pro QR code (só pra PIX)
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/booking-confirmation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Input {
  booking_code: string;
  method: "pix" | "card";
  card_number?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "Sessão inválida" }, 401);
  }

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!input.booking_code) {
    return jsonResponse({ error: "booking_code é obrigatório" }, 400);
  }
  if (!input.method || (input.method !== "pix" && input.method !== "card")) {
    return jsonResponse({ error: "method precisa ser 'pix' ou 'card'" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Load booking — verifica que pertence ao user
  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select("id, code, status, total_amount, expires_at, profile_id")
    .eq("code", input.booking_code)
    .maybeSingle();

  if (bErr || !booking) {
    return jsonResponse({ error: "Reserva não encontrada" }, 404);
  }
  if (booking.profile_id !== userData.user.id) {
    return jsonResponse({ error: "Reserva não pertence a você" }, 403);
  }
  if (booking.status !== "pending") {
    return jsonResponse(
      { error: `Reserva já está ${booking.status}` },
      400,
    );
  }
  if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
    return jsonResponse({ error: "Reserva expirada" }, 400);
  }

  // 2. Cartão recusado se termina em 0002
  if (input.method === "card") {
    const digits = (input.card_number ?? "").replace(/\D/g, "");
    if (digits.length < 13) {
      return jsonResponse(
        { error: "Número do cartão inválido" },
        400,
      );
    }
    if (digits.endsWith("0002")) {
      return jsonResponse(
        { error: "Cartão recusado pelo emissor (mock)" },
        402,
      );
    }
  }

  // 3. Cria payment pendente
  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "mock",
    provider_payment_id: `mock_${paymentId}`,
    amount: booking.total_amount,
    status: "pending",
  });
  if (payErr) {
    return jsonResponse({ error: payErr.message }, 500);
  }

  const delayMs = input.method === "pix" ? 3000 : 1000;

  // 4. Confirma em background — EdgeRuntime.waitUntil mantém função viva
  const confirmPromise = new Promise<void>((resolve) => {
    setTimeout(async () => {
      try {
        await admin
          .from("payment")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", paymentId);
        await admin
          .from("booking")
          .update({ status: "confirmed" })
          .eq("id", booking.id);
        // E-mail de confirmação (mesmo helper do fluxo real; guarda de exatamente-uma-vez).
        await sendBookingConfirmationEmail(admin, booking.id).catch((e) =>
          console.error("[mock-payment] falha ao enviar e-mail de confirmação:", booking.id, e),
        );
      } finally {
        resolve();
      }
    }, delayMs);
  });

  // @ts-expect-error EdgeRuntime é injetado pelo Supabase
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-expect-error
    EdgeRuntime.waitUntil(confirmPromise);
  } else {
    // Fallback: aguarda síncrono. Bloqueia resposta mas garante consistência.
    await confirmPromise;
  }

  // 5. Retorna info pra UI mostrar QR/loading
  const pixPayload =
    input.method === "pix"
      ? `00020126580014BR.GOV.BCB.PIX0136mock-${booking.code}5204000053039865404${Number(booking.total_amount).toFixed(2)}5802BR5913Movepark Mock6009Sao Paulo62070503***6304MOCK`
      : null;

  return jsonResponse(
    {
      payment_id: paymentId,
      status: "pending",
      expected_confirmation_in_seconds: delayMs / 1000,
      pix_payload: pixPayload,
    },
    202,
  );
});
