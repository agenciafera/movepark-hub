// Edge Function: /sync-recipient
// Cria/sincroniza o recebedor do parceiro no gateway de pagamento (ADR-004), pela camada de
// abstração `_shared/payments`. Grava o vínculo (external_recipient_id, status, link de KYC,
// pendências) em `payout_recipient` e registra a resposta crua em `payout_recipient_event`.
//
// Aberta a hub_admin e ao DONO da própria empresa (com contrato assinado). Os dados de KYC e banco
// vêm de `company_payout_account`, preenchidos pelo parceiro na E1.3.
//
// POST /functions/v1/sync-recipient
// Authorization: Bearer <JWT hub_admin ou dono da empresa>
// { "company_id": "uuid", "action": "create" | "refresh" | "reissue_kyc", "provider"?: "pagarme" }
//
// - create:      cria o recebedor no gateway, guarda o link de prova de vida e avisa por e-mail.
// - refresh:     só relê o status. NÃO emite link (emitir invalida o anterior).
// - reissue_kyc: emite um link novo de prova de vida. Devolve o vigente se ainda estiver vivo e
//                tem cooldown de 60s, porque não existe rate limit na borda das Edge Functions.
//
// Resposta: { ok, status, external_recipient_id, kyc_url, kyc_url_expires_at, requirements }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { resolveAnticipation, resolveTransfer } from "../_shared/payments/payoutConfig.ts";
import {
  accountToRecipientInput,
  gatewayErrorMessage,
  parseSyncInput,
  redactRecipientBody,
  shouldReissueKycLink,
  type PayoutAccountRow,
} from "./logic.ts";
import { buildCreateRecipientBody } from "../_shared/payments/pagarme.ts";
import { getEmailConfig, sendEmail, tplKycLinkIssued } from "../_shared/email.ts";

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

/**
 * Avisa o parceiro por e-mail que a prova de vida está pendente, UMA vez por emissão de link.
 *
 * A unicidade vem de `kyc_link_email_sent_at`, reivindicado por UPDATE condicional antes de
 * qualquer envio: dois cliques quase simultâneos resultam num e-mail só. O cron não emite link e
 * portanto nunca chega aqui, que é o que impede os 4 e-mails por hora.
 *
 * Destinatário: o contato da ficha de KYC, com o contato do onboarding como reserva.
 */
