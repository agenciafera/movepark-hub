/**
 * Lógica pura da página Assistente de IA (docs/specs/assistente-marketing.md § 8): ler as partes
 * de mensagem do AI SDK, escolher o componente de cada tool, montar o cartão da proposta.
 */

type Parte = { type: string } & Record<string, unknown>;

export type ParteDeTool = {
  nome: string;
  id: string;
  estado: "rodando" | "pronta" | "erro";
  entrada: Record<string, unknown>;
  saida: unknown;
  erro: string | null;
};

export function parteDeTool(parte: Parte): ParteDeTool | null {
  let nome: string | null = null;
  if (parte.type === "dynamic-tool" && typeof parte.toolName === "string") nome = parte.toolName;
  else if (parte.type.startsWith("tool-")) nome = parte.type.slice(5);
  if (!nome) return null;

  const state = String(parte.state ?? "");
  const saida = parte.output;
  const erroComoDado =
    saida && typeof saida === "object" && (saida as { ok?: unknown }).ok === false
      ? String((saida as { erro?: unknown }).erro ?? "Não deu certo.")
      : null;
  const erro = state === "output-error" ? String(parte.errorText ?? "Não deu certo.") : erroComoDado;
  return {
    nome,
    id: String(parte.toolCallId ?? ""),
    estado: erro ? "erro" : state === "output-available" ? "pronta" : "rodando",
    entrada: (parte.input && typeof parte.input === "object" ? parte.input : {}) as Record<string, unknown>,
    saida,
    erro,
  };
}

export type Grupo =
  | "segmento"
  | "funil"
  | "rfm"
  | "perfis"
  | "descobertas"
  | "campanha"
  | "campanhas"
  | "mensagem"
  | "gravacao"
  | "proposta"
  | "oportunidades"
  | "distribuicao"
  | "tendencia"
  | "calendario"
  | "resultado"
  | "generico";

const GRUPOS: Record<string, Grupo> = {
  marketing_preview_segment: "segmento",
  marketing_get_funnel: "funil",
  marketing_get_rfm: "rfm",
  marketing_get_profiles: "perfis",
  marketing_get_discoveries: "descobertas",
  marketing_get_campaign: "campanha",
  marketing_list_campaigns: "campanhas",
  marketing_render_message: "mensagem",
  marketing_save_segment: "gravacao",
  marketing_delete_segment: "gravacao",
  marketing_save_campaign: "gravacao",
  marketing_set_campaign_status: "gravacao",
  marketing_move_lead: "gravacao",
  marketing_save_coupon: "gravacao",
  marketing_set_coupon_active: "gravacao",
  marketing_set_dispatch_config: "gravacao",
  marketing_run_campaign: "proposta",
  marketing_set_dispatch_enabled: "proposta",
  marketing_get_opportunities: "oportunidades",
  marketing_get_breakdown: "distribuicao",
  marketing_get_trend: "tendencia",
  marketing_get_calendar: "calendario",
  marketing_measure_campaign: "resultado",
};

export function grupoDaTool(nome: string): Grupo {
  return GRUPOS[nome] ?? "generico";
}

