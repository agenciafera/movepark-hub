import type { LocationOccupancyRow } from "@/types/domain";

export type OccupancyCell = {
  date: string;
  capacity: number;
  booked: number;
  /** Ocupação 0..1 (booked/capacity; 0 quando capacity = 0). */
  pct: number;
  /** Data bloqueada pelo estacionamento (não aceita reservas). */
  blocked: boolean;
};

export type OccupancyMatrixRow = {
  lptId: string;
  name: string;
  cells: Record<string, OccupancyCell>;
};

export type OccupancyMatrix = {
  dates: string[];
  rows: OccupancyMatrixRow[];
};

/** Pivota as linhas (lpt × data) numa matriz de tipos de vaga por data. */
export function buildOccupancyMatrix(rows: LocationOccupancyRow[]): OccupancyMatrix {
  const dateSet = new Set<string>();
  const byLpt = new Map<string, OccupancyMatrixRow>();

  for (const r of rows) {
    dateSet.add(r.date);
    let row = byLpt.get(r.location_parking_type_id);
    if (!row) {
      row = { lptId: r.location_parking_type_id, name: r.parking_type_name, cells: {} };
      byLpt.set(r.location_parking_type_id, row);
    }
    const pct = r.capacity > 0 ? r.booked_count / r.capacity : 0;
    row.cells[r.date] = {
      date: r.date,
      capacity: r.capacity,
      booked: r.booked_count,
      pct,
      blocked: r.blocked ?? false,
    };
  }

  const dates = Array.from(dateSet).sort();
  const matrixRows = Array.from(byLpt.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { dates, rows: matrixRows };
}

/**
 * Ocupação efetiva somando o vendido no WL (E2.5.1).
 * count = reservas do hub + vendidas no WL; pct limitado a 1 (overbooking aparece como cheio).
 */
export function withExternal(
  booked: number,
  external: number,
  capacity: number,
): { count: number; pct: number } {
  const count = booked + external;
  const pct = capacity > 0 ? Math.min(count / capacity, 1) : 0;
  return { count, pct };
}

/** Meses (ano+mês 1-12) cobertos por um intervalo de datas [from, to] (YYYY-MM-DD). */
export function monthsInRange(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: { year: number; month: number }[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Grade de um mês como semanas (domingo→sábado) de datas YYYY-MM-DD; `null` é célula de
 * preenchimento (antes do dia 1 ou depois do último dia). month é 1-12.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = domingo
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  const mm = String(month).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ------------------------------------------------------------------ *
 * Escala de ocupação (cor + contraste)
 * ------------------------------------------------------------------ */

/** Tinta navy do design system (navy-ink). */
export const INK_HEX = "#29263F";
/** Canvas branco puro. */
export const WHITE_HEX = "#FFFFFF";

/**
 * Escala sequencial de 5 degraus, do vazio ao lotado.
 *
 * Escolha de cor (DESIGN.md): a rampa usa a família neutra navy/steel do sistema
 * (do surface-strong #E0E5F2 até o navy-ink #29263F), NÃO o violeta. A "Regra do Violeta
 * Reservado" diz que o violeta é a cor de ação (no máximo 10% da tela); pintar o calendário
 * inteiro com ele roubaria esse sinal e ainda transformaria a cor de CTA numa escala
 * quantitativa. O navy é a cor de profundidade do sistema e, principalmente, tem um extremo
 * escuro de verdade: é o que permite texto com contraste AA (4,5:1) em TODOS os degraus, o
 * que uma rampa de opacidade sobre branco nunca alcança (o violeta a 92% de alpha dá 4,19:1
 * com texto branco e 3,47:1 com texto navy: reprova nos dois).
 *
 * A cor do texto de cada degrau é escolhida pela LUMINÂNCIA do fundo (pickTextColor), não
 * pelo percentual de ocupação.
 */
export const OCCUPANCY_SCALE = [
  { bg: "#F1F4FA", label: "Até 20%" },
  { bg: "#DDE4F0", label: "20% a 40%" },
  { bg: "#B8C6DD", label: "40% a 60%" },
  { bg: "#5A6E92", label: "60% a 80%" },
  { bg: "#29263F", label: "80% ou mais" },
] as const;

/** Luminância relativa (WCAG 2.x) de uma cor hexadecimal #RRGGBB. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Razão de contraste WCAG entre duas cores hexadecimais (1:1 a 21:1). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor do texto por luminância do fundo: vence quem tiver o maior contraste. */
export function pickTextColor(bg: string): string {
  return contrastRatio(bg, WHITE_HEX) >= contrastRatio(bg, INK_HEX) ? WHITE_HEX : INK_HEX;
}

/** Degrau (0 a 4) da escala para uma ocupação 0..1. */
export function occupancyStep(pct: number): 0 | 1 | 2 | 3 | 4 {
  const p = Math.min(Math.max(pct, 0), 1);
  if (p < 0.2) return 0;
  if (p < 0.4) return 1;
  if (p < 0.6) return 2;
  if (p < 0.8) return 3;
  return 4;
}

/** Estilo (fundo + texto) da célula do dia para uma ocupação 0..1. */
export function occupancyStyle(pct: number): { backgroundColor: string; color: string } {
  const { bg } = OCCUPANCY_SCALE[occupancyStep(pct)];
  return { backgroundColor: bg, color: pickTextColor(bg) };
}

/* ------------------------------------------------------------------ *
 * Rótulo acessível da célula do dia
 * ------------------------------------------------------------------ */

const MONTH_NAMES_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-07-15" vira "15 de julho". */
export function formatDayLong(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  return `${day} de ${MONTH_NAMES_LONG[month - 1]}`;
}

/**
 * Nome acessível completo da célula do dia. Sem ele o leitor de tela anuncia "141100"
 * (dia colado na contagem) e um Enter bloqueia a venda da data sem aviso.
 */
export function buildDayAriaLabel(d: {
  date: string;
  count: number;
  capacity: number;
  blocked: boolean;
}): string {
  const dia = formatDayLong(d.date);
  if (d.blocked) {
    return `${dia}, vendas bloqueadas nesta data. Liberar vendas nesta data`;
  }
  const over = d.count > d.capacity;
  const pct = d.capacity > 0 ? Math.round((d.count / d.capacity) * 100) : 0;
  const ocupacao = `${d.count} de ${d.capacity} vagas ocupadas`;
  const extra = over ? ", overbooking" : ` (${pct}%)`;
  return `${dia}, ${ocupacao}${extra}. Bloquear vendas nesta data`;
}
