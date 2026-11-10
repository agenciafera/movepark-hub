// Edge Function: /team-daily-digest (10/11/2026)
// Resumo diário da equipe Movepark: o dia anterior inteiro (0h às 24h de Brasília), com vendas do
// Hub e do white-label, dinheiro, clientes, o movimento de hoje e alertas. Os números vêm de
// `team_daily_digest(p_day)`, no banco; aqui só monta e manda. Sai às 7h de Brasília (pg_cron, com
// segunda passada às 7h30 se a primeira falhou), uma vez por dia (`team_digest_log`), para a lista
// `app_setting.team_daily_digest_recipients`. Chave geral: `team_daily_digest_enabled`.
// Ver docs/specs/resumo-diario-equipe.md.
//
// POST /functions/v1/team-daily-digest   (header: x-team-digest-key: <chave>)
// body opcional: { day?: "YYYY-MM-DD", dry_run?: boolean }
// → { ok, day, sent, recipients, skipped? }  (dry_run devolve também subject e html, sem mandar)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sendEmail, type TeamDigest, tplTeamDailyDigest } from "../_shared/email.ts";
import { parseTeamDigestBody, parseTeamRecipients, teamDigestDay } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: expected } = await admin.rpc("team_digest_expected_key");
  if (!expected || req.headers.get("x-team-digest-key") !== expected) return json({ error: "unauthorized" }, 401);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = parseTeamDigestBody(body);
  const day = input.day ?? teamDigestDay(Date.now());

  const { data: cfg } = await admin.from("app_setting").select("key, value")
    .in("key", ["team_daily_digest_enabled", "team_daily_digest_recipients"]);
  const map = Object.fromEntries(((cfg ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  if (!input.dryRun && String(map.team_daily_digest_enabled ?? "false") !== "true") {
    return json({ ok: true, day, disabled: true, sent: false });
  }
  const para = parseTeamRecipients(map.team_daily_digest_recipients);

  const { data, error } = await admin.rpc("team_daily_digest", { p_day: day });
  if (error || !data) return json({ error: error?.message ?? "resumo vazio" }, 500);
  const mail = tplTeamDailyDigest(data as TeamDigest);
  if (input.dryRun) return json({ ok: true, day, dry_run: true, recipients: para.length, subject: mail.subject, html: mail.html });

  const { from } = await getEmailConfig(admin);
  if (para.length === 0 || !from) {
    return json({ ok: true, day, sent: false, skipped: para.length === 0 ? "sem destinatário" : "sem remetente" });
  }

  // Um por dia: quem chega primeiro grava a linha; a segunda passada pula.
  const { error: claimErr } = await admin.from("team_digest_log").insert({ digest_date: day });
  if (claimErr) {
    return json({ ok: true, day, sent: false, skipped: claimErr.code === "23505" ? "já enviado hoje" : claimErr.message });
  }

  let entregues = 0;
  let ultimoErro: string | undefined;
  for (const destino of para) {
    const envio = await sendEmail({ from, to: destino, subject: mail.subject, html: mail.html });
    if (envio.ok) entregues++;
    else ultimoErro = envio.error;
  }
  if (entregues > 0) {
    await admin.from("team_digest_log").update({ sent_at: new Date().toISOString(), recipients: entregues })
      .eq("digest_date", day);
    if (ultimoErro) console.error("[team-daily-digest] algum destinatário falhou:", ultimoErro);
    return json({ ok: true, day, sent: true, recipients: entregues });
  }
  // Ninguém recebeu: solta a linha para a passada das 7h30 tentar de novo.
  await admin.from("team_digest_log").delete().eq("digest_date", day);
  console.error("[team-daily-digest] envio falhou:", ultimoErro);
  return json({ ok: false, day, sent: false, skipped: "envio falhou", error: ultimoErro }, 502);
});
