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
import { encodeBase64 } from "jsr:@std/encoding/base64";

/**
 * Codifica o HTML como base64 quebrado em linhas de 76 chars (RFC 2045). Usamos base64 de
 * propósito, no lugar do quoted-printable padrão do denomailer: em QP, uma URL longa (magic link)
 * é quebrada a cada 76 chars com "=\r\n"; quando a quebra cai logo depois de um ponto, a linha
 * seguinte começa com "." e o dot-stuffing do SMTP remove esse ponto inicial, corrompendo o
 * domínio do link (ex.: "...qiofcf.supabase.co" vira "...qiofcfsupabase.co" e dá NXDOMAIN). O
 * alfabeto base64 não tem ".", então nenhuma linha começa com ponto e o link chega íntegro.
 */
export function htmlToBase64(html: string): string {
  const b64 = encodeBase64(new TextEncoder().encode(html));
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

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
    // HTML enviado como base64 (não quoted-printable) — ver htmlToBase64: evita que o
    // dot-stuffing do SMTP coma o ponto do domínio em links longos (magic link → NXDOMAIN).
    await client.send({
      from,
      to: Array.isArray(to) ? to : [to],
      replyTo,
      subject,
      mimeContent: [
        {
          mimeType: 'text/plain; charset="utf-8"',
          content: "Este e-mail requer um cliente compatível com HTML.",
          transferEncoding: "quoted-printable",
        },
        {
          mimeType: 'text/html; charset="utf-8"',
          content: htmlToBase64(html),
          transferEncoding: "base64",
        },
      ],
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

const FONT = "'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

/**
 * Casco do e-mail. Layout table-based (robusto em Gmail/Apple/Outlook), CSS inline,
 * mobile-first. O logo é a marca REAL como PNG hospedado (SVG não renderiza no Gmail),
 * servido pelo site em `${siteUrl()}/brand/...`. `preheader` controla o texto de preview
 * na caixa de entrada (cai no título se não vier).
 */
function shell(title: string, bodyHtml: string, preheader?: string): string {
  const logo = `${siteUrl()}/brand/logo-movepark-email.png`;
  const symbol = `${siteUrl()}/brand/simbolo-movepark-email.png`;
  const pre = (preheader ?? title).replace(/\s+/g, " ").trim();
  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;width:100%;background:#EEF0F4;-webkit-text-size-adjust:100%;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF0F4;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:2px 6px 20px;">
<img src="${logo}" width="150" height="23" alt="Movepark" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:150px;max-width:150px;">
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #E6E7EC;border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34%" height="4" style="height:4px;background:${BRAND.red};font-size:0;line-height:4px;">&nbsp;</td>
<td width="33%" height="4" style="height:4px;background:#A6DBDF;font-size:0;line-height:4px;">&nbsp;</td>
<td width="33%" height="4" style="height:4px;background:${BRAND.violet};font-size:0;line-height:4px;">&nbsp;</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding:34px 34px 32px;font-family:${FONT};font-size:16px;line-height:1.65;color:#45434F;">
<h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.navy};">${title}</h1>
${bodyHtml}
</td>
</tr></table>
</td></tr>
<tr><td style="padding:26px 24px 8px;text-align:center;">
<img src="${symbol}" width="22" height="22" alt="" style="display:inline-block;border:0;width:22px;height:22px;">
<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#8A8A96;">
Movepark Hub, a plataforma que conecta estacionamentos a clientes.<br>
<a href="${siteUrl()}" style="color:#8A8A96;text-decoration:underline;">hub.movepark.co</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  // Remove newline + indentação estrutural do template. O denomailer codifica o e-mail
  // em quoted-printable; a indentação entre as tags virava um "=20" (espaço codificado)
  // que aparecia solto no corpo. Removemos só o whitespace que contém quebra de linha;
  // espaços inline entre tags (ex: dentro do rodapé) são preservados.
  return html.replace(/\n\s*/g, "").trim();
}

function button(href: string, label: string): string {
  // Inline-block <a>: centraliza via text-align do <p> e é válido dentro de <p>. Render
  // ótimo em Gmail/Apple; no Outlook aparece como retângulo violeta com o texto (aceitável).
  return `<a href="${href}" style="display:inline-block;background:${BRAND.violet};color:#ffffff;text-decoration:none;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;padding:14px 26px;border-radius:8px;">${label}</a>`;
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
