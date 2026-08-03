/**
 * Lógica pura da tela de reservas do cliente (design "Minha Conta Cliente").
 * Tudo aqui é derivado da lista que a conta já busca, sem consulta nova: um número
 * que não bate com a lista logo acima dele é pior que número nenhum.
 */

import { bucketBooking, type MyBookingStatus } from "@/features/bookings/bookings.logic";
import type { MyBookingListItem } from "@/features/bookings/customerApi";

/** Diárias da reserva (vaga-dia): dias de calendário ocupados, mínimo 1. */
export function nightsOf(b: Pick<MyBookingListItem, "check_in_at" | "check_out_at">): number {
  const start = new Date(b.check_in_at);
  const end = new Date(b.check_out_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  // O check-out conta pelo instante anterior: sair às 00:00 não ocupa o dia da saída.
  const last = new Date(end.getTime() - 1);
  const diff = Math.round((day(last) - day(start)) / 86_400_000);
  return Math.max(1, diff + 1);
}

/**
 * A reserva em foco no topo da tela: a que está em uso, se houver; senão a próxima a
 * acontecer. Volta null quando não há nenhuma das duas.
 */
export function activeBooking(
  items: MyBookingListItem[],
  now: Date = new Date(),
): MyBookingListItem | null {
  const emUso = items.filter((b) => bucketBooking(b, now) === "active");
  if (emUso.length > 0) {
    // Mais de uma em uso é raro, mas existe: fica a de check-in mais recente.
    return emUso.reduce((a, b) => (a.check_in_at >= b.check_in_at ? a : b));
  }
  const futuras = items.filter((b) => bucketBooking(b, now) === "upcoming");
  if (futuras.length === 0) return null;
  return futuras.reduce((a, b) => (a.check_in_at <= b.check_in_at ? a : b));
}

export type YearToDate = {
  spent: number;
  stays: number;
  nights: number;
  cashback: number;
  topDestination: string | null;
};

type CashbackEntry = { amount_cents: number; kind: string; created_at: string };

/**
 * O ano até agora: só o que já foi consumido conta. Reserva futura ainda não é
 * estadia, e cancelada nunca foi.
 */
export function yearToDate(
  items: MyBookingListItem[],
  transactions: CashbackEntry[] = [],
  now: Date = new Date(),
): YearToDate {
  const year = now.getFullYear();
  const doAno = items.filter((b) => {
    const d = new Date(b.check_in_at);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return false;
    const bucket = bucketBooking(b, now);
    return bucket === "history" || bucket === "active";
  });

  const destinos = new Map<string, number>();
  for (const b of doAno) {
    const dest = b.location.destination;
    const nome = dest?.short_name || dest?.city;
    if (nome) destinos.set(nome, (destinos.get(nome) ?? 0) + 1);
  }
  let topDestination: string | null = null;
  let melhor = 0;
  for (const [nome, qtd] of destinos) {
    if (qtd > melhor) {
      melhor = qtd;
      topDestination = nome;
    }
  }

  const cashback = transactions
    .filter((t) => t.kind === "cashback" && new Date(t.created_at).getFullYear() === year)
    .reduce((sum, t) => sum + t.amount_cents, 0);

  return {
    spent: doAno.reduce((sum, b) => sum + b.total_amount, 0),
    stays: doAno.length,
    nights: doAno.reduce((sum, b) => sum + nightsOf(b), 0),
    cashback: cashback / 100,
    topDestination,
  };
}

export type HistoryFilter = { id: MyBookingStatus | "all"; label: string; count: number };

/**
 * Os chips do histórico. Só entra o que tem resultado: filtro que sempre volta vazio
 * é convite pra o usuário achar que a tela quebrou.
 */
export function historyFilters(
  items: MyBookingListItem[],
  now: Date = new Date(),
): HistoryFilter[] {
  const rotulos: { id: MyBookingStatus; label: string }[] = [
    { id: "upcoming", label: "Próximas" },
    { id: "active", label: "Em uso" },
    { id: "history", label: "Concluídas" },
    { id: "cancelled", label: "Canceladas" },
  ];
  const contagem = new Map<MyBookingStatus, number>();
  for (const b of items) {
    const bucket = bucketBooking(b, now);
    contagem.set(bucket, (contagem.get(bucket) ?? 0) + 1);
  }
  const comResultado = rotulos
    .map((r) => ({ ...r, count: contagem.get(r.id) ?? 0 }))
    .filter((r) => r.count > 0);
  if (comResultado.length === 0) return [];
  return [{ id: "all" as const, label: "Todas", count: items.length }, ...comResultado];
}

export type Page<T> = {
  items: T[];
  /** Página em exibição, já corrigida se veio fora do intervalo. */
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
};

/**
 * Recorta a lista em páginas. A página vem corrigida pro intervalo válido: mudar
 * de filtro encurta a lista, e uma página 5 que não existe mais deixaria a tela
 * vazia sem explicação.
 */
export function paginate<T>(items: T[], page: number, perPage = 10): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const atual = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (atual - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: atual,
    pages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, total),
  };
}