/** [enquanto roda, quando termina bem, quando falha]. */
const ROTULOS: Record<string, [string, string, string]> = {
  marketing_list_locations: ["Listando as unidades…", "Listou as unidades", "Não conseguiu listar as unidades"],
  marketing_get_rfm: ["Consultando o RFM…", "Consultou o RFM", "Não conseguiu consultar o RFM"],
  marketing_get_funnel: ["Consultando o funil…", "Consultou o funil", "Não conseguiu consultar o funil"],
  marketing_get_discoveries: ["Lendo as descobertas…", "Leu as descobertas", "Não conseguiu ler as descobertas"],
  marketing_get_profiles: ["Lendo os perfis…", "Leu os perfis", "Não conseguiu ler os perfis"],
  marketing_list_segment_fields: [
    "Lendo os campos de segmento…",
    "Leu os campos de segmento",
    "Não conseguiu ler os campos de segmento",
  ],
  marketing_preview_segment: ["Medindo o segmento…", "Mediu o segmento", "Não conseguiu medir o segmento"],
  marketing_list_segments: ["Listando os segmentos…", "Listou os segmentos", "Não conseguiu listar os segmentos"],
  marketing_list_contacts: ["Listando contatos…", "Listou contatos", "Não conseguiu listar contatos"],
  marketing_get_contact: ["Abrindo o contato…", "Abriu o contato", "Não conseguiu abrir o contato"],
  marketing_list_campaigns: ["Listando as campanhas…", "Listou as campanhas", "Não conseguiu listar as campanhas"],
  marketing_get_campaign: ["Abrindo a campanha…", "Abriu a campanha", "Não conseguiu abrir a campanha"],
  marketing_render_message: ["Montando a mensagem…", "Montou a mensagem", "Não conseguiu montar a mensagem"],
  marketing_list_leads: ["Listando os leads…", "Listou os leads", "Não conseguiu listar os leads"],
  marketing_list_coupons: ["Listando os cupons…", "Listou os cupons", "Não conseguiu listar os cupons"],
  marketing_get_dispatch_config: [
    "Lendo a configuração do disparo…",
    "Leu a configuração do disparo",
    "Não conseguiu ler a configuração do disparo",
  ],
  marketing_save_segment: ["Salvando o segmento…", "Salvou o segmento", "Não conseguiu salvar o segmento"],
  marketing_delete_segment: ["Excluindo o segmento…", "Excluiu o segmento", "Não conseguiu excluir o segmento"],
  marketing_save_campaign: ["Salvando a campanha…", "Salvou a campanha", "Não conseguiu salvar a campanha"],
  marketing_set_campaign_status: [
    "Mudando o status da campanha…",
    "Mudou o status da campanha",
    "Não conseguiu mudar o status da campanha",
  ],
  marketing_move_lead: ["Movendo o lead…", "Moveu o lead", "Não conseguiu mover o lead"],
  marketing_save_coupon: ["Salvando o cupom…", "Salvou o cupom", "Não conseguiu salvar o cupom"],
  marketing_set_coupon_active: [
    "Pausando ou reativando o cupom…",
    "Pausou ou reativou o cupom",
    "Não conseguiu pausar ou reativar o cupom",
  ],
  marketing_set_dispatch_config: [
    "Mudando a configuração do disparo…",
    "Mudou a configuração do disparo",
    "Não conseguiu mudar a configuração do disparo",
  ],
  marketing_run_campaign: ["Preparando a execução…", "Preparou a execução", "Não conseguiu preparar a execução"],
  marketing_set_dispatch_enabled: [
    "Preparando a mudança da chave geral…",
    "Preparou a mudança da chave geral",
    "Não conseguiu preparar a mudança da chave geral",
  ],
  marketing_get_opportunities: [
    "Procurando as oportunidades de hoje…",
    "Achou as oportunidades de hoje",
    "Não conseguiu ler as oportunidades",
  ],
  marketing_get_breakdown: ["Dividindo o público…", "Dividiu o público", "Não conseguiu dividir o público"],
  marketing_get_trend: ["Lendo a tendência…", "Leu a tendência", "Não conseguiu ler a tendência"],
  marketing_get_calendar: ["Olhando o calendário…", "Olhou o calendário", "Não conseguiu ler o calendário"],
  marketing_measure_campaign: [
    "Medindo o resultado da campanha…",
    "Mediu o resultado da campanha",
    "Não conseguiu medir o resultado da campanha",
  ],
};

const PADRAO_DO_ROTULO: [string, string, string] = [
  "Consultando a base…",
  "Consultou a base",
  "Não conseguiu consultar a base",
];

export function rotuloDaTool(nome: string, estado: ParteDeTool["estado"]): string {
  const r = ROTULOS[nome] ?? PADRAO_DO_ROTULO;
  return estado === "rodando" ? r[0] : estado === "pronta" ? r[1] : r[2];
}

export function houveGravacao(mensagem: { parts: Parte[] }): boolean {
  return mensagem.parts.some((p) => {
    const t = parteDeTool(p);
    return !!t && t.estado === "pronta" && grupoDaTool(t.nome) === "gravacao";
  });
}

