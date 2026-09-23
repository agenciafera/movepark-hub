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
import { siteUrl } from "./site.ts";

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

/**
 * Reexportado de `./site.ts`, que é a fonte única do host.
 *
 * Antes daqui saía um fallback próprio, `http://localhost:5173`, e ele era pior do que
 * parece: sem `PUBLIC_SITE_URL` no projeto, TODO e-mail transacional sairia com link para o
 * localhost do servidor, morto para quem recebe. Um host errado o cliente reporta; um
 * localhost ninguém consegue nem abrir. Em dev, exporte `PUBLIC_SITE_URL=http://localhost:5173`.
 */
export { siteUrl };

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
    // HTML enviado como base64 (não quoted-printable), ver htmlToBase64: evita que o
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

/**
 * Envio para PARCEIRO, com a guarda de silêncio do E0.14.
 *
 * Empresa com `hub_relationship = 'silent'` não sabe que existe no Hub, e um único e-mail
 * automático derruba a estratégia inteira de forma irreversível. Por isso o filtro fica aqui,
 * na origem do envio, e não dentro de cada template: template novo nasce coberto.
 *
 * Falha fechada de propósito: se não der para ler a empresa, não manda. Deixar de enviar um
 * convite é recuperável; avisar o parceiro errado não é.
 *
 * Todo e-mail cujo destinatário é o parceiro (convite, aprovação, recusa, KYC, repasse) passa
 * por aqui. `sendEmail` cru continua valendo para cliente final e para caixa interna.
 */
export async function sendPartnerEmail(
  // deno-lint-ignore no-explicit-any
  admin: any,
  args: SendArgs & { companyId: string },
): Promise<{ ok: boolean; error?: string; silenced?: boolean }> {
  const { companyId, ...mail } = args;

  const { data, error } = await admin
    .from("company")
    .select("hub_relationship")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    console.error("[silence] não foi possível ler a empresa; e-mail não enviado:", error);
    return { ok: false, error: "Empresa não encontrada para a guarda de silêncio" };
  }
  if (data.hub_relationship === "silent") {
    console.warn("[silence] empresa silenciosa; e-mail bloqueado na origem:", mail.subject);
    return { ok: false, silenced: true, error: "Empresa silenciosa (hub_relationship = silent)" };
  }

  return sendEmail(mail);
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
// Sem Facebook: cada item vira <img> de /brand/social-<name>-email.png, e o ícone dele
// não existe. O site já mostra o Facebook (ver src/lib/redes.ts); aqui ele entra quando
// alguém desenhar o PNG no mesmo padrão dos outros três.
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

/**
 * Prova de vida (KYC) do recebedor. Leva ao painel de propósito, sem o link do gateway dentro:
 * esse link vale 20 minutos e chegaria morto em quase todo e-mail aberto fora da hora.
 */
export function tplKycLinkIssued(contactName: string): { subject: string; html: string } {
  return {
    subject: "Prova de vida pendente no seu cadastro",
    html: shell("Falta a prova de vida", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(contactName))}. Para liberar seus repasses, falta a verificação de identidade do responsável pela conta.</p>
      <p style="margin:0 0 14px">É rápido: entre no painel, aponte a câmera do celular e siga as instruções.</p>
      <p style="margin:0 0 22px;text-align:center">${button(`${siteUrl()}/operator`, "Fazer a verificação")}</p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">O link da verificação vale 20 minutos. Se o seu expirar, você gera outro no painel com um clique.</p>`),
  };
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

/**
 * Lead de interesse na Go2Park (produto irmão de rastreio de vans de transfer).
 * Vai para a caixa da Go2Park (app_setting go2park_leads_inbox). O replyTo do envio
 * aponta para o contato do estacionamento, então a Go2Park responde direto.
 */
