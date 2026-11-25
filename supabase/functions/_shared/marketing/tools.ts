// MCP de marketing: definição das tools (nome, descrição, schema e escopo).
//
// Registro único: o MCP do Manager espalha este array no MANAGER_TOOLS, e o assistente da tela de
// Automação vai consumi-lo por adaptador (como o chat do site faz com _shared/assistant-tools.ts).
// Os handlers ficam em handlers.ts. Spec: docs/specs/marketing-mcp.md § 5.
//
// Atenção ao guarda do CI (scripts/check-openapi-drift.mjs): ele colhe os nomes das tools pelo campo
// de nome escrito como string literal. Nenhum outro campo deste arquivo pode usar essa forma.

export type MarketingScope = "marketing:read" | "marketing:write" | "marketing:dispatch";

export type MarketingToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scope: MarketingScope;
};

function obj(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
const S = { type: "string" };
const UUID = { type: "string", description: "uuid" };
const INT = { type: "integer" };
const BOOL = { type: "boolean" };
const LOCS = {
  type: "array",
  items: { type: "string" },
  description: "Ids de unidade (location). Vazio ou ausente = todas. Veja marketing_list_locations.",
};
const DEFINICAO = {
  type: "object",
  description:
    'Árvore do segmento: {"match":"all"|"any","rules":[{"field","op","value"} ou outro grupo]}. Campos e operadores em marketing_list_segment_fields.',
};
const FLUXO = {
  type: "object",
  description:
    'Fluxo da campanha: {"nodes":[{"id","type","data"}],"edges":[{"from","to","branch"?}]}. type: trigger, email (data.subject, data.body com {{nome}} etc.), whatsapp (data.template, data.params), wait (data.hours), condition (data.field, data.op, data.value; arestas com branch "yes"/"no"), exit.',
};

export const MARKETING_TOOLS: MarketingToolDef[] = [
  // ── Leitura ────────────────────────────────────────────────────────────────
  {
    name: "marketing_list_locations",
    scope: "marketing:read",
    description: "Unidades (estacionamentos) com id, nome, empresa e destino. Use os ids para recortar análises, segmentos e campanhas.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_rfm",
    scope: "marketing:read",
    description: "Matriz RFM da base de clientes do Hub: células, totais, segmentos e oportunidades. Não inclui cliente do white-label.",
    inputSchema: obj({ location_ids: LOCS, window_days: { ...INT, description: "Janela em dias. Padrão: a configurada (365)." } }),
  },
  {
    name: "marketing_get_funnel",
    scope: "marketing:read",
    description: "Funil de conversão do período: reservas criadas, pagas, check-in e concluídas, com perdas (expiradas, canceladas) e cliques de saída para o site do parceiro.",
    inputSchema: obj(
      { from: { type: "string", format: "date-time" }, to: { type: "string", format: "date-time" }, location_ids: LOCS },
      ["from", "to"],
    ),
  },
  {
    name: "marketing_get_discoveries",
    scope: "marketing:read",
    description: "Descobertas da base (mudanças de comportamento), cada uma com estado achado, estavel ou sem_dados.",
    inputSchema: obj({ location_ids: LOCS, window_days: INT }),
  },
  {
    name: "marketing_get_profiles",
    scope: "marketing:read",
    description: "Matriz de perfis de cliente por estacionamento (coortes).",
    inputSchema: obj({ location_ids: LOCS }),
  },
  {
    name: "marketing_list_segment_fields",
    scope: "marketing:read",
    description: "Catálogo de campos para montar segmento: chave, tipo, rótulo, opções e os operadores que cada tipo aceita. Leia antes de montar ou editar um segmento.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_preview_segment",
    scope: "marketing:read",
    description: "Valida uma definição de segmento e, se estiver certa, conta quem casa, quem dá para alcançar por e-mail e por WhatsApp, e devolve uma amostra.",
    inputSchema: obj({ definition: DEFINICAO, location_ids: LOCS, limit: INT }, ["definition"]),
  },
  {
    name: "marketing_list_segments",
    scope: "marketing:read",
    description: "Segmentos salvos, automáticos (RFM) e manuais, com quantos casam e quantos dá para alcançar.",
    inputSchema: obj({ location_ids: LOCS }),
  },
  {
    name: "marketing_list_contacts",
    scope: "marketing:read",
    description: "Contatos com nome, e-mail, telefone e comportamento, a partir de um segmento salvo, de uma definição ou de um segmento RFM.",
    inputSchema: obj({
      segment_id: UUID,
      definition: DEFINICAO,
      rfm_segment: { type: "string", description: "Ex.: campeoes, em_risco, perdidos_vip. Veja marketing_list_segment_fields." },
      location_ids: LOCS,
      limit: INT,
    }),
  },
  {
    name: "marketing_get_contact",
    scope: "marketing:read",
    description: "Um contato pelo e-mail, telefone ou contact_key: documento completo, RFM, reservas, cartões de lead e mensagens recebidas.",
    inputSchema: obj({ email: S, phone: S, contact_key: S }),
  },
  {
    name: "marketing_list_campaigns",
    scope: "marketing:read",
    description: "Campanhas com status, público, teto e estatística da última execução.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_campaign",
    scope: "marketing:read",
    description: "Uma campanha: fluxo, segmento, matrículas por status, problemas que impedem executar e as últimas mensagens.",
    inputSchema: obj({ campaign_id: UUID }, ["campaign_id"]),
  },
  {
    name: "marketing_render_message",
    scope: "marketing:read",
    description: "Monta o e-mail ou WhatsApp de um nó da campanha para um contato, com as marcações preenchidas, sem enviar nada.",
    inputSchema: obj({ campaign_id: UUID, node_id: S, contact_key: S }, ["campaign_id", "node_id"]),
  },
  {
    name: "marketing_list_leads",
    scope: "marketing:read",
    description: "Cartões do quadro de leads do consumidor, com etapa, reserva e comportamento. Filtra por etapa (stage_key), unidade e busca.",
    inputSchema: obj({
      stage_key: { type: "string", description: "descoberta, interesse, reserva_iniciada, cliente ou perdido" },
      location_ids: LOCS,
      search: S,
    }),
  },
  {
    name: "marketing_list_coupons",
    scope: "marketing:read",
    description: "Cupons da Movepark (de plataforma), com regras e uso.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_dispatch_config",
    scope: "marketing:read",
    description: "Configuração do disparo: chave geral, teto diário, enviados hoje, destinatário de ensaio e remetente.",
    inputSchema: obj({}),
  },
  // ── Gravação ───────────────────────────────────────────────────────────────
  {
    name: "marketing_save_segment",
    scope: "marketing:write",
    description: "Cria (sem segment_id) ou edita um segmento. A definição é validada no servidor; segmento automático do RFM não muda.",
    inputSchema: obj(
      { segment_id: UUID, name: S, definition: DEFINICAO, description: S, location_ids: LOCS },
      ["name", "definition"],
    ),
  },
  {
    name: "marketing_delete_segment",
    scope: "marketing:write",
    description: "Exclui um segmento (soft delete). Recusa segmento automático e segmento de campanha em andamento.",
    inputSchema: obj({ segment_id: UUID }, ["segment_id"]),
  },
  {
    name: "marketing_save_campaign",
    scope: "marketing:write",
    description: "Cria (sem campaign_id) ou edita uma campanha. Nasce rascunho. Devolve os problemas que ainda impedem executar.",
    inputSchema: obj(
      {
        campaign_id: UUID,
        name: S,
        segment_id: UUID,
        location_ids: LOCS,
        canvas: FLUXO,
        send_cap: { ...INT, description: "Teto de público, de 1 a 10000. Padrão 100." },
      },
      ["name"],
    ),
  },
  {
    name: "marketing_set_campaign_status",
    scope: "marketing:write",
    description: "Pausa, volta a rascunho ou arquiva uma campanha. running e done são do motor.",
    inputSchema: obj(
      { campaign_id: UUID, status: { type: "string", enum: ["draft", "paused", "archived"] } },
      ["campaign_id", "status"],
    ),
  },
  {
    name: "marketing_move_lead",
    scope: "marketing:write",
    description: "Move um cartão de lead para outra etapa (stage_key). O cartão deixa de seguir o checkout sozinho, como quando se arrasta na tela.",
    inputSchema: obj({ lead_id: UUID, stage_key: S }, ["lead_id", "stage_key"]),
  },
  {
    name: "marketing_save_coupon",
    scope: "marketing:write",
    description: "Cria (sem coupon_id) ou edita um cupom da Movepark. O desconto sai da comissão da Movepark. Percentual exige max_discount_amount; audience winback exige audience_inactive_days.",
    inputSchema: obj({
      coupon_id: UUID,
      code: S,
      title: S,
      description: S,
      terms: S,
      discount_type: { type: "string", enum: ["percent", "fixed"] },
      discount_value: { type: "number" },
      max_discount_amount: { type: "number" },
      audience: {
        type: "string",
        enum: ["code_only", "public", "first_purchase", "second_purchase", "winback"],
        description: "Quem pode usar. Padrão code_only (só quem tem o código).",
      },
      audience_inactive_days: INT,
      valid_from: { type: "string", format: "date-time" },
      valid_until: { type: "string", format: "date-time" },
      max_uses: INT,
      per_user_limit: INT,
      min_amount: { type: "number" },
      min_days: INT,
      is_active: BOOL,
      is_advertised: BOOL,
      sort_order: INT,
    }),
  },
  {
    name: "marketing_set_coupon_active",
    scope: "marketing:write",
    description: "Pausa (active=false) ou reativa um cupom da Movepark.",
    inputSchema: obj({ coupon_id: UUID, active: BOOL }, ["coupon_id", "active"]),
  },
  {
    name: "marketing_set_dispatch_config",
    scope: "marketing:write",
    description: "Troca o destinatário de ensaio (todo e-mail vai para ele em vez do cliente; vazio desliga) e o teto diário de envios. O remetente não muda por aqui.",
    inputSchema: obj({ test_recipient: S, daily_cap: INT }),
  },
  // ── Disparo ────────────────────────────────────────────────────────────────
  {
    name: "marketing_run_campaign",
    scope: "marketing:dispatch",
    description: "Executa uma rodada da campanha (até limit pessoas, padrão 100). Com a chave geral desligada, monta e grava as mensagens como seguradas sem enviar. Recusa fluxo com problema.",
    inputSchema: obj({ campaign_id: UUID, limit: INT }, ["campaign_id"]),
  },
  {
    name: "marketing_set_dispatch_enabled",
    scope: "marketing:dispatch",
    description: "Liga ou desliga a chave geral do disparo real de todas as campanhas. Exige motivo. Ligar avisa a equipe por e-mail.",
    inputSchema: obj({ enabled: BOOL, reason: S }, ["enabled", "reason"]),
  },
];