export function linkDaGravacao(
  nome: string,
  entrada: Record<string, unknown>,
  saida: unknown,
): { rotulo: string; href: string } | null {
  const s = (saida && typeof saida === "object" ? saida : {}) as Record<string, unknown>;
  switch (nome) {
    case "marketing_save_segment":
    case "marketing_delete_segment":
      return { rotulo: "Abrir os segmentos", href: "/manager/marketing/segmentos" };
    case "marketing_save_campaign":
    case "marketing_set_campaign_status": {
      const id = String(s.campaign_id ?? entrada.campaign_id ?? "");
      return id
        ? { rotulo: "Abrir a campanha", href: `/manager/marketing/campanhas/${id}` }
        : { rotulo: "Abrir as campanhas", href: "/manager/marketing/campanhas" };
    }
    case "marketing_move_lead":
      return { rotulo: "Abrir os leads", href: "/manager/marketing/leads" };
    case "marketing_save_coupon":
    case "marketing_set_coupon_active":
      return { rotulo: "Abrir os cupons", href: "/manager/marketing/cupons" };
    case "marketing_set_dispatch_config":
      return { rotulo: "Abrir as campanhas", href: "/manager/marketing/campanhas" };
    default:
      return null;
  }
}

export type Proposta = {
  id: string;
  tool: string;
  status: string;
  resumo: Record<string, unknown>;
  resultado: { dados?: unknown; resumo?: string } | null;
  erro: string | null;
  expires_at: string;
};

export function propostaDaSaida(
  saida: unknown,
): { id: string; tool: string; resumo: Record<string, unknown> } | null {
  const s = (saida && typeof saida === "object" ? saida : {}) as Record<string, unknown>;
  if (s.status !== "proposta" || typeof s.proposta_id !== "string" || typeof s.tool !== "string") return null;
  return { id: s.proposta_id, tool: s.tool, resumo: (s.resumo ?? {}) as Record<string, unknown> };
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

export function linhasDoCartao(
  tool: string,
  r: Record<string, unknown>,
): { titulo: string; linhas: string[]; podeConfirmar: boolean } {
  if (tool === "marketing_run_campaign") {
    const problemas = Array.isArray(r.problemas) ? (r.problemas as string[]) : [];
    const linhas = [String(r.campanha ?? "Campanha sem nome")];
    linhas.push(
      r.segmento
        ? `Segmento ${String(r.segmento)}: ${n(r.publico)} pessoas, ${n(r.alcance_email)} com e-mail e ${n(r.alcance_whatsapp)} com WhatsApp.`
        : "A campanha ainda não tem segmento.",
    );
    linhas.push(
      r.disparo_ligado
        ? "Disparo real ligado: as mensagens saem para clientes."
        : "Disparo real desligado: as mensagens ficam seguradas e ninguém recebe nada.",
    );
    if (problemas.length > 0) linhas.push(`O fluxo tem problema e não roda: ${problemas.join(" ")}`);
    return { titulo: "Executar a campanha", linhas, podeConfirmar: problemas.length === 0 };
  }
  if (tool === "marketing_set_dispatch_enabled") {
    const ligar = r.ligar === true;
    const linhas = [`Motivo: ${String(r.motivo ?? "")}`];
    if (ligar) linhas.push("Com ele ligado, toda campanha executada manda e-mail e WhatsApp para clientes reais.");
    linhas.push(`Agora ele está ${r.disparo_ligado_agora ? "ligado" : "desligado"}.`);
    return { titulo: ligar ? "Ligar o disparo real" : "Desligar o disparo real", linhas, podeConfirmar: true };
  }
  return { titulo: tool, linhas: [], podeConfirmar: false };
}

export function ehPerigosa(tool: string, r: Record<string, unknown>): boolean {
  if (tool === "marketing_set_dispatch_enabled") return r.ligar === true;
  return r.disparo_ligado === true;
}

const COLUNAS_CONHECIDAS: Array<{ chave: string; rotulo: string }> = [
  { chave: "email", rotulo: "E-mail" },
  { chave: "phone", rotulo: "Telefone" },
  { chave: "bookings_count", rotulo: "Reservas" },
  { chave: "total_spent", rotulo: "Total gasto" },
  { chave: "days_since_last", rotulo: "Dias sem reservar" },
  { chave: "rfm_segment", rotulo: "Grupo RFM" },
];

export function colunasDaAmostra(
  amostra: Array<{ doc: Record<string, unknown> }>,
): Array<{ chave: string; rotulo: string }> {
  return COLUNAS_CONHECIDAS.filter((c) => amostra.some((a) => a.doc?.[c.chave] !== undefined));
}

/** O corpo de um turno: só a fala nova vai, a conversa inteira mora na memória do agente. */
export function pedidoDoTurno(
  conversaId: string,
  mensagens: Array<{ id: string; role: string; parts: unknown[] }>,
): Record<string, unknown> {
  return { acao: "conversar", conversa_id: conversaId, mensagem: mensagens[mensagens.length - 1] };
}

/**
 * O título nasce em segundo plano no agente, depois da resposta. Enquanto houver conversa recente
 * sem título, a lista recarrega; depois de um minuto, desiste.
 */
export function esperandoTitulo(conversas: Array<{ titulo: string; atualizada_em: string }>, agora: number): boolean {
  return conversas.some((c) => !c.titulo.trim() && agora - new Date(c.atualizada_em).getTime() < 60_000);
}

/**
 * A tela desenha parágrafo, lista, negrito, itálico e link (`MarkdownRestrito`). O que o modelo
 * escrever fora disso vira algo legível em vez de aparecer cru: título vira negrito, linha
 * horizontal some, crase some.
 */
export function normalizarMarkdown(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l))
    .map((l) => l.replace(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/, (_m, t: string) => `**${t.replace(/\*\*/g, "")}**`))
    .join("\n")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Onde o resultado de cada tool aparece. `destaque`: aberto, depois do texto, porque é o que o
 * admin decide ou confere (proposta, o que foi gravado, quantas pessoas o segmento pega, a
 * mensagem). `sob_demanda`: dentro dos passos, a um clique (gráficos e números da campanha).
 * `nada`: consulta de bastidor, que só serve ao agente.
 */
