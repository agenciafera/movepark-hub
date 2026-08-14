// Lógica pura das avaliações do Google. Sem React/Supabase → testável (Vitest).

/** Limite de cache do Google para conteúdo do Places que não seja o place_id. */
export const GOOGLE_CACHE_DAYS = 30;

/**
 * O HTML do SSG também é cache: uma página construída há 40 dias carrega conteúdo do Google
 * fora do prazo. O componente confere no cliente e não renderiza, mesmo que a policy do banco
 * já tenha escondido a linha para quem consulta agora.
 */
export function isSnapshotFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return age < GOOGLE_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

export type BadgeChoice =
  | { source: "movepark"; avg: number; count: number }
  | { source: "google"; avg: number; count: number }
  | null;

/**
 * O card de busca mostra UM selo só: em 375px, dois selos viram ruído e nenhuma das notas é
 * lida. Prioridade para a Movepark, que é a nota que a gente controla e que o cliente entende
 * como "de quem reservou aqui". A do Google preenche o vazio.
 */
export function pickCardBadge(
  movepark: { avg: number | null; count: number },
  google: { rating: number | null; count: number } | null,
): BadgeChoice {
  if (movepark.avg != null && movepark.count > 0) {
    return { source: "movepark", avg: movepark.avg, count: movepark.count };
  }
  if (google?.rating != null && google.count > 0) {
    return { source: "google", avg: google.rating, count: google.count };
  }
  return null;
}
