#!/usr/bin/env bash
# Varredura da borda por família de caminho.
#
# A borda é o ponto mais sensível do projeto e metade do comportamento dela não está no
# repositório: vem do Cloudflare Workers Assets. Este script é a forma de reconferir o
# contrato depois de todo deploy que toque `src/worker.ts`, `wrangler.jsonc` ou as rotas.
#
# Uso:  ./scripts/probe-borda.sh [host]
# Ex.:  ./scripts/probe-borda.sh https://hub.movepark.co
#
# O que ler no resultado: o tamanho da home é a assinatura do fallback SPA. Qualquer caminho
# que devolva exatamente esse tamanho está servindo a home no lugar da página pedida.
# Contexto e decisões em docs/specs/borda-cloudflare.md.
set -uo pipefail

HOST="${1:-https://hub.movepark.co}"

CAMINHOS=(
  "/|home"
  "/sobre|institucional estática"
  "/destinos/aeroporto-afonso-pena|rota dinâmica (getStaticPaths)"
  "/p/abbapark/aeroporto-afonso-pena/covered|unidade"
  "/pagina-que-nao-existe-xyz|INEXISTENTE (hoje soft 404, alvo: 404)"
  "/sobre.html|.html (auto-trailing-slash, espera 307)"
  "/checkout/MP-TESTE123|rota de app sem arquivo (TEM que ser 200)"
  "/bookings/MP-TESTE123|rota de app sem arquivo (TEM que ser 200)"
  "/account/reservas/MP-TESTE123|rota de app sem arquivo (TEM que ser 200)"
  "/operator/pricing|tela do operator (TEM que ser 200)"
  "/operator/preview/abc|rota de app com parâmetro (TEM que ser 200)"
  "/manager/companies/abc/locations|rota de app com parâmetro (TEM que ser 200)"
  "/blog/slug-que-nao-existe/|post inexistente (404 já existente)"
  "/assets/nao-existe-abc.js|asset ausente (404 de corpo vazio, stale-build depende)"
  "/.well-known/api-catalog|arquivo sem extensão"
  "/robots.txt|robots"
  "/sitemap.xml|sitemap"
)

HOME_LEN=$(curl -sS -o /dev/null -w "%{size_download}" "$HOST/")
printf "Host: %s\nTamanho da home (assinatura do fallback SPA): %s bytes\n\n" "$HOST" "$HOME_LEN"
printf "%-46s %-6s %-10s %s\n" "CAMINHO" "HTTP" "BYTES" "OBSERVAÇÃO"

for entrada in "${CAMINHOS[@]}"; do
  caminho="${entrada%%|*}"
  nota="${entrada#*|}"
  leitura=$(curl -sS -o /dev/null -w "%{http_code} %{size_download} %{redirect_url}" "$HOST$caminho")
  http=$(echo "$leitura" | cut -d' ' -f1)
  bytes=$(echo "$leitura" | cut -d' ' -f2)
  destino=$(echo "$leitura" | cut -d' ' -f3-)

  marca=""
  [ "$bytes" = "$HOME_LEN" ] && [ "$caminho" != "/" ] && marca=" <- FALLBACK (é a home)"
  [ -n "$destino" ] && marca="$marca -> $destino"

  printf "%-46s %-6s %-10s %s%s\n" "$caminho" "$http" "$bytes" "$nota" "$marca"
done

printf "\nO par que decide se o 404 está certo:\n"
printf "  /pagina-que-nao-existe-xyz  deve ser 404 com corpo\n"
printf "  /checkout/QUALQUERCOISA     deve ser 200 com a casca\n"
