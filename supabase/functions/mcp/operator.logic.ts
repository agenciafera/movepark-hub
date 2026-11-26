// MCP /operator: lógica pura do assistente do operador (a Mia para operadores).
//
// Ver docs/specs/assistente-do-operador.md. Aqui ficam as definições das tools próprias da
// superfície, a leitura da situação da reserva ("o que dá para fazer agora") e a montagem da
// proposta de ação. Nada aqui toca rede, para o teste rodar puro.
//
// A regra de negócio NÃO é reescrita: cancelamento usa `refundDecision` da Edge cancel-booking,
// troca de veículo usa `vehicleChangeOpen`, e assim por diante. Se a regra mudar lá, o que a IA
// diz muda junto. Duas versões da regra seria o assistente prometendo o que o botão recusa.

import type { ToolDef } from "./tools.ts";
import { refundDecision, withinFreeWindow } from "../cancel-booking/logic.ts";
import { dateChangeAllowed } from "../change-booking-dates/logic.ts";
import { plateChangeAllowed, vehicleChangeOpen } from "../change-booking-vehicle/logic.ts";

function obj(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
const S = { type: "string" };
const BOOKING = {
  type: "string",
  description: "Código da reserva (MP-XXXXXX) ou o id dela.",
};

/** O escopo que o agente recebe da chave dele, somado aos do papel do usuário. */
export const ESCOPO_DO_AGENTE = "operator:assist";

// ── Tools próprias da superfície ───────────────────────────────────────────────
export const OPERATOR_ASSIST_TOOLS: ToolDef[] = [
  {
    name: "find_booking",
    scope: "bookings:read",
    description:
      "Procura reservas da empresa por código, placa, nome, e-mail ou telefone do cliente. Devolve até 10, da entrada mais recente para a mais antiga. Use quando o operador citar a reserva sem o código.",
    inputSchema: obj({ query: { type: "string", description: "Código, placa, nome, e-mail ou telefone (mínimo 3 caracteres)." } }, ["query"]),
  },
  {
    name: "get_booking_situation",
    scope: "bookings:read",
    description:
      "Situação completa de uma reserva: status, tarifa (Básica, Flex ou Superflex), até quando o cliente cancela com estorno, pagamentos e estornos, entrada e saída, histórico de alterações e, em `pode_agora`, o que o cliente consegue fazer sozinho e o que a equipe consegue fazer por ele. Chame SEMPRE antes de responder sobre uma reserva.",
    inputSchema: obj({ booking: BOOKING }, ["booking"]),
  },
  {
    name: "quote_date_change",
    scope: "bookings:read",
    description:
      "Cota a troca de datas de uma reserva paga pela tabela de preço da compra: novo total, diferença, se cobra do cliente ou estorna parte do valor, e se há vaga. Mudar só o dia, com a mesma duração, não custa nada; encurtar pode custar mais quando a tabela tem pacote. Use para 'vou voltar antes', 'quero adiar', 'quero ficar mais dias'. Não altera nada.",
    inputSchema: obj(
      {
        booking: BOOKING,
        check_in_at: { type: "string", format: "date-time", description: "Nova entrada, ISO 8601 com fuso (ex.: 2026-11-20T10:00:00-03:00)." },
        check_out_at: { type: "string", format: "date-time", description: "Nova saída, ISO 8601 com fuso." },
      },
      ["booking", "check_in_at", "check_out_at"],
    ),
  },
  {
    name: "quote_fare_upgrade",
    scope: "bookings:read",
    description:
      "Quanto o cliente paga para subir a reserva para Flex ou Superflex e o que cada uma libera (trocar datas e placa, proteção de voo, janela de cancelamento). O upgrade é pago pelo próprio cliente na conta dele. Não altera nada.",
    inputSchema: obj({ booking: BOOKING }, ["booking"]),
  },
  {
    name: "search_operator_knowledge",
    scope: "operator:assist",
    description:
      "Busca na base de conhecimento do operador (regras de cancelamento, estorno, prazos do dinheiro, tarifas, check-in, repasse, saque, proteção de voo, como usar o painel). Use antes de afirmar qualquer regra, prazo ou procedimento.",
    inputSchema: obj(
      {
        query: { type: "string", description: "A dúvida em linguagem natural." },
        k: { type: "integer", description: "Quantos trechos (padrão 5, máximo 12)." },
      },
      ["query"],
    ),
  },
  {
    name: "report_knowledge_gap",
    scope: "operator:assist",
    description:
      "Registra uma pergunta que a base não respondeu, para a equipe Movepark completar. Use quando search_operator_knowledge não trouxer a resposta. Depois diga ao operador que a equipe vai completar a base.",
    inputSchema: obj(
      {
        question: { type: "string", description: "A pergunta do operador, com as palavras dele." },
        context: { type: "string", description: "O que você já sabe e o que faltou." },
        booking: { type: "string", description: "Código da reserva, se houver." },
      },
      ["question"],
    ),
  },
  {
    name: "propose_booking_action",
    scope: "bookings:read",
    description:
      "Propõe uma ação na reserva para o operador confirmar num cartão da tela. NÃO executa: só cria a proposta (vale 10 minutos) e devolve o resumo com o efeito em reais. Tipos: cancel (cancela e estorna o que for devido), change_dates (precisa de check_in_at e check_out_at), change_vehicle (precisa de license_plate e reason), check_in, check_out. Depois de propor, diga ao operador para confirmar no cartão. Nunca diga que a ação foi feita.",
    inputSchema: obj(
      {
        booking: BOOKING,
        kind: { type: "string", enum: ["cancel", "change_dates", "change_vehicle", "check_in", "check_out"] },
        check_in_at: { type: "string", format: "date-time" },
        check_out_at: { type: "string", format: "date-time" },
        license_plate: S,
        model: S,
        color: S,
        reason: { type: "string", description: "Motivo, em uma frase. Obrigatório para cancel e change_vehicle." },
      },
      ["booking", "kind"],
    ),
  },
];

/** Leituras de parceiro que a superfície reaproveita. As escritas ficam de fora: não passariam pelo clique. */
export const OPERATOR_PARTNER_READS = [
  "list_locations",
  "get_location",
  "list_parking_types",
  "get_availability",
  "simulate_price",
  "list_bookings",
  "get_booking",
  "list_reviews",
  "get_occupancy",
] as const;

/** Escopo efetivo na superfície: o do papel do usuário mais o que a chave do agente concede. */
export function escoposEfetivos(doPapel: string[], doAgente: string[]): string[] {
  const s = new Set(doPapel);
  if (doAgente.includes(ESCOPO_DO_AGENTE)) s.add(ESCOPO_DO_AGENTE);
  return [...s].sort();
}

// ── Situação da reserva ────────────────────────────────────────────────────────

export type Tier = "basica" | "flex" | "superflex";

export interface Pagamento {
  id: string;
  kind: string;
  method: string | null;
  status: string;
  amount: number | string;
  installments: number | null;
  paid_at: string | null;
  refunded_amount: number | string | null;
  refunded_at: string | null;
  refund_reason?: string | null;
  fare_target_tier?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export interface TarifaDoCatalogo {
  tier: Tier;
  label: string;
  price_cents: number;
  cancel_window_minutes: number | null;
  benefits: Record<string, unknown> | null;
}

export interface Situacao {
  id: string;
  code: string;
  status: string;
  origin: string | null;
  check_in_at: string;
  check_out_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  total_amount: number | string;
  customer_name: string | null;
  fare_tier: Tier | null;
  fare_price_cents: number | null;
  fare_cancel_until: string | null;
  fare_benefits: Record<string, unknown> | null;
  location: { id: string; name: string; tolerance_minutes: number | null; checkout_mode: string | null };
  parking_type: string | null;
  vehicle: { plate: string | null; model: string | null; color: string | null } | null;
  payments: Pagamento[];
  flight_extensions: Array<{ kind: string | null; actual_check_out_at: string | null; new_check_out_at: string | null }>;
  fares: TarifaDoCatalogo[];
  [k: string]: unknown;
}

const centavos = (v: number | string | null | undefined): number => Math.round(Number(v ?? 0) * 100);

/**
 * Upgrade que a troca de datas pela equipe cobra junto (26/11/2026): o plano Básica não inclui
 * alterar datas, então a Edge `change-booking-dates-paid` soma o upgrade para o Flex. Zero quando o
 * plano já inclui ou a reserva ainda não foi paga. A Mia repete a conta da Edge só para avisar.
 */
export function upgradeParaTrocarDatas(s: Pick<Situacao, "status" | "fare_benefits" | "fare_price_cents" | "fares">): number {
  if (s.status === "pending" || s.fare_benefits?.date_change === true) return 0;
  const flex = (s.fares ?? []).find((f) => f.tier === "flex");
  return flex ? Math.max(0, flex.price_cents - (s.fare_price_cents ?? 0)) : 0;
}

/** "R$ 164,10", com espaço comum (o Intl põe espaço rígido, que o markdown do chat mostra torto). */
export function reais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

/** "20/11/2026 10:00" no fuso de São Paulo, que é o da operação. */
export function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso)).replace(",", "");
}

