// Edge Function: /recipient-withdraw (E0.3.7, conta do parceiro)
//
// Saque do saldo do recebedor do parceiro para a conta bancária dele, pedido pela tela "Conta"
// (Manager, por empresa) ou pelo Operator (a própria). É o botão "Repassar" do extrato: não é o
// repasse da custódia (create-payout-transfer), que move dinheiro entre recebedores.
//
// POST /functions/v1/recipient-withdraw   Authorization: Bearer <JWT>
// { "company_id": "uuid", "amount_cents": 5000, "force"?: true }
// → { ok, withdrawal_id, external_transfer_id, status, requested_cents, amount_cents (vai ao banco), fee_cents }
//
// Permissão: hub_admin OU membro da empresa com `payouts:write` (o Dono, ADR-005).
// Pré-voo: lê o saldo disponível do recebedor ao vivo; só pede quando cobre. Idempotência pelo
// header do gateway; a linha em `payout_withdrawal` nasce com o id que o gateway devolveu e o
// webhook `transfer.*` (quando chega) e a conciliação atualizam o status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { performWithdrawal } from "../_shared/payments/performWithdrawal.ts";
import { parseWithdrawInput } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseWithdrawInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const { data: caller } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  const isHubAdmin = caller?.role === "hub_admin";
  if (!isHubAdmin) {
    const { data: allowed } = await userClient.rpc("member_has_scope", {
      p_company_id: input.companyId,
      p_scope: "payouts:write",
    });
    if (!allowed) return jsonResponse({ error: "Sem permissão para sacar por esta empresa." }, 403);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }
  // O saque em si é o mesmo do repasse automático (E0.3.13): pré-voo, teto, gateway, linha,
  // e-mails, rastro e releitura do saldo vivem em performWithdrawal.
  const r = await performWithdrawal(admin, gateway, {
    companyId: input.companyId,
    amountCents: input.amountCents,
    force: input.force,
    isHubAdmin,
    requestedBy: userData.user.id,
    origin: "manual",
    feeBorneBy: "partner",
  });
  if (!r.ok) {
    const { status, ...body } = r;
    return jsonResponse(body, status);
  }
  return jsonResponse(r);
});
