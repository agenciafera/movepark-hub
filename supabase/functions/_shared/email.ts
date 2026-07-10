// E-mail via SMTP (AWS SES SMTP) + templates do onboarding de parceiros.
// Conectividade confirmada: portas 587/465/2587 abrem da Edge; a 25 é bloqueada.
// Usamos 465 (TLS implícito) por padrão, mais robusto que STARTTLS.
// Credenciais (Edge Function Secrets, sensíveis):
//   SES_SMTP_HOST: ex email-smtp.sa-east-1.amazonaws.com
//   SES_SMTP_PORT: 465 (TLS) recomendado; 587/2587 (STARTTLS) também funcionam
//   SES_SMTP_USER / SES_SMTP_PASS: credenciais SMTP do SES
//   PUBLIC_SITE_URL: base de URLs nos links dos e-mails
// Remetente/caixa interna vêm do banco (app_setting, editável no Manager).

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// @ts-expect-error - Deno env
const env = (k: string) => Deno.env.get(k);

// Paleta da marca (espelha src/index.css / DESIGN.md). Tese do design: o violeta
// (primary) só aparece em elemento acionável (CTA); o vermelho é accent (o "park"
// do logo); navy é o ink/header. Não trocar violeta por vermelho nos botões.
const BRAND = {
  violet: "#5D5FEF", // primary / CTA
  violetActive: "#4041A3",
  violetSoft: "#C5C4F6",
  red: "#DA455E", // accent da marca (logo)
  navy: "#29263F", // ink / header
  muted: "#6A6A6A",
  surface: "#F7F7F8",
  hairline: "#E0E0E0",
};

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

/** Envia um e-mail via SMTP. Nunca lança; retorna {ok}. */
export async function sendEmail({ from, to, subject, html, replyTo }: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const hostname = env("SES_SMTP_HOST");
  const port = Number(env("SES_SMTP_PORT") ?? "465");
  const username = env("SES_SMTP_USER");
  const password = env("SES_SMTP_PASS");
  if (!hostname || !username || !password || !from) {
    console.warn("[smtp] credenciais/remetente ausentes; e-mail não enviado:", subject);
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
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:${BRAND.surface};font-family:Roboto,Arial,sans-serif;color:${BRAND.navy}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:${BRAND.navy};border-radius:14px 14px 0 0;padding:22px 28px">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.01em;color:#fff">Move<span style="color:${BRAND.red}">park</span> <span style="font-weight:600;color:${BRAND.violetSoft}">Hub</span></div>
    </div>
    <div style="background:#fff;border:1px solid ${BRAND.hairline};border-top:none;border-radius:0 0 14px 14px;padding:28px">
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;color:${BRAND.navy}">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:${BRAND.muted};font-size:12px;margin-top:20px;text-align:center">Movepark Hub, a plataforma que conecta estacionamentos a clientes.</p>
  </div></body></html>`;
  // Remove newline + indentação estrutural do template. O denomailer codifica o
  // e-mail em quoted-printable; a indentação entre as tags virava um "=20" (espaço
  // codificado) que aparecia solto no corpo do e-mail. Removemos só o whitespace
  // que contém quebra de linha (estrutural); espaços inline entre tags, como o do
  // logo "Movepark Hub", são preservados.
  return html.replace(/\n\s*/g, "").trim();
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.violet};color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;margin:8px 0">${label}</a>`;
}

export function tplLeadReceived(contactName: string): { subject: string; html: string } {
  return {
    subject: "Recebemos o cadastro do seu estacionamento",
    html: shell("Cadastro recebido. Agora é com a gente.", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(contactName))}. Seu cadastro chegou certinho aqui.</p>
      <p style="margin:0 0 14px">Nossa equipe já vai analisar as informações e te chama no WhatsApp em até <strong>2 dias úteis</strong> para validar tudo e liberar a próxima etapa.</p>
      <p style="margin:0">Enquanto isso, você não precisa fazer nada. A gente cuida do próximo passo.</p>`),
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
        ${row("Cidade/UF", [lead.city, lead.state].filter(Boolean).join(" / ") || "não informado")}
        ${row("Vagas (est.)", lead.estimatedSpots != null ? String(lead.estimatedSpots) : "não informado")}
        ${row("Canal", lead.utmSource ?? "não informado")}
      </table>
      <p style="margin-top:16px">${button(`${siteUrl()}/manager/partners`, "Abrir no Manager")}</p>`),
  };
}

