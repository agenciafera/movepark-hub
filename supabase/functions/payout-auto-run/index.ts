// Edge Function: /payout-auto-run (E0.3.13, repasse automático mensal)
//
// Chamada pelo pg_cron todo dia às 12:00 UTC (9h de Brasília) com o header x-payout-auto-key (Vault),
// ou por hub_admin (JWT) para rodar à mão. Para cada empresa cujo dia de repasse é hoje
// (payout_auto_due), abre o ciclo do mês (unique: rodar duas vezes não saca duas vezes), relê o
// saldo, calcula o disponível e saca tudo com origin=automatic e fee_borne_by=movepark; abaixo do
// mínimo fecha como below_min e o valor acumula para o mês seguinte.
//
// POST /functions/v1/payout-auto-run   { dry_run?: boolean, company_id?: uuid, today?: "YYYY-MM-DD" }
// → { ok, today, due, results: [{ company_id, outcome, available_cents, amount_cents, withdrawal_id, reason }] }
// Spec: docs/specs/repasse-automatico-mensal.md

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { performWithdrawal } from "../_shared/payments/performWithdrawal.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { brtToday, decideOutcome, parseRunInput } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Quem chama: o cron (chave do Vault) ou hub_admin (JWT).
  let isHubAdmin = false;
  const { data: expected } = await admin.rpc("payout_auto_expected_key");
  const keyOk = Boolean(expected) && req.headers.get("x-payout-auto-key") === expected;
  if (!keyOk) {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (prof?.role !== "hub_admin") return json({ error: "Só hub_admin roda o repasse à mão." }, 403);
    isHubAdmin = true;
  }

  const input = parseRunInput(await req.json().catch(() => ({})), isHubAdmin);
  const today = input.today ?? brtToday(new Date());

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const { data: due, error: dueErr } = await admin.rpc("payout_auto_due", { p_today: today });
  if (dueErr) return json({ error: dueErr.message }, 500);
  const { data: minRaw } = await admin.rpc("payout_auto_min_cents");
  const minCents = Number(minRaw ?? 5000);
  const alvo = (due ?? []).filter((d: { company_id: string }) => !input.companyId || d.company_id === input.companyId);

  const results: Record<string, unknown>[] = [];
  for (const d of alvo as { company_id: string; scheduled_for: string }[]) {
    const cycleMonth = `${today.slice(0, 7)}-01`;
    if (input.dryRun) {
      const { data: teto } = await admin.rpc("payout_withdrawable", { p_company_id: d.company_id });
      const t = (teto ?? {}) as { available_cents?: number; gateway_available_cents?: number | null };
      results.push({ company_id: d.company_id, outcome: decideOutcome({ availableCents: Number(t.available_cents ?? 0), minCents, gatewayAvailableCents: t.gateway_available_cents ?? null }), available_cents: t.available_cents ?? 0, dry_run: true });
      continue;
    }
    // Abre o ciclo. Conflito = já rodou este mês (outra instância ou rerun): pula.
    const { data: cycle } = await admin
      .from("payout_auto_cycle")
      .upsert({ company_id: d.company_id, cycle_month: cycleMonth, scheduled_for: today, outcome: "running" }, { onConflict: "company_id,cycle_month", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!cycle) { results.push({ company_id: d.company_id, outcome: "already_ran" }); continue; }

    const fechar = (patch: Record<string, unknown>) => admin.from("payout_auto_cycle").update(patch).eq("id", cycle.id);
    try {
      const { data: rec } = await admin.from("payout_recipient").select("id, external_recipient_id").eq("company_id", d.company_id).eq("provider", "pagarme").is("deleted_at", null).maybeSingle();
      if (!rec?.external_recipient_id) { await fechar({ outcome: "no_recipient", reason: "sem recebedor" }); results.push({ company_id: d.company_id, outcome: "no_recipient" }); continue; }
      const saldo = await gateway.getRecipientBalance(rec.external_recipient_id);
      if ((saldo.httpStatus ?? 0) >= 200 && (saldo.httpStatus ?? 0) < 300 && saldo.availableCents != null) {
        await admin.from("payout_recipient").update({ balance_available_cents: saldo.availableCents, balance_waiting_cents: saldo.waitingFundsCents ?? 0, balance_transferred_cents: saldo.transferredCents ?? 0, balance_synced_at: new Date().toISOString() }).eq("id", rec.id);
      }
      const { data: teto, error: tetoErr } = await admin.rpc("payout_withdrawable", { p_company_id: d.company_id });
      if (tetoErr || !teto) { await fechar({ outcome: "failed", reason: "sem disponível calculado" }); results.push({ company_id: d.company_id, outcome: "failed", reason: "sem disponível calculado" }); continue; }
      const t = teto as { available_cents?: number; gateway_available_cents?: number | null };
      const availableCents = Number(t.available_cents ?? 0);
      const decision = decideOutcome({ availableCents, minCents, gatewayAvailableCents: saldo.availableCents ?? t.gateway_available_cents ?? null });
      if (decision !== "withdraw") {
        await fechar({ outcome: decision, available_cents: availableCents, reason: decision === "below_min" ? `abaixo do mínimo de ${minCents} centavos` : "saldo no gateway não cobre o disponível" });
        results.push({ company_id: d.company_id, outcome: decision, available_cents: availableCents });
        continue;
      }
      const r = await performWithdrawal(admin, gateway, {
        companyId: d.company_id, amountCents: availableCents, force: false, isHubAdmin: false,
        requestedBy: "payout-auto-run", origin: "automatic", feeBorneBy: "movepark", cycleId: cycle.id,
      });
      if (r.ok) {
        await fechar({ outcome: "paid", available_cents: availableCents, amount_cents: r.amount_cents, withdrawal_id: r.withdrawal_id });
        results.push({ company_id: d.company_id, outcome: "paid", available_cents: availableCents, amount_cents: r.amount_cents, withdrawal_id: r.withdrawal_id });
      } else {
        await fechar({ outcome: "failed", available_cents: availableCents, reason: r.error });
        results.push({ company_id: d.company_id, outcome: "failed", available_cents: availableCents, reason: r.error });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await fechar({ outcome: "failed", reason: msg });
      results.push({ company_id: d.company_id, outcome: "failed", reason: msg });
    }
  }

  await logGatewayEvent(admin, {
    paymentId: null, bookingId: null, kind: "payout-auto-run", httpStatus: 200,
    request: { today, dry_run: input.dryRun, company_id: input.companyId },
    response: { due: alvo.length, results },
    note: `repasse automático: ${results.filter((r) => r.outcome === "paid").length} pagos de ${alvo.length}`,
  });
  return json({ ok: true, today, due: alvo.length, results });
});