export function tplGo2ParkInterest(lead: {
  companyName: string; contactName: string; contactEmail: string; contactPhone: string;
  city?: string | null; state?: string | null; estimatedSpots?: number | null;
}): { subject: string; html: string } {
  return {
    subject: `Interesse na Go2Park: ${lead.companyName}`,
    html: shell("Um estacionamento quer conhecer a Go2Park", `
      <p style="margin:0 0 16px">Este estacionamento demonstrou interesse na Go2Park pelo onboarding da Movepark. Vale entrar em contato para apresentar o rastreio de vans em tempo real.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Estacionamento", lead.companyName)}
        ${row("Responsável", lead.contactName)}
        ${row("E-mail", lead.contactEmail)}
        ${row("Telefone", lead.contactPhone)}
        ${row("Cidade/UF", [lead.city, lead.state].filter(Boolean).join(" / ") || "não informado")}
        ${row("Vagas (est.)", lead.estimatedSpots != null ? String(lead.estimatedSpots) : "não informado")}
      </table>`),
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

/** Data civil de Brasília (dd/mm/aaaa) para e-mail. */
function brDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function cents(v: number): string {
  return formatBRL(v / 100);
}

export interface WithdrawalMail {
  contactName: string;
  companyName: string;
  /** O que vai cair na conta (já sem a taxa). */
  amountCents: number;
  feeCents: number;
  /** Previsão de crédito (ISO), quando houver. */
  expectedAt: string | null;
  /** Quando caiu (ISO), no e-mail de confirmação. */
  paidAt?: string | null;
  /** Motivo do banco, no e-mail de falha. */
  failureReason?: string | null;
  /** Conta de destino, só os últimos dígitos. */
  accountTail?: string | null;
}

/** Saque pedido: em processamento, com a previsão de queda (E0.3.10). */
export function tplWithdrawalRequested(w: WithdrawalMail): { subject: string; html: string } {
  const previsao = w.expectedAt ? `A previsão da Pagar.me é cair até <strong>${brDate(w.expectedAt)}</strong>.` : "Assim que o banco confirmar, você recebe outro e-mail.";
  return {
    subject: `Saque de ${cents(w.amountCents)} a caminho da sua conta`,
    html: shell("Seu saque está a caminho", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(w.contactName))}. O saque de <strong>${escapeHtml(w.companyName)}</strong> saiu do saldo e está em processamento no banco.</p>
      <p style="margin:0 0 14px"><strong>${cents(w.amountCents)}</strong> vão cair na conta${w.accountTail ? ` final ${escapeHtml(w.accountTail)}` : ""}. A taxa de saque foi de ${cents(w.feeCents)}, descontada do valor pedido.</p>
      <p style="margin:0 0 22px">${previsao}</p>
      <p style="margin:0 0 22px;text-align:center">${button(`${siteUrl()}/operator/finance`, "Ver meus saques")}</p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">Saque pedido até as 15h em dia útil cai no mesmo dia; depois disso, no próximo dia útil.</p>`),
  };
}

/** A Pagar.me enviou a TED (status transferred, com comprovante). O crédito é do banco de destino. */
export function tplWithdrawalPaid(w: WithdrawalMail): { subject: string; html: string } {
  return {
    subject: `Transferência de ${cents(w.amountCents)} enviada ao seu banco`,
    html: shell("Transferência enviada", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(w.contactName))}. A Pagar.me enviou a TED de <strong>${cents(w.amountCents)}</strong> de <strong>${escapeHtml(w.companyName)}</strong> para a conta${w.accountTail ? ` final ${escapeHtml(w.accountTail)}` : ""}${w.paidAt ? ` em ${brDate(w.paidAt)}` : ""}. Em dia útil, o crédito costuma aparecer no seu banco em minutos.</p>
      <p style="margin:0 0 22px">Taxa de saque: ${cents(w.feeCents)}. O extrato completo está no seu painel.</p>
      <p style="margin:0;text-align:center">${button(`${siteUrl()}/operator/finance`, "Ver o extrato")}</p>`),
  };
}

/** O banco recusou ou o saque foi cancelado. O dinheiro volta ao saldo do recebedor. */
export function tplWithdrawalFailed(w: WithdrawalMail): { subject: string; html: string } {
  return {
    subject: `Seu saque de ${cents(w.amountCents)} não foi concluído`,
    html: shell("O saque não foi concluído", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(w.contactName))}. O saque de <strong>${cents(w.amountCents)}</strong> de <strong>${escapeHtml(w.companyName)}</strong> não chegou à conta.</p>
      <p style="margin:0 0 14px">${w.failureReason ? `Motivo informado pelo banco: <strong>${escapeHtml(w.failureReason)}</strong>.` : "O banco não informou o motivo."} O valor volta ao seu saldo e você pode pedir de novo pelo painel.</p>
      <p style="margin:0 0 22px;text-align:center">${button(`${siteUrl()}/operator/finance`, "Ver meus saques")}</p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">Se os dados bancários mudaram, atualize o cadastro antes de tentar de novo.</p>`),
  };
}

