/**
 * Ordem da vitrine da home quando o ranking de vendas acaba.
 *
 * O ranking é por reservas confirmadas, e hoje quatro unidades respondem por todas elas. O
 * resto do catálogo empata em zero, e no empate a ordem caía sempre na mesma sequência
 * (avaliações, `popular_sort_order`, data de cadastro): as mesmas unidades apareciam para
 * sempre, e quem entrou depois nunca tinha vez, mesmo com preço e fotos prontos.
 *
 * Aqui a parte com histórico continua intocada, por venda, e só a cauda sem venda é
 * embaralhada. A semente é o dia, não o relógio: a home não se remexe a cada refresh nem a
 * cada re-render, e muda sozinha no dia seguinte.
 */

/** Linha do ranking: só a contagem importa para decidir onde termina o histórico. */
export type RankedRow = { bookings_count?: number | null };

/** `20260812` para 12/08/2026. Usa a data local, que é o dia que o visitante está vivendo. */
export function dailySeed(now: Date): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** PRNG determinístico (mulberry32): mesma semente, mesma sequência, sem dependência. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates com semente. Não altera o array recebido. */
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Mantém quem já vendeu na ordem do ranking e embaralha o resto.
 *
 * Sem `bookings_count` (RPC antiga, ou dado ausente) a linha conta como sem venda, então o
 * pior caso é a vitrine inteira embaralhada, nunca uma lista vazia.
 */
export function orderPopularRows<T extends RankedRow>(rows: T[], seed: number): T[] {
  const comVenda = rows.filter((r) => (r.bookings_count ?? 0) > 0);
  const semVenda = rows.filter((r) => (r.bookings_count ?? 0) === 0);
  return [...comVenda, ...shuffleWithSeed(semVenda, seed)];
}
