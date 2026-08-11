#!/usr/bin/env node
/**
 * Filtro `clean` do git para o cache do Windup.
 *
 * O cache precisa estar no git: é ele que faz o replay custar $0 sem LLM, e o CI
 * clona do zero. Sem ele, todos os cenários dão cache miss, o runner não tem o
 * CLI de planejamento, e o job inteiro fica vermelho. Foi o que aconteceu entre
 * 10 e 11/08/2026, quando o cache saiu do git.
 *
 * O problema que motivou a saída era real: cada replay reescreve
 * `stats.last_replayed_at`, `replay_count` e `replay_failures` em ~161 arquivos,
 * e esse ruído aparecia em todo `git status` e entrava em commit sem querer.
 *
 * Este filtro resolve os dois: o git enxerga sempre a versão com os contadores
 * zerados, então rodar o Windup não suja mais a árvore, e o plano (que é o que
 * importa para o replay) continua versionado.
 *
 * Configurado por `scripts/setup-git-filters.mjs`, que roda no `bun install`.
 * Sem a configuração, nada quebra: o git passa a ver os contadores, e volta o
 * ruído antigo. Degrada para o incômodo, nunca para o CI vermelho.
 */

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (entrada += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(entrada);
    if (d && typeof d === "object" && d.stats && typeof d.stats === "object") {
      // `created_at` e `plan_generation` descrevem o plano, e ficam. O resto é
      // contador de execução, e é o que muda a cada rodada.
      d.stats.last_replayed_at = null;
      d.stats.replay_count = 0;
      d.stats.replay_failures = 0;
      process.stdout.write(`${JSON.stringify(d, null, 2)}\n`);
      return;
    }
  } catch {
    // Não é JSON que eu entenda: passa adiante intacto. Um filtro que corrompe
    // arquivo é muito pior que um filtro que não filtra.
  }
  process.stdout.write(entrada);
});
