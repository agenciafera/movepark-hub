// Edge Function: /recipient-anticipation (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
//
// Antecipação pontual do recebedor de um parceiro ("Antecipar agora" no Manager) e leitura da
// configuração de antecipação automática de um recebedor. A Pagar.me desconta a taxa do recebedor
// antecipado; quem paga de fato fica congelado no pedido (`fee_borne_by`), e quando é a Movepark a
// taxa volta ao estacionamento como crédito na próxima venda (`payout_fee_credit_cents`).
//
// Porta 1: JWT de um hub_admin (Manager), todas as ações.
// Porta 2: header x-recipient-anticipation-key (chave no Vault), só `sync` (cron de status, a
//          Pagar.me aprova uma vez por dia às 11h) e `settings` (gates G1 a G3).
//
// POST /functions/v1/recipient-anticipation
// { action: "settings", company_id? | recipient?: "master" } → { recipient_id, settings }
// { action: "limits", company_id }                            → { max_amount_cents, max_anticipation_fee_cents }
// { action: "simulate", company_id, requested_cents, timeframe? } → { amount_cents, anticipation_fee_cents, payment_date }
// { action: "create", company_id, requested_cents, timeframe? }   → { id, status, anticipation_fee_cents, fee_borne_by }
// { action: "sync" }                                          → { ok, checked, updated }
// Todo pedido ao gateway grava `payment_gateway_event` (kind anticipation:*).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { feeBorneBy, parseAnticipationInput } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-recipient-anticipation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hubAdminId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false }, global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return null;
    const { data } = await userClient.rpc("is_hub_admin");
    return data === true ? userData.user.id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: expected } = await admin.rpc("recipient_anticipation_expected_key");
  const pelaChave = !!expected && req.headers.get("x-recipient-anticipation-key") === expected;
  const adminId = pelaChave ? null : await hubAdminId(req);

  const { input, error } = parseAnticipationInput(await req.json().catch(() => null));
  if (!input) return json({ error }, 400);
  const permitido = adminId !== null || (pelaChave && (input.action === "sync" || input.action === "settings"));
  if (!permitido) return json({ error: "unauthorized" }, 401);

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  async function recipientOf(companyId: string): Promise<string | null> {
    const { data } = await admin
      .from("payout_recipient")
      .select("external_recipient_id")
      .eq("company_id", companyId)
      .eq("provider", "pagarme")
      .is("deleted_at", null)
      .maybeSingle();
    return data?.external_recipient_id ?? null;
  }

  // ── settings: o que está configurado no recebedor ─────────────────────────
  if (input.action === "settings") {
    let rid: string | null = null;
    if (input.recipient === "master") {
      const { data } = await admin.from("app_setting").select("value").eq("key", "pagarme_movepark_recipient_id").maybeSingle();
      rid = (data?.value ?? "").trim() || null;
    } else {
      rid = await recipientOf(input.companyId!);
    }
    if (!rid) return json({ error: "Recebedor não encontrado." }, 404);
    // Sem emitir link de KYC: cada emissão invalida o anterior.
    const r = await gateway.getRecipient(rid, { kycLink: false });
    return json({ recipient_id: rid, settings: r.anticipationSettings ?? null, http_status: r.httpStatus });
  }

  // ── sync: status das pontuais abertas ─────────────────────────────────────
  if (input.action === "sync") {
    const { data: abertas, error: abertasErr } = await admin
      .from("payout_anticipation")
      .select("id, company_id, external_id")
      .in("status", ["pending", "pre_approved"])
      .is("deleted_at", null);
    if (abertasErr) return json({ error: abertasErr.message }, 500);
    const porEmpresa = new Map<string, { id: string; external_id: string | null }[]>();
    for (const a of abertas ?? []) {
      porEmpresa.set(a.company_id, [...(porEmpresa.get(a.company_id) ?? []), a]);
    }
    let updated = 0;
    for (const [companyId, lista] of porEmpresa) {
      const rid = await recipientOf(companyId);
      if (!rid) continue;
      try {
        const remotas = await gateway.listAnticipations(rid);
        for (const a of lista) {
          const r = remotas.find((x) => x.id === a.external_id);
          if (!r?.status) continue;
          await admin
            .from("payout_anticipation")
            .update({
              status: r.status,
              amount_cents: r.amountCents,
              anticipation_fee_cents: r.anticipationFeeCents,
              fee_cents: r.feeCents,
              payment_date: r.paymentDate,
            })
            .eq("id", a.id);
          updated += 1;
        }
      } catch (e) {
        console.error("[recipient-anticipation] sync falhou na empresa", companyId, e);
      }
    }
    return json({ ok: true, checked: abertas?.length ?? 0, updated });
  }

  // ── limits / simulate / create ────────────────────────────────────────────
  const rid = await recipientOf(input.companyId!);
  if (!rid) return json({ error: "O estacionamento não tem recebedor no gateway." }, 409);

  if (input.action === "limits") {
    const l = await gateway.getAnticipationLimits(rid, input.timeframe);
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: null,
      kind: "anticipation:limits",
      httpStatus: l.httpStatus,
      request: { recipient_id: rid },
      response: l.raw,
      note: `máximo ${l.maxAmountCents ?? "?"} c`,
    });
    if (!l.httpStatus || l.httpStatus >= 400) {
      return json({ error: "A Pagar.me não informou o limite de antecipação.", detail: l.raw }, 502);
    }
    return json({ max_amount_cents: l.maxAmountCents, max_anticipation_fee_cents: l.maxAnticipationFeeCents });
  }

  const pedido = { recipientId: rid, requestedCents: input.requestedCents!, timeframe: input.timeframe };

  if (input.action === "simulate") {
    const s = await gateway.simulateAnticipation(pedido);
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: null,
      kind: "anticipation:simulate",
      httpStatus: s.httpStatus,
      request: pedido,
      response: s.raw,
      note: `simulação ${input.requestedCents} c · taxa ${s.anticipationFeeCents ?? "?"} c`,
    });
    if (!s.httpStatus || s.httpStatus >= 400) {
      return json({ error: "A Pagar.me recusou a simulação.", detail: s.raw }, 502);
    }
    return json({ amount_cents: s.amountCents, anticipation_fee_cents: s.anticipationFeeCents, payment_date: s.paymentDate });
  }

  // create
  const { data: co } = await admin.from("company").select("anticipation_fee_payer").eq("id", input.companyId!).maybeSingle();
  const { data: padrao } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "commission_default_anticipation_payer")
    .maybeSingle();
  const pagador = feeBorneBy(co?.anticipation_fee_payer ?? null, padrao?.value ?? null);
  const c = await gateway.createAnticipation(pedido);
  await logGatewayEvent(admin, {
    paymentId: null,
    bookingId: null,
    kind: "anticipation:create",
    httpStatus: c.httpStatus,
    request: { ...pedido, fee_borne_by: pagador, requested_by: adminId },
    response: c.raw,
    note: `antecipação ${c.id ?? "?"} ${c.status ?? "?"} · taxa ${c.anticipationFeeCents ?? "?"} c · paga por ${pagador}`,
  });
  if (!c.id || !c.httpStatus || c.httpStatus >= 400) {
    return json({ error: "A Pagar.me recusou a antecipação.", detail: c.raw }, 502);
  }
  const { error: insErr } = await admin.from("payout_anticipation").insert({
    company_id: input.companyId,
    provider: "pagarme",
    external_id: c.id,
    requested_cents: input.requestedCents,
    amount_cents: c.amountCents,
    anticipation_fee_cents: c.anticipationFeeCents,
    fee_cents: c.feeCents,
    timeframe: input.timeframe,
    status: c.status ?? "pending",
    payment_date: c.paymentDate,
    fee_borne_by: pagador,
    created_by: adminId,
  });
  // A antecipação já existe no gateway: falhar aqui não pode esconder isso. O rastro acima tem tudo.
  if (insErr) console.error("[recipient-anticipation] insert falhou:", insErr.message);
  return json({ id: c.id, status: c.status, anticipation_fee_cents: c.anticipationFeeCents, fee_borne_by: pagador }, 201);
});