export interface DebtMail {
  contactName: string;
  companyName: string;
  bookingCode: string;
  /** O que esta cobrança acrescentou à dívida (líquido da taxa que o parceiro pagou). */
  debtCents: number;
  /** Dívida total da empresa depois desta. */
  totalDebtCents: number;
  reason: string | null;
}

/**
 * Estorno pago pela Movepark: o recebedor do parceiro não cobria, o cliente foi reembolsado pelo
 * master e a parte do parceiro vira abatimento nas próximas vendas. Nada a fazer da parte dele.
 */
export function tplPartnerDebtCreated(d: DebtMail): { subject: string; html: string } {
  return {
    subject: `Reserva ${d.bookingCode} cancelada: ${cents(d.debtCents)} serão abatidos das próximas vendas`,
    html: shell("Um estorno vai ser abatido", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(d.contactName))}. A reserva <strong>${escapeHtml(d.bookingCode)}</strong> de <strong>${escapeHtml(d.companyName)}</strong> foi cancelada${d.reason ? ` (${escapeHtml(d.reason)})` : ""} e a Movepark devolveu o valor ao cliente.</p>
      <p style="margin:0 0 14px">Como a sua parte dessa venda já tinha saído do saldo, <strong>${cents(d.debtCents)}</strong> ficam como abatimento: as próximas vendas cobrem esse valor antes de liberar saque. Você não precisa fazer nada.</p>
      <p style="margin:0 0 22px">Total a abater hoje: <strong>${cents(d.totalDebtCents)}</strong>.</p>
      <p style="margin:0 0 22px;text-align:center">${button(`${siteUrl()}/operator/finance`, "Ver o extrato")}</p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">O abatimento é líquido da taxa de processamento: você devolve só o que recebeu.</p>`),
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

/** Dados mínimos que os avisos de reserva precisam (subconjunto do voucher). */
export interface BookingNoticeData {
  code: string;
  location_name: string;
  location_address?: string | null;
  check_in_at: string;
  check_out_at: string;
  vehicle?: { license_plate: string; model: string | null } | null;
}

function primeiroNome(name: string | null): string {
  return String(name ?? "").trim().split(/\s+/)[0];
}

/** Lembrete de entrada (24h antes): onde, quando, com que carro, e o voucher. */
export function tplBookingReminderCheckin(b: BookingNoticeData, customerName: string | null, bookingUrl: string): { subject: string; html: string } {
  const fn = primeiroNome(customerName);
  return {
    subject: `Amanhã é o dia: reserva ${b.code} no ${b.location_name}`,
    html: shell(
      "Sua vaga está esperando",
      `
      <p style="margin:0 0 24px;">${fn ? `${escapeHtml(fn)}, ` : ""}sua entrada no <strong style="color:${BRAND.navy};">${escapeHtml(b.location_name)}</strong> é em <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDateTime(b.check_in_at))}</strong>.</p>
      ${b.location_address ? checkItem(`Endereço: ${escapeHtml(b.location_address)}.`) : ""}
      ${b.vehicle ? checkItem(`Veículo na reserva: <strong style="color:${BRAND.navy};">${escapeHtml(b.vehicle.license_plate)}</strong>. Mudou de carro? Troque na sua reserva antes de chegar.`) : ""}
      ${checkItem(`Na chegada, mostre o voucher. Ele está na sua reserva.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Entrada em ${formatBRDateTime(b.check_in_at)} no ${b.location_name}` },
    ),
  };
}

/** Lembrete de retirada (2h antes da saída): a hora combinada e o que fazer se atrasar. */
export function tplBookingReminderCheckout(b: BookingNoticeData, customerName: string | null, bookingUrl: string): { subject: string; html: string } {
  const fn = primeiroNome(customerName);
  return {
    subject: `Sua saída do ${b.location_name} é às ${formatBRDateTime(b.check_out_at).slice(-5)}`,
    html: shell(
      "Hora de buscar o carro",
      `
      <p style="margin:0 0 24px;">${fn ? `${escapeHtml(fn)}, ` : ""}a saída combinada da reserva <strong style="color:${BRAND.navy};">${escapeHtml(b.code)}</strong> no <strong style="color:${BRAND.navy};">${escapeHtml(b.location_name)}</strong> é em <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDateTime(b.check_out_at))}</strong>.</p>
      ${checkItem(`Vai atrasar? Fale com o estacionamento pelo telefone que está na sua reserva.`)}
      ${checkItem(`Tarifa Superflex com voo atrasado: estenda a saída em até 24h pela reserva, sem custo.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Saída em ${formatBRDateTime(b.check_out_at)}` },
    ),
  };
}

