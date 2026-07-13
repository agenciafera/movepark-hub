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
import { formatBRDateTime, formatBRL, type VoucherBooking } from "./voucher/fields.ts";

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
  violetActive: "#4041A3", // hero (fundo do topo)
  violetSoft: "#C5C4F6",
  red: "#DA455E", // accent da marca (logo)
  redDark: "#AE374B",
  cyan: "#A6DBDF", // terceira cor da régua de marca
  navy: "#29263F", // ink / header / rodapé legal
  body: "#424242", // texto de corpo
  muted: "#6A6A6A",
  footMuted: "#818FAF", // texto sobre o rodapé navy
  surface: "#F7F7F8",
  hairline: "#E0E0E0",
  pageBg: "#EDEDEF", // fundo da página (fora do card)
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

const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Links institucionais do rodapé (rotas reais do site).
function helpUrl(): string {
  return `${siteUrl()}/contato`;
}
function privacyUrl(): string {
  return `${siteUrl()}/privacidade`;
}
function termsUrl(): string {
  return `${siteUrl()}/termos`;
}

// Redes sociais do rodapé. URLs reais da marca (atualizar aqui se mudarem).
const SOCIAL: { name: string; url: string; alt: string }[] = [
  { name: "instagram", url: "https://www.instagram.com/moveparkestacionamento", alt: "Instagram" },
  { name: "linkedin", url: "https://www.linkedin.com/company/movepark", alt: "LinkedIn" },
  { name: "whatsapp", url: "https://wa.me/5511994752952", alt: "WhatsApp" },
];

// Identificação legal no rodapé (endereço/razão social confirmados pelo time).
const LEGAL_NAME = "Movepark Tecnologia Ltda.";
const LEGAL_ADDRESS = "Rua Tito, 479, 1º andar &middot; São Paulo, SP &middot; 05051-000 &middot; Brasil";

/**
 * Casco do e-mail. Layout table-based (robusto em Gmail/Apple/Outlook), CSS inline.
 * Estrutura (identidade Movepark): hero colorido com símbolo branco + título → corpo →
 * régua de marca (4 cores) → banda de ajuda com wordmark e redes sociais → rodapé legal navy.
 * Todos os logos/ícones são PNG hospedados (SVG não renderiza no Gmail), servidos pelo site
 * em `${siteUrl()}/brand/...`. `preheader` controla o texto de preview na caixa de entrada;
 * `heroBg` permite variar a cor do topo (default = índigo da marca).
 */
