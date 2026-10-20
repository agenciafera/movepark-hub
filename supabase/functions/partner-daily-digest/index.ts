// Edge Function: /partner-daily-digest (20/10/2026)
// Resumo diário do parceiro: quem entra e quem sai hoje e as reservas novas desde o resumo
// anterior, todas vendidas pela Movepark. Sai às 6h de Brasília (pg_cron, com segunda passada às
// 6h30 para quem falhou) e só para empresa com movimento. Vai para a equipe com bookings:read
// (`partner_digest_recipients`); sem equipe, para o contato da empresa. Empresa silenciosa
// (`hub_relationship = silent`) não recebe. Uma vez por empresa por dia (`partner_digest_log`).
// Chave geral: app_setting.partner_daily_digest_enabled. Ver docs/specs/resumo-diario-parceiro.md.
//
// POST /functions/v1/partner-daily-digest   (header: x-partner-digest-key: <chave>)
// body opcional: { day?: "YYYY-MM-DD", company_id?: uuid, dry_run?: boolean }
// → { ok, day, companies: [{ company, entradas, saidas, novas, sent, recipients, skipped? }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DigestItem, getEmailConfig, sendPartnerEmail, tplPartnerDailyDigest } from "../_shared/email.ts";
import { partnerContact } from "../_shared/debt-email.ts";
import { digestCounts, digestDay, type DigestRow, parseDigestBody, pickRecipients } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: expected } = await admin.rpc("partner_digest_expected_key");
  if (!expected || req.headers.get("x-partner-digest-key") !== expected) return json({ error: "unauthorized" }, 401);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = parseDigestBody(body);
  const day = input.day ?? digestDay(Date.now());

  const { data: chave } = await admin.from("app_setting").select("value").eq("key", "partner_daily_digest_enabled")
    .maybeSingle();
  if (!input.dryRun && String(chave?.value ?? "false") !== "true") {
    return json({ ok: true, day, disabled: true, companies: [] });
  }

  const { data, error } = await admin.rpc("partner_daily_digest", { p_day: day });
  if (error) return json({ error: error.message }, 500);
  const rows = ((data ?? []) as DigestRow[]).filter((r) => !input.companyId || r.company_id === input.companyId);

  const { from } = await getEmailConfig(admin);
  const resultado: Record<string, unknown>[] = [];

  for (const r of rows) {
    const n = digestCounts(r);
    const resumo: Record<string, unknown> = {
      company: r.company_name,
      entradas: n.entradas,
      saidas: n.saidas,
      novas: n.novas,
      sent: false,
      recipients: 0,
    };
    resultado.push(resumo);
    if (n.total === 0) continue;
    // Uma empresa com problema não pode impedir o resumo das outras.
    try {
      const { data: membros } = await admin.rpc("partner_digest_recipients", { p_company_id: r.company_id });
      const contato = (membros ?? []).length === 0 ? await partnerContact(admin, r.company_id) : null;
      const para = pickRecipients(membros as string[] | null, contato?.to ?? null);
      resumo.recipients = para.length;
      if (input.dryRun) continue;
      if (para.length === 0 || !from) {
        resumo.skipped = para.length === 0 ? "sem destinatário" : "sem remetente";
        continue;
      }

      // Uma vez por empresa por dia: quem chega primeiro grava a linha; a segunda passada pula.
      const { error: claimErr } = await admin
        .from("partner_digest_log")
        .insert({ company_id: r.company_id, digest_date: day, entradas: n.entradas, saidas: n.saidas, novas: n.novas });
      if (claimErr) {
        resumo.skipped = claimErr.code === "23505" ? "já enviado hoje" : claimErr.message;
        continue;
      }

      const mail = tplPartnerDailyDigest({
        companyName: r.company_name,
        dayIso: day,
        entradas: (r.entradas ?? []) as DigestItem[],
        saidas: (r.saidas ?? []) as DigestItem[],
        novas: (r.novas ?? []) as DigestItem[],
      });
      const envio = await sendPartnerEmail(admin, {
        companyId: r.company_id,
        from,
        to: para,
        subject: mail.subject,
        html: mail.html,
      });
      if (envio.ok || envio.silenced) {
        await admin
          .from("partner_digest_log")
          .update({ sent_at: envio.ok ? new Date().toISOString() : null, recipients: envio.ok ? para.length : 0 })
          .eq("company_id", r.company_id)
          .eq("digest_date", day);
        resumo.sent = envio.ok;
        if (envio.silenced) resumo.skipped = "empresa silenciosa";
      } else {
        // Falhou o envio: solta a linha para a passada das 6h30 tentar de novo.
        await admin.from("partner_digest_log").delete().eq("company_id", r.company_id).eq("digest_date", day);
        console.error("[partner-daily-digest] envio falhou:", r.company_name, envio.error);
        resumo.skipped = "envio falhou";
      }
    } catch (e) {
      console.error("[partner-daily-digest] falha na empresa:", r.company_name, e);
      await admin.from("partner_digest_log").delete().eq("company_id", r.company_id).eq("digest_date", day).is(
        "sent_at",
        null,
      );
      resumo.skipped = "erro";
    }
  }

  return json({ ok: true, day, companies: resultado });
});
