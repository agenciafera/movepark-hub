/**
 * Lógica pura da paridade das Edge Functions: recebe as listas e devolve os achados. Não fala
 * com a rede nem com o disco, para o teste (`src/lib/edgeFunctionsParity.test.ts`) rodar sem
 * fixture nem token. O I/O mora em `scripts/check-edge-functions.mjs`.
 *
 * Por que a paridade importa está no cabeçalho daquele arquivo e em docs/specs/public-api.md §14.
 */

/**
 * Compara o que está publicado com o que está no repo, nos dois sentidos.
 *
 * @param {object} entrada
 * @param {string[]} entrada.publicadas   slugs ACTIVE na Management API
 * @param {string[]} entrada.pastas       pastas de `supabase/functions` (sem `_shared`)
 * @param {string[]} entrada.declaradas   blocos `[functions.X]` do `config.toml`
 * @param {Record<string,string>} entrada.pendentes  slug: motivo de ainda não estar publicada
 */
export function compararParidade({
  publicadas = [],
  pastas = [],
  declaradas = [],
  pendentes = {},
}) {
  const temPasta = new Set(pastas);
  const noAr = new Set(publicadas);

  // Publicada sem fonte: ninguém revisa, testa ou corrige o que só existe no servidor.
  const soEmProducao = publicadas.filter((s) => !temPasta.has(s)).sort();

  // No repo e fora do ar: quem chamar leva 404. Pendência declarada sai da conta de falha,
  // mas continua sendo reportada, senão vira decisão que ninguém revisita.
  const soNoRepo = pastas.filter((s) => !noAr.has(s)).sort();
  const esquecidas = soNoRepo.filter((s) => !(s in pendentes));
  const pendentesAtivas = soNoRepo.filter((s) => s in pendentes);

  // Allowlist que guarda quem já subiu vira mentira acumulada.
  const pendentesObsoletas = Object.keys(pendentes).filter((s) => noAr.has(s)).sort();

  // Sintoma offline, o único que aparece sem token: bloco no config.toml sem pasta.
  const declaradasSemPasta = declaradas.filter((s) => !temPasta.has(s)).sort();

  return {
    soEmProducao,
    esquecidas,
    pendentesAtivas,
    pendentesObsoletas,
    declaradasSemPasta,
    ok:
      soEmProducao.length === 0 &&
      esquecidas.length === 0 &&
      pendentesObsoletas.length === 0 &&
      declaradasSemPasta.length === 0,
  };
}