// deno-lint-ignore no-explicit-any
async function notifyKycLink(admin: any, recipientId: string, companyId: string, fallbackEmail: string | null) {
  const { data: claimed } = await admin
    .from("payout_recipient")
    .update({ kyc_link_email_sent_at: new Date().toISOString() })
    .eq("id", recipientId)
    .is("kyc_link_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const { data: account } = await admin
    .from("company_payout_account")
    .select("kyc_details")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const kyc = (account as { kyc_details: Record<string, unknown> | null } | null)?.kyc_details;
  const kycEmail = typeof kyc?.email === "string" && kyc.email.trim() ? kyc.email.trim() : null;
  const to = kycEmail ?? fallbackEmail;
  if (!to) return;

  const { data: onboarding } = await admin
    .from("company_onboarding")
    .select("contact_name")
    .eq("company_id", companyId)
    .maybeSingle();

  const { from } = await getEmailConfig(admin);
  if (!from) return;

  const mail = tplKycLinkIssued(
    (onboarding as { contact_name: string | null } | null)?.contact_name ?? "",
  );
  await sendEmail({ from, to, subject: mail.subject, html: mail.html });
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

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseSyncInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  // Autorização: hub_admin OU o DONO da própria empresa. Payouts/KYC são owner-exclusive
  // (ADR-005); o dono só opera o recebedor da PRÓPRIA empresa e só depois de assinar o contrato.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  let allowed = caller?.role === "hub_admin";
  if (!allowed) {
    const { data: ownership } = await admin
      .from("profile_company")
      .select("role")
      .eq("profile_id", userData.user.id)
      .eq("company_id", input.company_id)
      .eq("role", "owner")
      .maybeSingle();
    if (ownership) {
      const { data: comp } = await admin
        .from("company")
        .select("contract_accepted_at")
        .eq("id", input.company_id)
        .maybeSingle();
      if (!(comp as { contract_accepted_at: string | null } | null)?.contract_accepted_at) {
        return jsonResponse({ error: "Assine o contrato antes de criar o recebedor." }, 403);
      }
      allowed = true;
    }
  }
  if (!allowed) {
    return jsonResponse({ error: "Acesso restrito." }, 403);
  }

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
    .select("id, external_recipient_id, status, provider, kyc_url, kyc_url_expires_at, transfer_enabled, transfer_interval, transfer_day, anticipation_enabled, anticipation_type, anticipation_volume_percentage, anticipation_delay, anticipation_days")
    .eq("company_id", input.company_id)
    .eq("provider", input.provider)
    .is("deleted_at", null)
    .maybeSingle();

  if (!recipient) {
    const { data: created, error: createErr } = await admin
      .from("payout_recipient")
      .insert({ company_id: input.company_id, provider: input.provider, status: "draft" })
      .select("id, external_recipient_id, status, provider, kyc_url, kyc_url_expires_at, transfer_enabled, transfer_interval, transfer_day, anticipation_enabled, anticipation_type, anticipation_volume_percentage, anticipation_delay, anticipation_days")
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
  // Só lê o status. Não emite link: emitir invalida o anterior e reinicia os 20 minutos, e quem
  // aperta "Sincronizar" quer saber como está a ficha, não derrubar o link que o parceiro abriu.
  if (input.action === "refresh") {
    if (!recipient.external_recipient_id) {
      return jsonResponse({ error: "Recebedor ainda não foi criado no gateway." }, 400);
    }
    const result = await gateway.getRecipient(recipient.external_recipient_id, { kycLink: false });
    await admin
      .from("payout_recipient")
      .update({
        status: result.status,
        last_provider_status: result.rawStatus,
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
      kyc_url: recipient.kyc_url ?? null,
      kyc_url_expires_at: recipient.kyc_url_expires_at ?? null,
      requirements: result.requirements,
    });
  }

  // ── REEMITIR LINK DE PROVA DE VIDA ────────────────────────────────────────
  if (input.action === "reissue_kyc") {
    if (!recipient.external_recipient_id) {
      return jsonResponse({ error: "Recebedor ainda não foi criado no gateway." }, 400);
    }

    const { data: lastIssue } = await admin
      .from("payout_recipient_event")
      .select("created_at")
      .eq("payout_recipient_id", recipient.id)
      .eq("kind", "kyc_link")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const decision = shouldReissueKycLink({
      expiresAt: recipient.kyc_url_expires_at,
      lastIssuedAt: (lastIssue as { created_at: string } | null)?.created_at ?? null,
      now: new Date(),
    });

    if (decision === "serve_existing") {
      return jsonResponse({
        ok: true,
        reused: true,
        status: recipient.status,
        external_recipient_id: recipient.external_recipient_id,
        kyc_url: recipient.kyc_url,
        kyc_url_expires_at: recipient.kyc_url_expires_at,
        requirements: [],
      });
    }
    if (decision === "cooldown") {
      return jsonResponse({ error: "Aguarde um minuto para gerar outro link." }, 429);
    }

    const result = await gateway.getRecipient(recipient.external_recipient_id, { kycLink: true });
    if (!result.kycUrl) {
      return jsonResponse(
        { error: "O gateway não liberou um link agora. Tente de novo em alguns minutos." },
        502,
      );
    }

    await admin
      .from("payout_recipient")
      .update({
        status: result.status,
        last_provider_status: result.rawStatus,
        kyc_url: result.kycUrl,
        kyc_url_expires_at: result.kycExpiresAt,
        kyc_link_email_sent_at: null,
        requirements: result.requirements,
      })
      .eq("id", recipient.id);

    runBg(
      admin.from("payout_recipient_event").insert({
        payout_recipient_id: recipient.id,
        kind: "kyc_link",
        http_status: result.httpStatus,
        request: null,
        response: result.raw,
      }),
    );
    runBg(notifyKycLink(admin, recipient.id, input.company_id, contactEmail));

    return jsonResponse({
      ok: true,
      status: result.status,
      external_recipient_id: result.externalId,
      kyc_url: result.kycUrl,
      kyc_url_expires_at: result.kycExpiresAt,
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

  // Config de repasse EFETIVA (coluna da empresa ?? default global) — E0.3.3.
  const { data: payoutCfg } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", [
      "payout_transfer_enabled",
      "payout_transfer_interval",
      "payout_transfer_day",
      "payout_anticipation_enabled",
      "payout_anticipation_type",
      "payout_anticipation_volume_percentage",
      "payout_anticipation_delay",
      "payout_anticipation_days",
    ]);
  const globalCfg = Object.fromEntries((payoutCfg ?? []).map((s) => [s.key, s.value]));
  recipientInput.transferSettings = resolveTransfer(recipient, globalCfg);
  const anticipation = resolveAnticipation(recipient, globalCfg);
  if (anticipation.enabled) recipientInput.anticipationSettings = anticipation;

  const result = await gateway.createRecipient(recipientInput);

  // Falha no gateway (sem external id): NÃO avança o status — senão fica um recebedor "Em análise"
  // fantasma sem id, que não dá pra sincronizar nem recriar de forma limpa. Mantém draft.
  if (!result.externalId) {
    // AWAIT (não runBg): é justamente quando precisamos do log — captura o motivo do gateway.
    await admin.from("payout_recipient_event").insert({
      payout_recipient_id: recipient.id,
      kind: "create",
      http_status: result.httpStatus,
      request:
        input.provider === "pagarme"
          ? redactRecipientBody(buildCreateRecipientBody(recipientInput))
          : null,
      response: result.raw,
    });
    return jsonResponse(
      {
        error: gatewayErrorMessage(result.raw)
          ?? "O gateway não criou o recebedor. Confira os dados de KYC/banco e tente novamente.",
        requirements: result.requirements,
      },
      502,
    );
  }

  await admin
    .from("payout_recipient")
    .update({
      external_recipient_id: result.externalId,
      status: result.status,
      last_provider_status: result.rawStatus,
      kyc_url: result.kycUrl,
      kyc_url_expires_at: result.kycExpiresAt,
      kyc_link_email_sent_at: null,
      requirements: result.requirements,
    })
    .eq("id", recipient.id);

  if (result.kycUrl) runBg(notifyKycLink(admin, recipient.id, input.company_id, contactEmail));

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
    kyc_url_expires_at: result.kycExpiresAt,
    requirements: result.requirements,
  });
});