export function ondeMostrar(grupo: Grupo): "destaque" | "sob_demanda" | "nada" {
  if (
    grupo === "proposta" || grupo === "gravacao" || grupo === "segmento" || grupo === "mensagem" ||
    grupo === "oportunidades" || grupo === "distribuicao" || grupo === "tendencia" ||
    grupo === "calendario" || grupo === "resultado"
  ) return "destaque";
  if (grupo === "rfm" || grupo === "funil" || grupo === "perfis" || grupo === "descobertas" || grupo === "campanha") {
    return "sob_demanda";
  }
  return "nada";
}

export type MensagemOrganizada = {
  passos: ParteDeTool[];
  textos: string[];
  destaques: ParteDeTool[];
  /** Os botões de próximo passo, da ferramenta de tela `sugerir_proximos_passos`. */
  proximos: string[];
};

/** Até 3 passos com texto, cada um com até 48 caracteres (o mesmo teto da ferramenta). */
export function passosSugeridos(t: ParteDeTool): string[] {
  const lista = (t.entrada as { passos?: unknown }).passos;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim().slice(0, 48))
    .slice(0, 3);
}

/**
 * Uma resposta do agente, do jeito que a tela mostra: os passos juntos (recolhidos), o texto, e
 * só então os destaques. Segmento e mensagem medidos mais de uma vez aparecem uma vez, com o
 * último resultado; proposta e gravação aparecem todas, porque cada uma é uma coisa.
 */
export function organizarMensagem(parts: Array<{ type: string } & Record<string, unknown>>): MensagemOrganizada {
  const passos: ParteDeTool[] = [];
  const textos: string[] = [];
  let proximos: string[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      const t = normalizarMarkdown(String(p.text ?? ""));
      if (t) textos.push(t);
      continue;
    }
    const tool = parteDeTool(p);
    if (!tool) continue;
    if (tool.nome === "sugerir_proximos_passos") {
      proximos = passosSugeridos(tool);
      continue;
    }
    passos.push(tool);
  }
  const destaques: ParteDeTool[] = [];
  const unicos = new Set(["segmento", "mensagem", "oportunidades", "calendario"]);
  for (const t of passos) {
    const grupo = grupoDaTool(t.nome);
    if (t.estado !== "pronta" || ondeMostrar(grupo) !== "destaque") continue;
    if (unicos.has(grupo)) {
      const i = destaques.findIndex((d) => grupoDaTool(d.nome) === grupo);
      if (i !== -1) destaques.splice(i, 1);
    }
    destaques.push(t);
  }
  return { passos, textos, destaques, proximos };
}
