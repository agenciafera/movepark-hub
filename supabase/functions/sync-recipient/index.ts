// Edge Function: /sync-recipient
// Cria/sincroniza o recebedor do parceiro no gateway de pagamento (ADR-004), pela camada de
// abstração `_shared/payments`. Grava o vínculo (external_recipient_id, status, link de KYC,
// pendências) em `payout_recipient` e registra a resposta crua em `payout_recipient_event`.
//
// Restrito a hub_admin. A coleta de KYC/dados bancários (UI do parceiro) é E1.3 — aqui os dados
// vêm de `company_payout_account` (preenchidos manualmente para o recebedor de teste).
//
// POST /functions/v1/sync-recipient
// Authorization: Bearer <JWT hub_admin>
// { "company_id": "uuid", "action": "create" | "refresh", "provider"?: "pagarme" }
//
// Resposta: { ok, status, external_recipient_id, kyc_url, requirements }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import {
  accountToRecipientInput,
  parseSyncInput,
  redactRecipientBody,
  type PayoutAccountRow,
} from "./logic.ts";
import { buildCreateRecipientBody } from "../_shared/payments/pagarme.ts";

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

/** Roda em background — não bloqueia nem derruba a resposta. */
function runBg(p: Promise<unknown>) {
  try {
    // @ts-expect-error - EdgeRuntime global
    EdgeRuntime.waitUntil(p);
  } catch {
    /* já roda em background */
  }
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

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

  // Só hub_admin pode operar recebedores.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== "hub_admin") {
    return jsonResponse({ error: "Acesso restrito a administradores." }, 403);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseSyncInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  // Empresa precisa existir.
  const { data: company } = await admin
    .from("company")
    .select("id")
    .eq("id", input.company_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!company) return jsonResponse({ error: "Empresa não encontrada." }, 404);

  // E-mail de contato (opcional no gateway) vem do onboarding.
  const { data: onboarding } = await admin
    .from("company_onboarding")
    .select("contact_email")
    .eq("company_id", input.company_id)
    .maybeSingle();
  const contactEmail = (onboarding as { contact_email: string | null } | null)?.contact_email ?? null;

  // Garante a linha de payout_recipient (nasce em draft).
  let { data: recipient } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, status, provider")
    .eq("company_id", input.company_id)
    .eq("provider", input.provider)
    .is("deleted_at", null)
    .maybeSingle();

  if (!recipient) {
    const { data: created, error: createErr } = await admin
      .from("payout_recipient")
      .insert({ company_id: input.company_id, provider: input.provider, status: "draft" })
      .select("id, external_recipient_id, status, provider")
      .single();
    if (createErr) return jsonResponse({ error: createErr.message }, 500);
    recipient = created;
  }

  let gateway;
  try {
    gateway = getGateway(input.provider);
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  // ── REFRESH ───────────────────────────────────────────────────────────────
  if (input.action === "refresh") {
    if (!recipient.external_recipient_id) {
      return jsonResponse({ error: "Recebedor ainda não foi criado no gateway." }, 400);
    }
    const result = await gateway.getRecipient(recipient.external_recipient_id);
    await admin
      .from("payout_recipient")
      .update({
        status: result.status,
        last_provider_status: result.rawStatus,
        kyc_url: result.kycUrl,
        requirements: result.requirements,
      })
      .eq("id", recipient.id);
    runBg(
      admin.from("payout_recipient_event").insert({
        payout_recipient_id: recipient.id,
        kind: "refresh",
        http_status: result.httpStatus,
        request: null,
        response: result.raw,
      }),
    );
    return jsonResponse({
      ok: true,
      status: result.status,
      external_recipient_id: result.externalId,
      kyc_url: result.kycUrl,
      requirements: result.requirements,
    });
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  const { data: account } = await admin
    .from("company_payout_account")
    .select(
      "legal_name, document, document_type, bank_code, branch_number, branch_check_digit, account_number, account_check_digit, account_type, holder_name, holder_document, kyc_details",
    )
    .eq("company_id", input.company_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) {
    return jsonResponse(
      { error: "Dados bancários/KYC ausentes — preencha company_payout_account (E1.3)." },
      400,
    );
  }

  const recipientInput = accountToRecipientInput(
    input.company_id,
    account as PayoutAccountRow,
    contactEmail,
  );

  // Cadência de saque agregada (E0.3.3) — diluir a taxa: transferir agregado, não por transação.
  const { data: transferCfg } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", ["payout_transfer_enabled", "payout_transfer_interval", "payout_transfer_day"]);
  const cfg = Object.fromEntries((transferCfg ?? []).map((s) => [s.key, s.value]));
  if (cfg.payout_transfer_interval) {
    const interval = cfg.payout_transfer_interval.toLowerCase();
    recipientInput.transferSettings = {
      enabled: cfg.payout_transfer_enabled !== "false",
      // Pagar.me espera Capitalizado (Daily/Weekly/Monthly).
      interval: interval.charAt(0).toUpperCase() + interval.slice(1),
      day: Number(cfg.payout_transfer_day ?? 0) || 0,
    };
  }

  const result = await gateway.createRecipient(recipientInput);

  await admin
    .from("payout_recipient")
    .update({
      external_recipient_id: result.externalId,
      status: result.status,
      last_provider_status: result.rawStatus,
      kyc_url: result.kycUrl,
      requirements: result.requirements,
    })
    .eq("id", recipient.id);

  runBg(
    admin.from("payout_recipient_event").insert({
      payout_recipient_id: recipient.id,
      kind: "create",
      http_status: result.httpStatus,
      request:
        input.provider === "pagarme" ? redactRecipientBody(buildCreateRecipientBody(recipientInput)) : null,
      response: result.raw,
    }),
  );

  return jsonResponse({
    ok: true,
    status: result.status,
    external_recipient_id: result.externalId,
    kyc_url: result.kycUrl,
    requirements: result.requirements,
  });
});
