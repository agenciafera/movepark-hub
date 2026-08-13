# A borda: worker, assets e a regra de 404

**Status:** 404 real implementado (13/08/2026) · **Fonte da verdade:** [`src/worker.ts`](../../src/worker.ts) e [`wrangler.jsonc`](../../wrangler.jsonc)

Este arquivo existe porque a borda é o ponto mais sensível do projeto e o único cuja verdade
não está inteira no repositório: metade dela é comportamento do Cloudflare Workers Assets,
que não aparece em nenhum arquivo daqui. Mexer no `not_found_handling` ou na ordem das
checagens do worker derruba tela em produção sem quebrar um teste sequer.

Tudo abaixo foi **medido em produção em 13/08/2026**, não deduzido da documentação.

## O que está no ar

| | |
|---|---|
| Worker | `movepark-hub`, id `79ff887ff45f4f7d912745b5a4bdc701` |
| Conta | `Financeiro@fera.ag` (`d124ffde17489256e3417b4e82275c6c`) |
| Criado | 02/06/2026 |
| Deploy | push na `main` dispara o build, no ar em cerca de 2 minutos. `bun run deploy` faz direto por `wrangler` |
| Outros workers da conta | `movepark-api` (a Public API em `api.movepark.co`), `go2park`, `wa-go2park`, `share-go2park` |

Não é um projeto de Pages. A lista de Pages da conta é vazia.

