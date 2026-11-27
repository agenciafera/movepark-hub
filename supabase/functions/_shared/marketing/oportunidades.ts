// Oportunidades de hoje: as jogadas do manual do agente, cada uma com o segmento pronto e o público
// medido agora. O segmento do cartão é o mesmo que o botão "Montar esse público" monta, então o
// número do cartão e o da prévia são a mesma conta (marketing_segment_summaries usa o mesmo
// avaliador do preview). Spec: docs/specs/assistente-marketing-proativo.md § 4.
//
// O cartão mostra público e ticket médio, nunca receita esperada: prometer resultado é proibido.

import { calendario } from "./calendario.ts";

type Regra = { field: string; op: string; value?: unknown };
export type Definicao = { match: "all" | "any"; rules: Regra[] };

export type Jogada = {
  chave: string;
  titulo: string;
  porQue: string;
  pedido: string;
  definition: Definicao;
};

export type Oportunidade = {
  chave: string;
  titulo: string;
  por_que: string;
  publico: number;
  alcance_email: number;
  ticket_medio: number | null;
  definition: Definicao;
  pedido: string;
};

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const FIXAS: Jogada[] = [
  {
    chave: "abandono_recente",
    titulo: "Abandonou o checkout nas últimas 24 horas",
    porQue: "Começou a reserva e não pagou. Quem volta sozinho volta em poucas horas, então o contato vale hoje.",
    pedido: "Quero recuperar quem abandonou o checkout nas últimas 24 horas",
    definition: { match: "all", rules: [{ field: "abandoned_hours_ago", op: "lte", value: 24 }] },
  },
  {
    chave: "segunda_compra",
    titulo: "Voltou de viagem nos últimos 3 dias",
    porQue: "Fez a primeira viagem com a Movepark e ainda não marcou a próxima. A experiência está fresca.",
    pedido: "Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias",
    definition: {
      match: "all",
      rules: [
        { field: "bookings_count", op: "eq", value: 1 },
        { field: "days_since_return", op: "between", value: [1, 3] },
        { field: "has_upcoming_trip", op: "is_false" },
      ],
    },
  },
  {
    chave: "troca_flex",
    titulo: "Viaja nesta semana na tarifa Básica",
    porQue: "Viaja nos próximos 7 dias na Básica. Dá para oferecer a troca para a Flex antes da entrada.",
    pedido: "Quero oferecer a troca para a Flex a quem viaja nesta semana na Básica",
    definition: {
      match: "all",
      rules: [
        { field: "days_until_next_trip", op: "lte", value: 7 },
        { field: "next_trip_fare_tier", op: "eq", value: "basica" },
      ],
    },
  },
];

const INDICACAO: Jogada = {
  chave: "indicacao",
  titulo: "Deu nota 5 na última avaliação",
  porQue: "Avaliou a estadia com nota máxima. É o público para pedir indicação.",
  pedido: "Quero pedir indicação a quem deu nota 5",
  definition: { match: "all", rules: [{ field: "last_rating", op: "eq", value: 5 }] },
};

/** A data do calendário cuja janela de envio está aberta ou abre em até 14 dias, se houver. */
function jogadaDoFeriado(hoje: string): Jogada | null {
  const d = calendario(hoje, 60).find((x) => x.janela_ate >= hoje && x.abre_em_dias <= 14);
  if (!d) return null;
  return {
    chave: "feriado",
    titulo: d.aproximada ? `${d.nome}, por volta de ${ddmm(d.data)}` : `${d.nome} em ${ddmm(d.data)}`,
    porQue: `A janela de envio vai de ${ddmm(d.janela_de)} a ${ddmm(d.janela_ate)}. Público: quem já comprou e não tem viagem marcada.`,
    pedido: `Quero montar a campanha de ${d.nome} para quem já comprou e não tem viagem marcada`,
    definition: {
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 1 },
        { field: "has_upcoming_trip", op: "is_false" },
      ],
    },
  };
}

/** As jogadas de hoje, na ordem do dinheiro mais perto para o mais longe. */
export function jogadasDeHoje(hoje: string): Jogada[] {
  const feriado = jogadaDoFeriado(hoje);
  return [...FIXAS, ...(feriado ? [feriado] : []), INDICACAO];
}

type Resumo = { chave: string; publico: number; alcance_email: number; ticket_medio: number | null };

export async function oportunidadesDeHoje(
  rpc: Rpc,
  locationIds: string[] | null,
  hoje: string,
): Promise<{ data: string; oportunidades: Oportunidade[] }> {
  const jogadas = jogadasDeHoje(hoje);
  const resumos = ((await rpc("marketing_segment_summaries", {
    p_items: jogadas.map((j) => ({ chave: j.chave, definition: j.definition })),
    p_location_ids: locationIds,
  })) ?? []) as Resumo[];
  const porChave = new Map(resumos.map((r) => [r.chave, r]));
  const oportunidades = jogadas
    .map((j): Oportunidade => {
      const r = porChave.get(j.chave);
      return {
        chave: j.chave,
        titulo: j.titulo,
        por_que: j.porQue,
        publico: Number(r?.publico ?? 0),
        alcance_email: Number(r?.alcance_email ?? 0),
        ticket_medio: r?.ticket_medio === null || r?.ticket_medio === undefined ? null : Number(r.ticket_medio),
        definition: j.definition,
        pedido: j.pedido,
      };
    })
    .filter((o) => o.publico > 0);
  return { data: hoje, oportunidades };
}
