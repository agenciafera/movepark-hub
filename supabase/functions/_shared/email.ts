// E-mail via SMTP (AWS SES SMTP) + templates do onboarding de parceiros.
// Conectividade confirmada: portas 587/465/2587 abrem da Edge; a 25 é bloqueada.
// Usamos 465 (TLS implícito) por padrão — mais robusto que STARTTLS.
// Credenciais (Edge Function Secrets — sensíveis):
//   SES_SMTP_HOST  — ex: email-smtp.sa-east-1.amazonaws.com
//   SES_SMTP_PORT  — 465 (TLS) recomendado; 587/2587 (STARTTLS) também funcionam
//   SES_SMTP_USER / SES_SMTP_PASS — credenciais SMTP do SES
//   PUBLIC_SITE_URL — base de URLs nos links dos e-mails
// Remetente/caixa interna vêm do banco (app_setting, editável no Manager).

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// @ts-expect-error - Deno env
const env = (k: string) => Deno.env.get(k);

const BRAND = { red: "#DA455E", navy: "#29263F", muted: "#6B7280" };

export function siteUrl(): string {
  return (env("PUBLIC_SITE_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
}

// deno-lint-ignore no-explicit-any
export async function getEmailConfig(admin: any): Promise<{ from: string | null; inbox: string | null }> {
  const { data } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", ["partner_email_from", "partner_leads_inbox"]);
  // deno-lint-ignore no-explicit-any
  const map: Record<string, string> = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    from: (map.partner_email_from || "").trim() || null,
    inbox: (map.partner_leads_inbox || "").trim() || null,
  };
}

interface SendArgs {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/** Envia um e-mail via SMTP. Nunca lança — retorna {ok}. */
export async function sendEmail({ from, to, subject, html, replyTo }: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const hostname = env("SES_SMTP_HOST");
  const port = Number(env("SES_SMTP_PORT") ?? "465");
  const username = env("SES_SMTP_USER");
  const password = env("SES_SMTP_PASS");
  if (!hostname || !username || !password || !from) {
    console.warn("[smtp] credenciais/remetente ausentes — e-mail não enviado:", subject);
    return { ok: false, error: "SMTP não configurado" };
  }

  const implicitTls = port === 465 || port === 2465;
  const client = new SMTPClient({
    connection: {
      hostname,
      port,
      tls: implicitTls, // 465 = TLS implícito; 587/2587 = STARTTLS (tls:false)
      auth: { username, password },
    },
  });

  try {
    await client.send({
      from,
      to: Array.isArray(to) ? to : [to],
      replyTo,
      subject,
      content: "Este e-mail requer um cliente compatível com HTML.",
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[smtp] erro:", e);
    return { ok: false, error: String(e) };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

// ───────────────────────────────────────── templates ─────────────────────────────────────────

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f7f7;font-family:Roboto,Arial,sans-serif;color:${BRAND.navy}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:20px;font-weight:800;color:${BRAND.navy};margin-bottom:24px">Move<span style="color:${BRAND.red}">park</span> Hub</div>
    <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:${BRAND.muted};font-size:12px;margin-top:24px">Movepark Hub — a plataforma que conecta estacionamentos a clientes.</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.red};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;margin:8px 0">${label}</a>`;
}

export function tplLeadReceived(contactName: string): { subject: string; html: string } {
  return {
    subject: "Recebemos seu cadastro 🎉",
    html: shell("Recebemos seu cadastro!", `
      <p>Olá, ${escapeHtml(contactName)}!</p>
      <p>Obrigado pelo interesse em ter seu estacionamento na Movepark. Nossa equipe vai analisar as informações e <strong>entrar em contato em até 2 dias úteis</strong> para validar e liberar a próxima etapa do cadastro.</p>
      <p>Enquanto isso, não precisa fazer nada. 😉</p>`),
  };
}

export function tplLeadAlert(lead: {
  companyName: string; contactName: string; contactEmail: string; contactPhone: string;
  city?: string | null; state?: string | null; estimatedSpots?: number | null; utmSource?: string | null;
}): { subject: string; html: string } {
  return {
    subject: `Novo lead de parceiro: ${lead.companyName}`,
    html: shell("Novo lead de parceiro", `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Empresa", lead.companyName)}
        ${row("Responsável", lead.contactName)}
        ${row("E-mail", lead.contactEmail)}
        ${row("Telefone", lead.contactPhone)}
        ${row("Cidade/UF", [lead.city, lead.state].filter(Boolean).join(" / ") || "—")}
        ${row("Vagas (est.)", lead.estimatedSpots != null ? String(lead.estimatedSpots) : "—")}
        ${row("Canal", lead.utmSource ?? "—")}
      </table>
      <p style="margin-top:16px">${button(`${siteUrl()}/manager/partners`, "Abrir no Manager")}</p>`),
  };
}

export function tplApprovalInvite(contactName: string, actionLink: string): { subject: string; html: string } {
  return {
    subject: "Seu cadastro foi aprovado — continue o cadastro",
    html: shell("Cadastro aprovado! 🚗", `
      <p>Olá, ${escapeHtml(contactName)}!</p>
      <p>Boa notícia: aprovamos seu estacionamento na Movepark. Agora é só concluir a configuração — localização, tipos de vaga e preços — para publicar e começar a receber reservas.</p>
      <p>${button(actionLink, "Continuar meu cadastro")}</p>
      <p style="color:${BRAND.muted};font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>`),
  };
}

export function tplRejection(contactName: string, reason?: string | null): { subject: string; html: string } {
  return {
    subject: "Sobre seu cadastro na Movepark",
    html: shell("Sobre seu cadastro", `
      <p>Olá, ${escapeHtml(contactName)}.</p>
      <p>Agradecemos o interesse em fazer parte da Movepark. Após análise, não seguiremos com o cadastro neste momento.</p>
      ${reason ? `<p style="color:${BRAND.muted}"><strong>Observação:</strong> ${escapeHtml(reason)}</p>` : ""}
      <p>Você pode se cadastrar novamente no futuro. Ficamos à disposição.</p>`),
  };
}

export function tplWentLive(contactName: string): { subject: string; html: string } {
  return {
    subject: "Seu estacionamento está no ar! 🚗",
    html: shell("Tudo pronto — você está no ar!", `
      <p>Olá, ${escapeHtml(contactName)}!</p>
      <p>Seu estacionamento já aparece na busca da Movepark e está pronto para receber reservas.</p>
      <p>${button(`${siteUrl()}/operator`, "Acessar meu painel")}</p>`),
  };
}

export function tplReviewRequest(
  contactName: string,
  locationName: string,
  reviewLink: string,
): { subject: string; html: string } {
  // Estrelas clicáveis: cada uma é um deep link de 1 clique que já abre a
  // avaliação com aquela nota pré-selecionada (?rating=N) — menos fricção.
  const sep = reviewLink.includes("?") ? "&" : "?";
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${reviewLink}${sep}rating=${n}" style="text-decoration:none;font-size:32px;color:${BRAND.navy};margin:0 3px" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</a>`,
    )
    .join("");
  return {
    subject: `Como foi seu estacionamento em ${locationName}?`,
    html: shell("Conta pra gente como foi? ⭐", `
      <p>Olá, ${escapeHtml(contactName)}!</p>
      <p>Você usou o <strong>${escapeHtml(locationName)}</strong> pela Movepark. Sua avaliação ajuda outros motoristas a escolherem com confiança — leva menos de 1 minuto.</p>
      <p style="margin:8px 0 4px">Toque numa estrela para avaliar:</p>
      <div style="text-align:center;margin:4px 0 12px">${stars}</div>
      <p style="text-align:center">${button(reviewLink, "Avaliar meu estacionamento")}</p>
      <p style="color:${BRAND.muted};font-size:13px">Se as estrelas não funcionarem, copie e cole este link no navegador:<br>${reviewLink}</p>`),
  };
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:${BRAND.muted};width:120px">${label}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
