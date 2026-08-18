/**
 * Declaração de tipo do `edge-functions-parity.logic.mjs`.
 *
 * Existe pelo mesmo motivo da irmã `sitemap-split.logic.d.mts`: o `tsconfig.app.json` cobre
 * `src`, e sem ela o import de um `.mjs` de fora quebra o `bun run typecheck`.
 */

export interface AchadosDeParidade {
  /** Publicada e sem fonte no repo. Código que roda sem poder ser revisado. */
  soEmProducao: string[];
  /** No repo, fora do ar e sem justificativa. Quem chamar leva 404. */
  esquecidas: string[];
  /** No repo e fora do ar por decisão registrada. Reportadas, não reprovam. */
  pendentesAtivas: string[];
  /** Declaradas como pendentes mas já publicadas. A allowlist ficou mentindo. */
  pendentesObsoletas: string[];
  /** Bloco `[functions.X]` no config.toml sem pasta correspondente. */
  declaradasSemPasta: string[];
  /** Falso se qualquer lista de falha estiver preenchida. */
  ok: boolean;
}

export function compararParidade(entrada: {
  publicadas?: string[];
  pastas?: string[];
  declaradas?: string[];
  pendentes?: Record<string, string>;
}): AchadosDeParidade;