const ROTULO_TARIFA: Record<Tier, string> = { basica: "Básica", flex: "Flex", superflex: "Superflex" };
const ORDEM_TARIFA: Tier[] = ["basica", "flex", "superflex"];

const ROTULO_METODO: Record<string, string> = { pix: "PIX", credit_card: "cartão de crédito", card: "cartão de crédito" };

/** O modelo copia o que lê: status em inglês vira "paid" na mensagem para o cliente. */
export const ROTULO_PAGAMENTO: Record<string, string> = {
  paid: "pago",
  pending: "aguardando pagamento",
  authorized: "autorizado",
  refunded: "estornado",
  failed: "recusado",
  cancelled: "cancelado",
};

export const ROTULO_RESERVA: Record<string, string> = {
  pending: "aguardando pagamento",
  confirmed: "confirmada",
  checked_in: "veículo no pátio",
  completed: "concluída",
  cancelled: "cancelada",
  expired: "expirada",
  no_show: "não compareceu",
};

/**
 * O pagamento que sustenta a reserva, pela mesma regra do cancel-booking: o mais recente da
 * reserva (kind booking) ainda pago ou autorizado e sem estorno; sem nenhum, o último de todos.
 */
export function pagamentoDaReserva(pagamentos: Pagamento[]): Pagamento | null {
  const daReserva = pagamentos.filter((p) => (p.kind ?? "booking") === "booking");
  const vivos = daReserva
    .filter((p) => (p.status === "paid" || p.status === "authorized") && !p.refunded_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (vivos.length) return vivos[0];
  const todos = [...pagamentos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return todos[0] ?? null;
}

/** A proteção de voo acionada e ainda sem saída real registrada: o check-out é pela tela da reserva. */
export function protecaoDeVooAberta(s: Situacao): boolean {
  return (s.flight_extensions ?? []).some((e) => !e.actual_check_out_at);
}

export interface Analise {
  codigo: string;
  status: string;
  status_legivel: string;
  tarifa: string | null;
  entrada_prevista: string;
  saida_prevista: string;
  entrou_em: string | null;
  saiu_em: string | null;
  ja_comecou: boolean;
  dinheiro: {
    total_da_reserva: string;
    pagamento_da_reserva: string | null;
    estornado: string | null;
    outros_pagamentos: string[];
  };
  janela_de_cancelamento: { ate: string | null; cliente_ainda_cancela_com_estorno: boolean };
  pode_agora: {
    cancelar: { pelo_cliente: string; pela_equipe: string; estorno: string | null };
    alterar_datas: { pelo_cliente: boolean; pela_equipe: boolean; como: string | null; motivo: string | null };
    trocar_veiculo: { pelo_cliente: boolean; pela_equipe: boolean; motivo: string | null };
    check_in: boolean;
    check_out: boolean;
    upgrade: { possivel: boolean; opcoes: Array<{ tarifa: string; diferenca: string; libera: string[] }>; motivo: string | null };
  };
  avisos: string[];
}

const BENEFICIO_LEGIVEL: Record<string, string> = {
  date_change: "alterar datas",
  plate_change: "trocar placa",
  flight_delay_protection: "proteção de voo (atraso ou cancelamento)",
  notifications_sms: "avisos por WhatsApp",
};

/** O que muda de uma tarifa para outra, em palavras. */
function oQueLibera(atual: Record<string, unknown> | null, alvo: Record<string, unknown> | null): string[] {
  return Object.entries(BENEFICIO_LEGIVEL)
    .filter(([k]) => alvo?.[k] === true && atual?.[k] !== true)
    .map(([, v]) => v);
}

export function analisarReserva(s: Situacao, now: Date): Analise {
  const status = s.status;
  const jaComecou = new Date(s.check_in_at).getTime() <= now.getTime() || !!s.checked_in_at;
  const viva = status === "pending" || status === "confirmed";
  const pag = pagamentoDaReserva(s.payments ?? []);
  const avisos: string[] = [];

  // Cancelamento, pelas duas pontas, com a função da Edge.
  const comum = {
    bookingStatus: status,
    paymentStatus: pag?.status ?? null,
    alreadyRefunded: !!pag?.refunded_at,
    checkInAt: s.check_in_at,
    fareCancelUntil: s.fare_cancel_until,
    now,
  };
  const doCliente = refundDecision({ ...comum, actor: "customer" });
  const daEquipe = refundDecision({ ...comum, actor: "staff" });
  const estornoCents = pag && pag.status === "paid" && !pag.refunded_at ? centavos(pag.amount) : 0;
  const rotuloCancel = (d: typeof doCliente): string => {
    if (d.action === "cancel_with_refund") return "com estorno integral do pagamento da reserva";
    if (d.action === "cancel_no_refund") {
      return d.reason === "pending" ? "sim, sem estorno (não foi paga)" : "sim, sem estorno (" +
        (d.reason === "already_refunded" ? "já estornada" : "pagamento não aprovado") + ")";
    }
    if (d.action === "blocked") return "não: a janela de cancelamento da tarifa já fechou";
    return d.reason === "already_cancelled" ? "não: já está cancelada" : "não: a reserva já começou ou terminou";
  };
  // A RPC cancel_booking_with_release recusa reserva já iniciada, nem a equipe passa disso.
  const equipeCancela = daEquipe.action === "noop"
    ? rotuloCancel(daEquipe)
    : s.checked_in_at
      ? "não: o veículo já entrou"
      : rotuloCancel(daEquipe);

  // Trocar datas. Pendente reprecifica sem cobrar; confirmada cobra ou estorna a diferença, e só
  // antes da data de entrada (change-booking-dates-paid recusa "a reserva já começou").
  let datasMotivo: string | null = null;
  if (!viva) datasMotivo = "a reserva não está pendente nem confirmada";
  else if (jaComecou) datasMotivo = "a data de entrada já passou: o sistema não devolve diárias não usadas";
  const datasAberto = viva && !jaComecou;
  const clienteTrocaDatas = datasAberto && dateChangeAllowed(s.fare_benefits, false);
  if (datasAberto && !clienteTrocaDatas) datasMotivo = "a tarifa do cliente não inclui alterar datas";

  // Trocar veículo.
  const veiculoAberto = vehicleChangeOpen(status, s.checked_in_at);
  const clienteTrocaPlaca = veiculoAberto && plateChangeAllowed(s.fare_benefits, false);
  let placaMotivo: string | null = null;
  if (!veiculoAberto) placaMotivo = "o veículo já entrou ou a reserva não está ativa";
  else if (!clienteTrocaPlaca) placaMotivo = "a tarifa do cliente não inclui trocar placa";

  // Upgrade: o cliente compra na conta dele, ou a equipe gera o PIX pela tela da reserva (26/11/2026).
  const atual = s.fare_tier ?? "basica";
  const precoAtual = s.fare_price_cents ?? 0;
  const benefAtual = s.fare_benefits;
  let upgradeMotivo: string | null = null;
  const upgradeAberto = viva && new Date(s.check_in_at).getTime() > now.getTime();
  if (!upgradeAberto) upgradeMotivo = "upgrade só antes da entrada, com a reserva pendente ou confirmada";
  const opcoes = upgradeAberto
    ? (s.fares ?? [])
      .filter((f) => ORDEM_TARIFA.indexOf(f.tier) > ORDEM_TARIFA.indexOf(atual) && f.price_cents > precoAtual)
      .map((f) => ({
        tarifa: f.label || ROTULO_TARIFA[f.tier],
        diferenca: reais(f.price_cents - precoAtual),
        libera: oQueLibera(benefAtual, f.benefits),
      }))
    : [];
  if (upgradeAberto && !opcoes.length) upgradeMotivo = "a reserva já está na tarifa mais alta";

  const checkOutBloqueado = status === "checked_in" && protecaoDeVooAberta(s);
  // Parte 2 (26/11/2026): depois da entrada, a saída se estende pela tela, não pela Mia.
  const noPatio = ["confirmed", "checked_in", "completed"].includes(status) && !s.checked_out_at;
  if (jaComecou && noPatio && !protecaoDeVooAberta(s)) {
    avisos.push("Depois da entrada, a saída se estende pela tela da reserva: no card Dias a mais, escolha a saída e toque em Cobrar pelo Hub. A diferença sai da tabela da compra e vai num PIX. Sair antes não devolve nada.");
  }
  if (checkOutBloqueado) {
    avisos.push("Proteção de voo acionada: registre a saída pela tela da reserva, que pede a hora real e o excedente cobrado no balcão.");
  }
  if (s.location?.checkout_mode && s.location.checkout_mode !== "hub") {
    avisos.push("Esta unidade vende fora do Hub: confira no sistema do estacionamento antes de prometer alteração.");
  }

  const outros = (s.payments ?? [])
    .filter((p) => (p.kind ?? "booking") !== "booking")
    .map((p) => {
      const tipo = p.kind === "fare_upgrade" ? "upgrade de tarifa" : p.kind === "date_change" ? "diferença de troca de datas" : p.kind;
      return `${tipo}: ${reais(centavos(p.amount))} (${ROTULO_PAGAMENTO[p.status] ?? p.status}${p.refunded_at && p.status !== "refunded" ? ", estornado" : ""})`;
    });
  if (outros.some((o) => !o.includes("estornado")) && estornoCents > 0) {
    avisos.push("Cancelar estorna só o pagamento da reserva. Pagamentos de upgrade ou de troca de datas não entram nesse estorno.");
  }

  const prazo = s.fare_cancel_until;
  return {
    codigo: s.code,
    status,
    status_legivel: ROTULO_RESERVA[status] ?? status,
    tarifa: s.fare_tier ? ROTULO_TARIFA[s.fare_tier] : null,
    entrada_prevista: quando(s.check_in_at),
    saida_prevista: quando(s.check_out_at),
    entrou_em: s.checked_in_at ? quando(s.checked_in_at) : null,
    saiu_em: s.checked_out_at ? quando(s.checked_out_at) : null,
    ja_comecou: jaComecou,
    dinheiro: {
      total_da_reserva: reais(centavos(s.total_amount)),
      pagamento_da_reserva: pag
        ? `${reais(centavos(pag.amount))} por ${ROTULO_METODO[pag.method ?? ""] ?? pag.method ?? "meio não informado"}` +
          `${pag.installments && pag.installments > 1 ? ` em ${pag.installments}x` : ""}, ${ROTULO_PAGAMENTO[pag.status] ?? pag.status}`
        : null,
      estornado: pag?.refunded_at
        ? `${reais(centavos(pag.refunded_amount ?? pag.amount))} em ${quando(pag.refunded_at)}`
        : null,
      outros_pagamentos: outros,
    },
    janela_de_cancelamento: {
      ate: prazo ? quando(prazo) : null,
      cliente_ainda_cancela_com_estorno: withinFreeWindow(s.check_in_at, now, prazo),
    },
    pode_agora: {
      cancelar: {
        pelo_cliente: rotuloCancel(doCliente),
        pela_equipe: equipeCancela,
        estorno: daEquipe.action === "cancel_with_refund" && estornoCents > 0 ? reais(estornoCents) : null,
      },
      alterar_datas: {
        pelo_cliente: clienteTrocaDatas,
        pela_equipe: datasAberto,
        como: datasAberto
          ? status === "pending"
            ? "reprecifica sem cobrar (a reserva ainda não foi paga)"
            : "cobra a diferença por PIX ou estorna parte do valor na mesma forma de pagamento"
          : null,
        motivo: datasMotivo,
      },
      trocar_veiculo: { pelo_cliente: clienteTrocaPlaca, pela_equipe: veiculoAberto, motivo: placaMotivo },
      check_in: status === "confirmed",
      check_out: status === "checked_in" && !checkOutBloqueado,
      upgrade: { possivel: opcoes.length > 0, opcoes, motivo: upgradeMotivo },
    },
    avisos,
  };
}

// ── Proposta de ação ───────────────────────────────────────────────────────────

export type AcaoKind = "cancel" | "change_dates" | "change_vehicle" | "check_in" | "check_out";
export const ACOES: AcaoKind[] = ["cancel", "change_dates", "change_vehicle", "check_in", "check_out"];

/** Escopo exigido por ação, na proposta e de novo no clique. */
export const ESCOPO_DA_ACAO: Record<AcaoKind, string> = {
  cancel: "bookings:cancel",
  change_dates: "bookings:write",
  change_vehicle: "bookings:write",
  check_in: "bookings:checkin",
  check_out: "bookings:checkin",
};

export interface Cotacao {
  available: boolean;
  current_total_cents?: number;
  reason: string | null;
  /** Nulo quando a unidade não vende a duração pedida (estadia mínima da tabela). */
  delta_cents: number | null;
  new_total_cents: number | null;
  days: number;
  /** De onde saiu o preço (17/11/2026): a tabela guardada na compra ou, em reserva antiga, a de hoje. */
  price_source?: "compra" | "hoje";
}

export interface ParametrosDaAcao {
  check_in_at?: string;
  check_out_at?: string;
  license_plate?: string;
  model?: string;
  color?: string;
  reason?: string;
}

export type Proposta =
  | { ok: true; summary: string; effect_cents: number | null; params: Record<string, unknown> }
  | { ok: false; erro: string };

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** "abc-1d23" → "ABC1D23". Placa fora do padrão Mercosul/antigo é recusada antes de propor. */
export function normalizarPlaca(bruta: string | undefined): string | null {
  const p = (bruta ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PLACA.test(p) ? p : null;
}

export function montarProposta(input: {
  kind: string;
  s: Situacao;
  now: Date;
  scopes: string[];
  params: ParametrosDaAcao;
  cotacao?: Cotacao | null;
}): Proposta {
  const { s, now, scopes, params } = input;
  if (!(ACOES as string[]).includes(input.kind)) {
    return { ok: false, erro: `Ação desconhecida: ${input.kind}. Use ${ACOES.join(", ")}.` };
  }
  const kind = input.kind as AcaoKind;
  const escopo = ESCOPO_DA_ACAO[kind];
  if (!scopes.includes(escopo)) {
    return { ok: false, erro: "O seu papel nesta empresa não permite essa ação. Peça ao Dono ou ao Gerente." };
  }
  const a = analisarReserva(s, now);
  // Sem a pontuação final: o resumo já fecha a frase ("Motivo: x."), e o modelo costuma mandar com ponto.
  const motivo = (params.reason ?? "").trim().replace(/[.!;\s]+$/, "");

  switch (kind) {
    case "cancel": {
      if (!motivo) return { ok: false, erro: "Diga o motivo do cancelamento (reason)." };
      if (a.pode_agora.cancelar.pela_equipe.startsWith("não")) {
        return { ok: false, erro: `Não dá para cancelar: ${a.pode_agora.cancelar.pela_equipe.replace(/^não: /, "")}.` };
      }
      const pag = pagamentoDaReserva(s.payments ?? []);
      const estorno = a.pode_agora.cancelar.estorno ? centavos(pag?.amount) : 0;
      const foraDaJanela = s.status === "confirmed" && estorno > 0 && !a.janela_de_cancelamento.cliente_ainda_cancela_com_estorno;
      const resumo = estorno > 0
        ? `Cancelar a reserva ${s.code} e estornar ${reais(estorno)} ao cliente, na mesma forma de pagamento.` +
          (foraDaJanela ? " A janela da tarifa já fechou: isto é uma exceção concedida pela equipe." : "")
        : `Cancelar a reserva ${s.code}. Não há estorno: ${a.pode_agora.cancelar.pela_equipe.match(/\(([^)]+)\)/)?.[1] ?? "nada a devolver"}.`;
      return { ok: true, summary: `${resumo} Motivo: ${motivo}.`, effect_cents: estorno > 0 ? -estorno : null, params: { reason: motivo } };
    }
    case "change_dates": {
      const ini = params.check_in_at;
      const fim = params.check_out_at;
      if (!ini || !fim || Number.isNaN(Date.parse(ini)) || Number.isNaN(Date.parse(fim))) {
        return { ok: false, erro: "Informe check_in_at e check_out_at em ISO 8601 com fuso." };
      }
      if (Date.parse(fim) <= Date.parse(ini)) return { ok: false, erro: "A saída precisa ser depois da entrada." };
      if (!a.pode_agora.alterar_datas.pela_equipe) {
        return { ok: false, erro: `Não dá para alterar as datas: ${a.pode_agora.alterar_datas.motivo ?? "reserva fechada"}.` };
      }
      const c = input.cotacao;
      if (!c) return { ok: false, erro: "Cote as novas datas antes de propor." };
      if (!c.available || c.delta_cents == null || c.new_total_cents == null) {
        return { ok: false, erro: c.reason ?? "Não há vaga nas novas datas." };
      }
      const novas = `entrada ${quando(ini)} e saída ${quando(fim)}`;
      if (s.status === "pending") {
        return {
          ok: true,
          summary: `Alterar a reserva ${s.code} para ${novas}. Ela ainda não foi paga: o novo total passa a ser ${reais(c.new_total_cents)}.`,
          effect_cents: null,
          params: { check_in_at: ini, check_out_at: fim },
        };
      }
      const d = c.delta_cents;
      const up = upgradeParaTrocarDatas(s);
      // Básica sem diferença a cobrar: o upgrade vem antes, e isso a tela da reserva faz (gera o PIX
      // do upgrade e troca quando ele entra). A proposta da Mia não tem esse segundo passo.
      if (up > 0 && d <= 0) {
        return {
          ok: false,
          erro: `No plano Básica, alterar datas exige o upgrade para o Flex (${reais(up)}), pago antes da troca. Use o botão Alterar datas na tela da reserva: ele gera o PIX do upgrade e faz a troca quando o pagamento entra.`,
        };
      }
      const efeito = d < 0
        ? `e estornar ${reais(-d)} ao cliente, na mesma forma de pagamento.`
        : d > 0
          ? up > 0
            ? `e gerar um PIX de ${reais(d + up)} para o cliente pagar: ${reais(d)} das diárias e ${reais(up)} do upgrade para o Flex, que o plano Básica exige. As datas só mudam quando o PIX for pago.`
            : `e gerar um PIX de ${reais(d)} para o cliente pagar. As datas só mudam quando o PIX for pago.`
          : "sem diferença de valor.";
      return {
        ok: true,
        summary: `Alterar a reserva ${s.code} para ${novas} ${efeito}`,
        effect_cents: d === 0 ? null : d + (d > 0 ? up : 0),
        // A diferença que o operador vê no cartão: se a cotação mudar até o clique, a Edge recusa.
        params: { check_in_at: ini, check_out_at: fim, expected_delta_cents: d },
      };
    }
    case "change_vehicle": {
      const placa = normalizarPlaca(params.license_plate);
      if (!placa) return { ok: false, erro: "Placa inválida. Use o formato ABC1D23 ou ABC1234." };
      if (!motivo) return { ok: false, erro: "Diga o motivo da troca (reason): ele fica no histórico e explica por que o voucher mudou." };
      if (!a.pode_agora.trocar_veiculo.pela_equipe) {
        return { ok: false, erro: `Não dá para trocar o veículo: ${a.pode_agora.trocar_veiculo.motivo}.` };
      }
      const desc = [params.model, params.color].filter((x) => x && x.trim()).join(", ");
      return {
        ok: true,
        summary: `Trocar o veículo da reserva ${s.code} para a placa ${placa}${desc ? ` (${desc})` : ""}. O voucher é refeito. Motivo: ${motivo}.`,
        effect_cents: null,
        params: { license_plate: placa, model: params.model ?? null, color: params.color ?? null, reason: motivo },
      };
    }
    case "check_in": {
      if (!a.pode_agora.check_in) return { ok: false, erro: `Check-in só em reserva confirmada (está ${ROTULO_RESERVA[s.status] ?? s.status}).` };
      return { ok: true, summary: `Registrar agora a entrada do veículo da reserva ${s.code}.`, effect_cents: null, params: {} };
    }
    case "check_out": {
      if (s.status === "checked_in" && protecaoDeVooAberta(s)) {
        return { ok: false, erro: "A proteção de voo foi acionada: registre a saída pela tela da reserva, que pede a hora real e o excedente." };
      }
      if (!a.pode_agora.check_out) return { ok: false, erro: `Check-out só depois do check-in (está ${ROTULO_RESERVA[s.status] ?? s.status}).` };
      return { ok: true, summary: `Registrar agora a saída do veículo da reserva ${s.code}.`, effect_cents: null, params: {} };
    }
  }
}