function shell(
  title: string,
  bodyHtml: string,
  opts?: { preheader?: string; heroBg?: string },
): string {
  const symbolWhite = `${siteUrl()}/brand/simbolo-movepark-white-email.png`;
  const wordmark = `${siteUrl()}/brand/logo-movepark-email.png`;
  const heroBg = opts?.heroBg ?? BRAND.violetActive;
  const pre = (opts?.preheader ?? title).replace(/\s+/g, " ").trim();

  // Redes sociais como PNG hospedado (SVG some no Gmail). Uma célula por ícone.
  const social = SOCIAL.map(
    (s, i) =>
      `<td style="padding-right:${i < SOCIAL.length - 1 ? "20px" : "0"};"><a href="${s.url}" target="_blank" style="text-decoration:none;"><img src="${siteUrl()}/brand/social-${s.name}-email.png" width="22" height="22" alt="${s.alt}" style="display:block;border:0;outline:none;width:22px;height:22px;"></a></td>`,
  ).join("");

  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${title}</title>
<!--[if mso]><style>*{font-family:Arial,sans-serif!important;}</style><![endif]-->
<style>
  a{color:${BRAND.violetActive};}
  .mp-help-link{color:${BRAND.violetActive}!important;text-decoration:underline;}
  .mp-foot-link{color:#ffffff!important;text-decoration:none;}
  @media only screen and (max-width:480px){
    .mp-pad{padding-left:24px!important;padding-right:24px!important;}
    .mp-hero{padding-left:24px!important;padding-right:24px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${BRAND.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">

<tr><td class="mp-hero" style="padding:40px 40px 56px;background:${heroBg};font-family:${FONT};">
<img src="${symbolWhite}" width="50" height="32" alt="Movepark" style="display:block;border:0;outline:none;height:32px;width:auto;margin:0 0 40px;">
<h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-0.6px;color:#ffffff;">${title}</h1>
</td></tr>

<tr><td class="mp-pad" style="padding:44px 40px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BRAND.body};">
${bodyHtml}
</td></tr>

<tr><td style="font-size:0;line-height:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40%" height="6" style="height:6px;background:${BRAND.navy};font-size:0;line-height:6px;">&nbsp;</td>
<td width="27%" height="6" style="height:6px;background:${BRAND.violet};font-size:0;line-height:6px;">&nbsp;</td>
<td width="18%" height="6" style="height:6px;background:${BRAND.red};font-size:0;line-height:6px;">&nbsp;</td>
<td width="15%" height="6" style="height:6px;background:${BRAND.cyan};font-size:0;line-height:6px;">&nbsp;</td>
</tr></table>
</td></tr>

<tr><td class="mp-pad" style="padding:40px;background:${BRAND.surface};font-family:${FONT};">
<img src="${wordmark}" width="135" height="20" alt="Movepark" style="display:block;border:0;outline:none;height:20px;width:auto;margin:0 0 24px;">
<h3 style="margin:0 0 14px;font-family:${FONT};font-size:18px;line-height:1.25;font-weight:600;color:${BRAND.navy};">Ficou com alguma dúvida?</h3>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.body};">Acesse a <a href="${helpUrl()}" class="mp-help-link">Central de Ajuda</a>, disponível no app ou no nosso site.</p>
<p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:${BRAND.muted};">Esta é uma mensagem automática. Não responda este e-mail: não conseguimos dar sequência ao atendimento por aqui.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${social}</tr></table>
</td></tr>

<tr><td class="mp-pad" style="padding:36px 40px 44px;background:${BRAND.navy};font-family:${FONT};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:28px;"><a href="${helpUrl()}" class="mp-foot-link" style="font-size:13px;font-weight:500;color:#ffffff;text-decoration:none;">Central de Ajuda</a></td>
<td style="padding-right:28px;"><a href="${privacyUrl()}" class="mp-foot-link" style="font-size:13px;font-weight:500;color:#ffffff;text-decoration:none;">Privacidade</a></td>
<td><a href="${termsUrl()}" class="mp-foot-link" style="font-size:13px;font-weight:500;color:#ffffff;text-decoration:none;">Termos de Uso</a></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid rgba(255,255,255,0.14);padding-top:22px;">
<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.footMuted};">&copy; 2026 ${LEGAL_NAME}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.footMuted};">${LEGAL_ADDRESS}</p>
</td></tr></table>
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
  return `<a href="${href}" style="display:inline-block;background:${BRAND.violet};color:#ffffff;text-decoration:none;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;padding:15px 30px;border-radius:8px;">${label}</a>`;
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

/** WhatsApp de suporte (o mesmo do rodapé), para a mensagem de confirmação. */
const SUPPORT_WHATSAPP = { href: "https://wa.me/5511994752952", label: "(11) 99475-2952" };

/** Linha de tabela com borda (resumo da reserva). `strong` destaca o Total. */
function bordRow(label: string, value: string, strong = false): string {
  const size = strong ? "15px" : "14px";
  const valColor = strong ? BRAND.navy : BRAND.body;
  const valWeight = strong ? "700" : "400";
  return `<tr>
    <td style="border:1px solid ${BRAND.hairline};padding:12px 16px;font-family:${FONT};font-size:${size};font-weight:600;color:${BRAND.navy};width:42%;">${escapeHtml(label)}</td>
    <td style="border:1px solid ${BRAND.hairline};padding:12px 16px;font-family:${FONT};font-size:${size};font-weight:${valWeight};color:${valColor};">${value}</td>
  </tr>`;
}

/** Item de checklist (check violeta + texto). Table-based para render no Gmail/Outlook. */
function checkItem(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>
    <td width="24" valign="top" style="font-family:${FONT};font-size:16px;font-weight:700;line-height:1.5;color:${BRAND.violet};">&#10003;</td>
    <td style="font-family:${FONT};font-size:15px;line-height:1.55;color:${BRAND.body};">${html}</td>
  </tr></table>`;
}

/** Dia e mês por extenso em pt-BR (ex.: "25 de fevereiro"), fuso de São Paulo. */
function formatBRDayMonth(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

/**
 * Confirmação de reserva (cliente). Enviado quando o pagamento confirma a reserva.
 * Reaproveita a montagem de dados do voucher (`VoucherBooking`) e linka o cliente
 * para a própria reserva, onde o voucher fica disponível para download.
 */
export function tplBookingConfirmation(
  b: VoucherBooking,
  customerName: string | null,
  bookingUrl: string,
): { subject: string; html: string } {
  const fn = String(customerName ?? "").trim().split(/\s+/)[0];
  const greeting = fn ? `Tudo certo, ${escapeHtml(fn)}!` : "Tudo certo!";

  const rows: [string, string][] = [
    ["Reserva", escapeHtml(`#${b.code}`)],
    ["Estacionamento", escapeHtml(b.company_name)],
    ["Unidade", escapeHtml(b.location_name)],
    ["Tipo de vaga", escapeHtml(b.parking_type_name ?? "Vaga")],
    ["Check-in", escapeHtml(formatBRDateTime(b.check_in_at))],
    ["Check-out", escapeHtml(formatBRDateTime(b.check_out_at))],
  ];
  if (b.vehicle) {
    const v = b.vehicle.model
      ? `${b.vehicle.license_plate} · ${b.vehicle.model}`
      : b.vehicle.license_plate;
    rows.push(["Veículo", escapeHtml(v)]);
  }
  const summary = rows.map(([l, v]) => bordRow(l, v)).join("") +
    bordRow("Total", formatBRL(b.total_amount, b.currency ?? "BRL"), true);

  return {
    subject: `Sua reserva ${b.code} está confirmada`,
    html: shell(
      "Sua reserva está confirmada",
      `
      <p style="margin:0 0 24px;">${greeting} Sua reserva foi confirmada. Aqui está o resumo.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 32px;">${summary}</table>
      ${checkItem(`O <strong style="color:${BRAND.navy};">${escapeHtml(b.location_name)}</strong> espera você em <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDayMonth(b.check_in_at))}</strong>.`)}
      ${checkItem(`Precisa de ajuda? Fale com a gente no WhatsApp <a href="${SUPPORT_WHATSAPP.href}" class="mp-help-link">${SUPPORT_WHATSAPP.label}</a>.`)}
      ${checkItem(`O voucher fica na sua reserva, pronto para baixar quando quiser.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Reserva ${b.code} confirmada no ${b.location_name}` },
    ),
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
