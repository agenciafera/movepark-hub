/**
 * Lógica da bolinha do assistente da Automação: página aberta, rótulos, cartões e a conversa na
 * sessão do navegador. Spec: docs/specs/assistente-marketing.md § 4.
 */

export type Papel = "usuario" | "assistente";
export type Ferramenta = { nome: string; ok: boolean };
export type Proposta = { tool: string; args: Record<string, unknown>; resumo: Record<string, unknown> };
export type Cartao = Proposta & {
  id: string;
  status: "aberta" | "executando" | "feita" | "descartada" | "falhou";
  resultado?: string;
};
export type Fala = { id: string; papel: Papel; texto: string; ferramentas: Ferramenta[]; cartaoIds: string[] };
export type Conversa = { falas: Fala[]; cartoes: Record<string, Cartao> };
export type Pagina = { caminho: string; campaign_id?: string; segment_id?: string };

export const CHAVE_CONVERSA = "mp_marketing_assistant_v1";
export const MAX_MENSAGENS = 20;
export const RECARREGOU = "A página recarregou antes da resposta. Confira o resultado na campanha.";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function paginaDoCaminho(pathname: string): Pagina {
  const campanha = new RegExp(`^/manager/marketing/campanhas/(${UUID})`, "i").exec(pathname);
  return campanha ? { caminho: pathname, campaign_id: campanha[1] } : { caminho: pathname };
}

const ROTULOS: Record<string, string> = {
  marketing_list_locations: "listou as unidades",
  marketing_get_rfm: "consultou o RFM",
  marketing_get_funnel: "consultou o funil",
  marketing_get_discoveries: "leu as descobertas",
  marketing_get_profiles: "leu os perfis",
  marketing_list_segment_fields: "leu os campos de segmento",
  marketing_preview_segment: "mediu o segmento",
  marketing_list_segments: "listou os segmentos",
  marketing_list_contacts: "listou contatos",
  marketing_get_contact: "abriu um contato",
  marketing_list_campaigns: "listou as campanhas",
  marketing_get_campaign: "abriu a campanha",
  marketing_render_message: "montou a mensagem",
  marketing_list_leads: "listou os leads",
  marketing_list_coupons: "listou os cupons",
  marketing_get_dispatch_config: "leu a configuração do disparo",
  marketing_save_segment: "salvou o segmento",
  marketing_delete_segment: "excluiu o segmento",
  marketing_save_campaign: "salvou a campanha",
  marketing_set_campaign_status: "mudou o status da campanha",
  marketing_move_lead: "moveu o lead",
  marketing_save_coupon: "salvou o cupom",
  marketing_set_coupon_active: "pausou ou reativou o cupom",
  marketing_set_dispatch_config: "mudou a configuração do disparo",
  marketing_run_campaign: "propôs executar a campanha",
  marketing_set_dispatch_enabled: "propôs mudar a chave geral",
};

export function rotuloDaFerramenta(nome: string, ok: boolean): string {
  const rotulo = ROTULOS[nome] ?? nome;
  return ok ? rotulo : `não conseguiu: ${rotulo}`;
}

export function ultimasMensagens(falas: Fala[], max = MAX_MENSAGENS): Array<{ papel: Papel; texto: string }> {
  return falas.slice(-max).map((f) => ({ papel: f.papel, texto: f.texto }));
}

export function carregarConversa(storage: Storage = sessionStorage): Conversa {
  try {
    const bruto = storage.getItem(CHAVE_CONVERSA);
    if (!bruto) return { falas: [], cartoes: {} };
    const c = JSON.parse(bruto) as Conversa;
    if (!Array.isArray(c?.falas) || typeof c?.cartoes !== "object" || c.cartoes === null) {
      return { falas: [], cartoes: {} };
    }
    // Cartão que estava executando quando a página recarregou: a resposta se perdeu, e o botão
    // não pode voltar a aparecer (seria executar duas vezes).
    const cartoes: Record<string, Cartao> = {};
    for (const [id, cartao] of Object.entries(c.cartoes)) {
      cartoes[id] =
        cartao.status === "executando"
          ? { ...cartao, status: "falhou", resultado: RECARREGOU }
          : cartao;
    }
    return { falas: c.falas, cartoes };
  } catch {
    return { falas: [], cartoes: {} };
  }
}

export function salvarConversa(c: Conversa, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(CHAVE_CONVERSA, JSON.stringify(c));
  } catch {
    // Sessão cheia ou bloqueada: a conversa só não sobrevive à troca de página.
  }
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export function linhasDoCartao(c: Cartao): { titulo: string; linhas: string[]; podeConfirmar: boolean } {
  const r = c.resumo ?? {};
  if (c.tool === "marketing_run_campaign") {
    const problemas = Array.isArray(r.problemas) ? (r.problemas as string[]) : [];
    const linhas = [String(r.campanha ?? "Campanha sem nome")];
    if (r.segmento) {
      linhas.push(
        `Segmento ${String(r.segmento)}: ${n(r.publico)} pessoas, ${n(r.alcance_email)} com e-mail e ${n(r.alcance_whatsapp)} com WhatsApp.`,
      );
    } else {
      linhas.push("A campanha ainda não tem segmento.");
    }
    linhas.push(
      r.disparo_ligado
        ? "Disparo real ligado: as mensagens saem para clientes."
        : "Disparo real desligado: as mensagens ficam seguradas e ninguém recebe nada.",
    );
    if (problemas.length > 0) linhas.push(`O fluxo tem problema e não roda: ${problemas.join(" ")}`);
    return { titulo: "Executar a campanha", linhas, podeConfirmar: problemas.length === 0 };
  }
  if (c.tool === "marketing_set_dispatch_enabled") {
    const ligar = r.ligar === true;
    const linhas = [`Motivo: ${String(r.motivo ?? "")}`];
    if (ligar) linhas.push("Com ele ligado, toda campanha executada manda e-mail e WhatsApp para clientes reais.");
    linhas.push(`Agora ele está ${r.disparo_ligado_agora ? "ligado" : "desligado"}.`);
    return { titulo: ligar ? "Ligar o disparo real" : "Desligar o disparo real", linhas, podeConfirmar: true };
  }
  return { titulo: c.tool, linhas: [], podeConfirmar: false };
}

export function resumoDoResultado(tool: string, resultado: unknown): string {
  const r = (resultado ?? {}) as Record<string, unknown>;
  if (tool === "marketing_run_campaign") {
    return `Feito: ${n(r.sent)} enviadas, ${n(r.skipped)} seguradas, ${n(r.suppressed)} bloqueadas.`;
  }
  if (tool === "marketing_set_dispatch_enabled") {
    return `Feito: disparo real ${r.enabled ? "ligado" : "desligado"}.`;
  }
  return "Feito.";
}