export function tplApprovalInvite(contactName: string, actionLink: string): { subject: string; html: string } {
  return {
    subject: "Seu cadastro foi aprovado. Continue de onde parou.",
    html: shell("Cadastro aprovado", `
      <p>Olá, ${escapeHtml(firstName(contactName))}!</p>
      <p>Boa notícia: aprovamos seu estacionamento na Movepark. Agora é só concluir a configuração (localização, tipos de vaga e preços) para publicar e começar a receber reservas.</p>
      <p>${button(actionLink, "Continuar meu cadastro")}</p>
      <p style="color:${BRAND.muted};font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>`),
  };
}

export function tplTeamInvite(
  companyName: string,
  roleLabel: string,
  actionLink: string,
): { subject: string; html: string } {
  return {
    subject: `Você foi convidado para a equipe de ${companyName} na Movepark`,
    html: shell("Convite para a equipe", `
      <p>Olá!</p>
      <p>Você foi convidado para acessar o painel de <strong>${escapeHtml(companyName)}</strong> na Movepark, com o papel de <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p>Clique no botão abaixo para definir seu acesso e entrar.</p>
      <p>${button(actionLink, "Aceitar convite")}</p>
      <p style="color:${BRAND.muted};font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>`),
  };
}

export function tplRejection(contactName: string, reason?: string | null): { subject: string; html: string } {
  return {
    subject: "Sobre seu cadastro na Movepark",
    html: shell("Sobre seu cadastro", `
      <p>Olá, ${escapeHtml(firstName(contactName))}.</p>
      <p>Agradecemos o interesse em fazer parte da Movepark. Após análise, não seguiremos com o cadastro neste momento.</p>
      ${reason ? `<p style="color:${BRAND.muted}"><strong>Observação:</strong> ${escapeHtml(reason)}</p>` : ""}
      <p>Você pode se cadastrar novamente no futuro. Ficamos à disposição.</p>`),
  };
}

export function tplWentLive(contactName: string): { subject: string; html: string } {
  return {
    subject: "Seu estacionamento está no ar",
    html: shell("Tudo pronto. Você está no ar.", `
      <p>Olá, ${escapeHtml(firstName(contactName))}!</p>
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
  // avaliação com aquela nota pré-selecionada (?rating=N), menos fricção.
  const sep = reviewLink.includes("?") ? "&" : "?";
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${reviewLink}${sep}rating=${n}" style="text-decoration:none;font-size:32px;color:${BRAND.navy};margin:0 3px" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</a>`,
    )
    .join("");
  return {
    subject: `Como foi seu estacionamento em ${locationName}?`,
    html: shell("Como foi a sua visita?", `
      <p>Olá, ${escapeHtml(firstName(contactName))}!</p>
      <p>Você usou o <strong>${escapeHtml(locationName)}</strong> pela Movepark. Sua avaliação ajuda outros motoristas a escolher e leva menos de 1 minuto.</p>
      <p style="margin:8px 0 4px">Toque numa estrela para avaliar:</p>
      <div style="text-align:center;margin:4px 0 12px">${stars}</div>
      <p style="text-align:center">${button(reviewLink, "Avaliar meu estacionamento")}</p>
      <p style="color:${BRAND.muted};font-size:13px">Se as estrelas não funcionarem, copie e cole este link no navegador:<br>${reviewLink}</p>`),
  };
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:${BRAND.muted};width:120px">${label}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

/** Primeiro nome (mais caloroso que o nome completo na saudação). */
function firstName(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "parceiro";
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