/** Datas alteradas: o novo período, e que o voucher já mudou junto. */
export function tplBookingDatesChanged(b: BookingNoticeData, customerName: string | null, bookingUrl: string): { subject: string; html: string } {
  const fn = primeiroNome(customerName);
  return {
    subject: `Reserva ${b.code}: novas datas confirmadas`,
    html: shell(
      "Datas atualizadas",
      `
      <p style="margin:0 0 24px;">${fn ? `${escapeHtml(fn)}, ` : ""}a reserva <strong style="color:${BRAND.navy};">${escapeHtml(b.code)}</strong> agora vale de <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDateTime(b.check_in_at))}</strong> a <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDateTime(b.check_out_at))}</strong>.</p>
      ${checkItem(`O voucher já está com as datas novas. Baixe de novo antes de ir.`)}
      ${checkItem(`O estacionamento ${escapeHtml(b.location_name)} recebe a atualização por aqui.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Novas datas da reserva ${b.code}` },
    ),
  };
}

/** Veículo trocado: a placa que vale no portão. */
export function tplBookingVehicleChanged(b: BookingNoticeData, customerName: string | null, bookingUrl: string): { subject: string; html: string } {
  const fn = primeiroNome(customerName);
  const v = b.vehicle ? (b.vehicle.model ? `${b.vehicle.license_plate} · ${b.vehicle.model}` : b.vehicle.license_plate) : "sem veículo";
  return {
    subject: `Reserva ${b.code}: veículo atualizado`,
    html: shell(
      "Veículo atualizado",
      `
      <p style="margin:0 0 24px;">${fn ? `${escapeHtml(fn)}, ` : ""}a reserva <strong style="color:${BRAND.navy};">${escapeHtml(b.code)}</strong> agora está no veículo <strong style="color:${BRAND.navy};">${escapeHtml(v)}</strong>.</p>
      ${checkItem(`É essa placa que vale no portão do ${escapeHtml(b.location_name)}. O voucher já mudou junto.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Veículo da reserva ${b.code}: ${v}` },
    ),
  };
}

/** Saída estendida pela proteção de voo (Superflex): a nova hora e que não custou nada. */
export function tplBookingExtended(b: BookingNoticeData, customerName: string | null, bookingUrl: string): { subject: string; html: string } {
  const fn = primeiroNome(customerName);
  return {
    subject: `Reserva ${b.code}: saída estendida até ${formatBRDateTime(b.check_out_at)}`,
    html: shell(
      "Saída estendida, sem custo",
      `
      <p style="margin:0 0 24px;">${fn ? `${escapeHtml(fn)}, ` : ""}pela proteção contra atraso de voo da Superflex, a saída da reserva <strong style="color:${BRAND.navy};">${escapeHtml(b.code)}</strong> passou para <strong style="color:${BRAND.navy};">${escapeHtml(formatBRDateTime(b.check_out_at))}</strong>.</p>
      ${checkItem(`Nada a pagar: a diária extra é por conta da Movepark.`)}
      ${checkItem(`O estacionamento ${escapeHtml(b.location_name)} já sabe da nova saída.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver minha reserva")}</p>`,
      { preheader: `Saída da reserva ${b.code} estendida` },
    ),
  };
}

export type CancellationRefund = "refunded" | "pending" | "manual" | "none";

/**
 * Cancelamento ao cliente (17/09/2026): confirma o cancelamento e diz, sem rodeio, o que acontece
 * com o dinheiro. O prazo do estorno depende do meio: PIX volta na conta em minutos, no máximo um
 * dia útil; cartão aparece na fatura em até duas, conforme o banco. Sem cobrança, sem promessa.
 */
export function tplBookingCancelled(
  b: VoucherBooking,
  customerName: string | null,
  opts: { refund: CancellationRefund; amount: number | null; method: "pix" | "card" | null; reason: string | null },
  bookingUrl: string,
): { subject: string; html: string } {
  const fn = String(customerName ?? "").trim().split(/\s+/)[0];
  const greeting = fn ? `Olá, ${escapeHtml(fn)}.` : "Olá.";
  const valor = opts.amount != null ? formatBRL(opts.amount, b.currency ?? "BRL") : null;
  const prazo = opts.method === "card"
    ? "No cartão, o estorno aparece na fatura em até duas faturas, conforme o seu banco."
    : "No PIX, o estorno costuma aparecer na sua conta em minutos, no máximo em um dia útil.";
  const dinheiro = opts.refund === "refunded"
    ? `<p style="margin:0 0 14px">O estorno${valor ? ` de <strong>${valor}</strong>` : ""} já foi enviado. ${prazo}</p>`
    : opts.refund === "pending"
      ? `<p style="margin:0 0 14px">O estorno${valor ? ` de <strong>${valor}</strong>` : ""} está em processamento no banco. ${prazo} Você recebe outro e-mail quando ele for confirmado.</p>`
      : opts.refund === "manual"
        ? `<p style="margin:0 0 14px">O estorno${valor ? ` de <strong>${valor}</strong>` : ""} será feito pela nossa equipe em até 2 dias úteis, e a gente te avisa quando sair.</p>`
        : `<p style="margin:0 0 14px">Não houve cobrança nesta reserva, então não há estorno.</p>`;
  const rows: [string, string][] = [
    ["Reserva", escapeHtml(`#${b.code}`)],
    ["Estacionamento", escapeHtml(b.company_name)],
    ["Unidade", escapeHtml(b.location_name)],
    ["Check-in que seria", escapeHtml(formatBRDateTime(b.check_in_at))],
  ];
  if (opts.reason) rows.push(["Motivo", escapeHtml(opts.reason)]);
  const summary = rows.map(([l, v]) => bordRow(l, v)).join("");
  return {
    subject: `Reserva ${b.code} cancelada`,
    html: shell(
      "Reserva cancelada",
      `
      <p style="margin:0 0 14px">${greeting} Sua reserva no ${escapeHtml(b.location_name)} foi cancelada.</p>
      ${dinheiro}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px;">${summary}</table>
      ${checkItem(`Mudou de ideia? É só fazer uma nova reserva. A vaga volta para a busca na hora.`)}
      ${checkItem(`Precisa de ajuda? Fale com a gente no WhatsApp <a href="${SUPPORT_WHATSAPP.href}" class="mp-help-link">${SUPPORT_WHATSAPP.label}</a>.`)}
      <p style="margin:28px 0 0;">${button(bookingUrl, "Ver a reserva")}</p>`,
      { preheader: `Reserva ${b.code} cancelada${opts.refund === "none" ? "" : ", estorno a caminho"}` },
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
