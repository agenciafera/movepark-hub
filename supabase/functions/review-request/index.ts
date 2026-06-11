// Edge Function: /review-request
// Coleta pós-estadia: envia e-mail pedindo avaliação para reservas concluídas
// (status='completed') que ainda não foram avaliadas e ainda não receberam o pedido.
// Idempotente via booking.review_request_sent_at. Chamada por cron (pg_cron + pg_net)
// com o service-role como Bearer.
//
// POST /functions/v1/review-request   { "limit"?: number }
// → { processed, sent }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, siteUrl, getEmailConfig, tplReviewRequest } from "../_shared/email.ts";

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

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let limit = 50;
  try {
    const body = await req.json();
    if (typeof body?.limit === "number") limit = Math.min(body.limit, 200);
  } catch {
    // sem body — usa o default
  }

  // reservas concluídas, sem pedido enviado, com a review embutida p/ filtrar já avaliadas
  const { data: rows, error } = await admin
    .from("booking")
    .select(
      `id, code, profile_id,
       location:location!inner(name),
       profile:profiles!inner(full_name),
       review:review(id)`,
    )
    .eq("status", "completed")
    .is("review_request_sent_at", null)
    .limit(limit);

  if (error) return json({ error: error.message }, 500);

  // deno-lint-ignore no-explicit-any
  const pending = (rows ?? []).filter((b: any) => !(b.review?.length));
  const cfg = await getEmailConfig(admin);

  let sent = 0;
  for (const b of pending) {
    // deno-lint-ignore no-explicit-any
    const row = b as any;
    const { data: u } = await admin.auth.admin.getUserById(row.profile_id);
    const email = u?.user?.email;
    if (!email || !cfg.from) continue;

    const tpl = tplReviewRequest(
      row.profile?.full_name ?? "cliente",
      row.location?.name ?? "seu estacionamento",
      `${siteUrl()}/bookings/${row.code}`,
    );
    const res = await sendEmail({ from: cfg.from, to: email, subject: tpl.subject, html: tpl.html });
    if (res.ok) {
      await admin
        .from("booking")
        .update({ review_request_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    }
  }

  return json({ processed: pending.length, sent });
});