## A configuração de assets, e o que cada valor faz de verdade

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": true
}
```

**`run_worker_first: true`** é o que faz o `worker.ts` rodar em toda requisição, inclusive nas
que têm HTML pré-renderizado. Sem isso o asset seria servido primeiro e a negociação de
Markdown para agentes (E0.8-c) nunca aconteceria em `/` e nas rotas SSG. Também é o que
torna possível qualquer regra de 404 no código.

**`not_found_handling: "single-page-application"`** é a causa direta do soft 404: caminho sem
arquivo correspondente recebe o `index.html` com status **200**. É também a rede de proteção
que mantém o app de pé, e por isso **não deve mudar**. Ver a decisão abaixo.

**`html_handling` não está declarado**, então vale o padrão `auto-trailing-slash`. Consequência
que já custou uma implementação inteira: pedir um caminho terminado em `.html` devolve **307**
para a forma sem extensão, com corpo vazio.

## Comportamento medido, por família de caminho

| Caminho | Status | Corpo | O que isso significa |
|---|---|---|---|
| `/` | 200 | 90.540 b | home pré-renderizada (o tamanho muda a cada deploy) |
| `/sobre` | 200 | 36.914 b | página estática real |
| `/destinos/aeroporto-afonso-pena` | 200 | 46.684 b | rota dinâmica gerada por `getStaticPaths` |
| `/pagina-que-nao-existe-xyz` | **200** | **90.540 b** | **soft 404: é o HTML da home, byte a byte** |
| `/sobre.html` | **307** | 0 b | `auto-trailing-slash` redireciona para `/sobre` |
| `/index.html` | 307 | 0 b | idem, para `/` |
| `/checkout/MP-TESTE123` | 200 | 90.540 b | rota de app sem arquivo, vive do fallback SPA |
| `/operator/pricing` | 200 | 90.540 b | idem, e ver o defeito de geração abaixo |
| `/manager` | 200 | 3.196 b | casca real (`dist/manager.html`) |
| `/account/reservas` | 200 | 3.193 b | casca real de `/account` servindo a filha |
| `/blog/slug-que-nao-existe/` | 404 | **0 b** | única regra de 404 que já existe, e sem corpo |
| `/assets/nao-existe-abc.js` | 404 | 0 b | intencional: `src/lib/stale-build.ts` depende dessa forma |
| `/.well-known/api-catalog` | 200 | 1.355 b | arquivo sem extensão, `application/linkset+json` |

O número que importa não é o valor absoluto, que muda a cada deploy: é a **igualdade**. Todo
caminho que devolve exatamente o mesmo tamanho da home está servindo a home no lugar da
página pedida. O `scripts/probe-borda.sh` mede a home na hora e marca as coincidências, para
a leitura não depender de um número anotado aqui.

## Defeito de geração do SSG (aberto, e não é para corrigir junto do 404)

Por causa dos pais sem `path` (`<RequireScope>` em [`src/routes.tsx`](../../src/routes.tsx)), o
build emite oito telas do operator na **raiz** do `dist` em vez de sob `/operator`:

```
/pricing  /finance  /api-keys  /occupancy  /addons  /coupons  /reviews  /users
```

Medido: `/pricing` responde 200 com 3.079 bytes (arquivo real na raiz), e `/operator/pricing`
responde 200 com 90.540 bytes (fallback). Ou seja, **as oito telas do operator funcionam hoje
por causa do fallback SPA**, não por terem arquivo no lugar certo.

Isso tem duas consequências para o 404:

1. Um manifesto ingênuo varrendo `dist/*.html` declararia `/pricing` e `/finance` como
   caminhos conhecidos. O worker responderia 200 com a casca do operator e o cliente
   renderizaria o 404, criando oito soft 404 novos justamente na mudança feita para acabar
   com eles. Precisa de blocklist explícita.
2. `/operator/*` precisa continuar sendo servido por padrão de prefixo, nunca por lista exata
   de páginas. Trocar por lista exata quebra oito telas.

Corrigir a geração é tarefa própria. Fazer junto do 404 mistura duas causas de falha.

## Decisão: o 404 fica no worker, e o `not_found_handling` não muda

**Não trocar `not_found_handling` para `404-page` nem para `none`.** A tentação é óbvia e está
errada por dois motivos medidos:

1. **O modo de falha inverte.** Com `single-page-application`, qualquer furo na lista de rotas
   de app degrada para o comportamento de hoje (200 com a casca), que é ruim para SEO e
   inofensivo para o usuário. Com `404-page`, o mesmo furo vira tela de erro numa rota válida:
   `/checkout/MP-ABC123` e `/operator/pricing` não têm arquivo e morreriam.
2. **Não daria para distinguir.** O Workers Assets não sabe o que é rota de app; só sabe se
   existe arquivo. Quem sabe é o `routes.tsx`.

Então a regra vive no `worker.ts`, com **fail-open obrigatório**: manifesto ausente, com
Content-Type errado ou com JSON inválido volta ao comportamento de hoje, nunca a 404.

Consequência prática: **nada precisa ser mexido no painel do Cloudflare.** A borda inteira é o
`worker.ts` mais um manifesto gerado no build.

### Como ficou

| Peça | Onde |
|---|---|
| Manifesto dos caminhos que existem no build | [`scripts/write-paths-manifest.mjs`](../../scripts/write-paths-manifest.mjs), roda no `bun run build` |
| Padrões de rota de app que continuam em 200 | `ROTAS_DE_APP` em [`src/worker.ts`](../../src/worker.ts) |
| Checagem e resposta de 404 | `caminhosConhecidos` e `pagina404`, antes da negociação de markdown |
| Página servida | [`src/routes/not-found.tsx`](../../src/routes/not-found.tsx), rota `/404` e catch-all, ambos dentro do `ConsumerAppShell` |
| Cenários de navegador | `e2e/windup/pagina-404.json`, `rota-inexistente.json` e `rota-inexistente-jornada.json` |

O manifesto tem 264 caminhos. Fora dele, por blocklist explícita, as oito telas que o SSG
emite na raiz e os arquivos de configuração do Cloudflare (`_headers` e companhia).

### Armadilhas que a implementação precisa respeitar

Cada uma destas já anulou uma tentativa de implementação, e todas estão travadas em teste
no bloco `describe("404 real de página")` de `src/worker.test.ts`, que fica no fim do arquivo
de propósito (o cache do manifesto vive no escopo do módulo).

1. **Buscar `/404.html` no ASSETS devolve 307 com corpo vazio.** Medido acima. O worker
   carimbaria status 404 num corpo vazio, que é a tela branca que a página de 404 existe para
   evitar. Buscar `/404`, sem extensão, como o bloco do blog já faz com `/blog/<slug>`.
2. **`.html` no pathname de entrada.** `isAssetRequest` exclui `.html` de propósito, então
   `/sobre.html` cai na checagem nova. O manifesto guarda a chave sem extensão, logo ele não
   bateria em nada e viraria 404, quebrando o 307 de canonicalização que existe hoje.
   Normalizar antes de consultar, ou deixar `.html` seguir direto para o ASSETS.
3. **`/estacionamentos/<aeroporto>/` com dois segmentos não pode virar 404.** São as 24 páginas
   de aeroporto do WordPress, e o checklist de migração em
   [`seo-indexacao.md`](./seo-indexacao.md) pede 301 para o destino equivalente. Mandar 404
   nelas joga fora exatamente a autoridade que o item existe para preservar.
4. **Cache do manifesto contamina teste.** O cache vive no escopo do módulo e o Vitest roda o
   arquivo inteiro numa instância só. O bloco novo tem que vir depois de todos os `describe`
   atuais de `worker.test.ts`, ou o worker precisa exportar um reset.
5. **O catch-all do React Router precisa mudar junto.** Hoje `{ path: "*" }` redireciona para a
   home. Se só a borda mudar, ela responde 404 e o app hidrata mandando o visitante para a
   raiz: a URL some e ninguém vê o 404. As duas rotas (`*` e `/404`) também precisam do mesmo
   pai, senão o HTML servido e a árvore hidratada divergem e o React reclama.
6. **`routes-coverage.contract.test.ts` reprova rota nova sem cobertura de navegador.** Criar
   `/404` exige cenário de windup ou entrada declarada na allowlist.
7. **O manifesto nasce em `dist/`, que não é versionado.** `wrangler dev` sem `bun run build`
   antes roda em fail-open, ou seja, com o comportamento antigo. Isso engana em teste manual.
8. **Guarda do manifesto por invariante, não por contagem.** Se o Supabase estiver fora no
   build, os `getStaticPaths` devolvem vazio e o `dist` sai com as páginas estáticas e nenhuma
   dinâmica. A contagem não é zero e o build passa. O guarda tem que exigir pelo menos uma
   entrada de cada família (`/p/`, `/destinos/`, `/blog/`).
9. **Colisão de caixa em `estacionamentos`.** O repo tem `public/Estacionamentos/` (imagens) e
   a rota `/estacionamentos/...`. No macOS os dois viram a mesma pasta no `dist`; no Linux do
   CI e do Cloudflare são duas. Comparar em minúsculas dos dois lados.
10. **Agentes também recebem soft 404.** `Accept: text/markdown` em qualquer URL cai hoje no
    fallback de `llms.txt` com 200. A checagem precisa vir antes da negociação de markdown.
11. **`Cache-Control: no-store` no 404** enquanto a migração do WordPress estiver em curso,
    senão uma URL que passa a existir fica presa em 404 na borda e no navegador.
12. **`/404` acessado direto tem que responder 404**, senão a própria página de erro vira um
    soft 404 indexável. E `pagina404` fala com o ASSETS direto, nunca reentrando em `serve()`,
    para não travar o isolate em laço.

## Como reconferir

O par que define se a mudança está certa, e que precisa ser rodado depois de todo deploy que
toque a borda:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://hub.movepark.co/pagina-que-nao-existe-xyz  # esperado: 404
curl -sS -o /dev/null -w "%{http_code}\n" https://hub.movepark.co/checkout/QUALQUERCOISA      # esperado: 200
```

A varredura completa por família de caminho está no script
[`scripts/probe-borda.sh`](../../scripts/probe-borda.sh).
