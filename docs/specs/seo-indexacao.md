# Indexação e domínio canônico

**Status:** implementado (regra de host + regra de rota, as duas no worker) · **Fonte da verdade:** `INDEXABLE_HOSTS` e `ROTAS_PRIVADAS` em [`src/worker.ts`](../../src/worker.ts)

## Decisão

O domínio canônico de SEO é o **`movepark.co`**, e **desde 18/08/2026 é o Hub que responde nele**. Todo host fora da allowlist, incluindo o antigo `hub.movepark.co`, **não deve aparecer no Google**.

O estado final é só o `movepark.co` existir: o Hub no apex e o WordPress fora. A troca de host já aconteceu; o que resta é o WordPress sair de vez, com os 301 de `/estacionamentos/*` para as páginas equivalentes.

## Por que

Enquanto os dois conviveram, o `movepark.co` (WordPress + Yoast) e o Hub publicavam conteúdo disputando a mesma intenção de busca. É esse quadro que a allowlist existia para resolver:

| Intenção | `movepark.co` (WordPress) | Hub (então em `hub.movepark.co`) |
|---|---|---|
| Estacionamento específico | 39 páginas em `/estacionamentos/<aeroporto>/<nome>/` | 41 páginas em `/p/<company>/<location>/<tipo>` |
| Aeroporto / destino | 24 páginas em `/estacionamentos/<aeroporto>/` | 16 páginas em `/destinos/<slug>` |

Dois domínios competindo pelo mesmo termo dividem sinal e se canibalizam, e por isso o Hub ficou fora do índice enquanto o WordPress era quem rankeava. Com o Hub no apex, a disputa acabou: o que sobra é migrar o que o WordPress ainda serve.

## Como funciona

`applyIndexPolicy` no [`src/worker.ts`](../../src/worker.ts) acrescenta **`X-Robots-Tag: noindex, follow`** por duas razões independentes:

1. **Host fora da allowlist** (`INDEXABLE_HOSTS`), que é o que hoje esconde o Hub inteiro.
2. **Caminho de área privada** (`ROTAS_PRIVADAS`), que vale em qualquer host, canônico incluído.

A primeira é temporária e some no dia da migração. A segunda é permanente. Ver
[Áreas privadas](#áreas-privadas-noindex-independente-de-host) abaixo.

Três decisões importam, e mexer nelas quebra a coisa:

1. **É allowlist, não blocklist.** Só `movepark.co` é indexável. Quando o Hub assumir o apex, o host já está na lista e a indexação volta sozinha, sem ninguém precisar lembrar de remover um bloqueio. De quebra, `*.pages.dev`, `*.workers.dev` e qualquer staging futuro nascem fora do índice.

2. **A regra mora no worker, não em arquivo estático.** `public/_headers`, meta tag no HTML e `robots.txt` são todos cegos a host: viajariam junto na migração e apagariam o site novo do índice. Só a borda enxerga o hostname da requisição.

3. **O `robots.txt` continua liberando o crawl.** O Google só respeita `noindex` na página que ele consegue abrir. `Disallow: /` faria o oposto do esperado: o crawler pararia de entrar, nunca leria o `noindex`, e as URLs já indexadas ficariam presas como "indexada, porém bloqueada pelo robots.txt", sem descrição e sem previsão de saída.

O `follow` preserva o rastreio dos links, então a autoridade que o Hub aponta para fora não é descartada.

Cobertura garantida por teste em [`src/worker.test.ts`](../../src/worker.test.ts), incluindo o caso que protege a migração (`NÃO marca noindex no domínio canônico`).

## Áreas privadas: noindex independente de host

Implementado em 18/08/2026. Sete prefixos respondem `X-Robots-Tag: noindex, follow` em
**qualquer** host, sem depender da regra de host:

`/manager` · `/operator` · `/account` · `/checkout` · `/bookings` · `/onboarding` · `/voucher`

**Por que precisou de regra própria.** Elas estavam fora do Google por tabela, não por
política: o host inteiro respondia `noindex`. No dia em que o `movepark.co` entrar no
`INDEXABLE_HOSTS`, a mesma linha que devolve o site ao índice devolveria junto o painel do
parceiro, a conta do cliente e o checkout. Não é hipótese: o baseline de 04/08/2026 já trazia
`/operator` e `/operator/api-keys` indexados.

**Detalhes que importam:**

- A comparação é por **prefixo de caminho**, em minúsculas e sem barra final, casando o
  prefixo exato ou o que vem abaixo dele. `/accountability` não é `/account`.
- Vale em toda resposta que sai do worker, inclusive a versão Markdown pedida por agente e os
  redirecionamentos.
- **Não** existe `Disallow` correspondente no [`robots.txt`](../../public/robots.txt), pelo
  mesmo motivo da regra de host: URL bloqueada ali nunca é aberta, o `noindex` nunca é lido, e
  o que já está indexado fica preso como "indexada, porém bloqueada". O caminho de saída é
  deixar rastrear.
- **Não** existe meta tag equivalente no app. A política de índice tem um dono só, que é o
  worker; duas autoridades sobre a mesma URL só criam divergência, e o cabeçalho é lido sem o
  crawler precisar renderizar JS.

A mesma família de caminhos já é recusada pelo sitemap (`SITEMAP_PRIVATE_PREFIXES` em
[`src/lib/sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts) e o `PRIVADOS` de
[`scripts/canonicalize-sitemap.mjs`](../../scripts/canonicalize-sitemap.mjs)). Como são listas
separadas, um teste em [`src/worker.test.ts`](../../src/worker.test.ts) reprova prefixo que
entre no worker e não no pós-build do sitemap.

**Ainda em aberto:** rotas que são públicas mas internas por natureza (`/motor-preview`,
`/design-system`, `/docs`) e o resultado parametrizado de `/search` continuam sem `noindex`
próprio. Estão fora do sitemap, mas ficam indexáveis no dia do cutover se alguém as linkar.
Decidir antes de migrar.

## Operação

O `movepark.co` já é uma **propriedade de domínio** (`sc-domain:movepark.co`) no Search Console, então cobre todos os subdomínios. Não existe propriedade separada do `hub.` nem é preciso criar uma.

Remoção temporária do prefixo `https://hub.movepark.co/` enviada em **04/08/2026** (vale ~6 meses, reversível a qualquer momento). Ela apenas esconde; a saída definitiva vem do recrawl lendo o `noindex`, o que leva de dias a semanas.

Baseline medido em 04/08/2026, antes do `noindex` propagar: **233 páginas indexadas no domínio, 18 delas no `hub.movepark.co`**. Duas eram rotas de painel: `/operator` e `/operator/api-keys`. Também apareceram `/search?dest=POA` e uma listagem com query string (`?from=&to=&src=home-popular`), ou seja, URL parametrizada indexada como duplicata.

Nenhum sitemap do `hub.` chegou a ser submetido: a propriedade só tem os dois do WordPress (`movepark.co/sitemap.xml` e `page-sitemap.xml`). O sitemap do Hub só era descoberto pelo `robots.txt`.

### Outros subdomínios indexados

A mesma propriedade de domínio revelou dois subdomínios fora do `hub.` no índice, ambos fora deste repositório:

| Subdomínio | O que é | Situação |
|---|---|---|
| `n8n.movepark.co` | instância n8n de automação | indexado; ferramenta interna exposta na busca |
| `virapark.movepark.co` | white-label do parceiro Virapark (Vercel) | indexado; pode ser intencional para o SEO do parceiro |

> **A borda tem spec própria.** Comportamento do worker, configuração de assets e a regra de
> 404 estão em [`borda-cloudflare.md`](./borda-cloudflare.md), com as medições de produção.

## Migração para o `movepark.co` (18/08/2026)

O `noindex` sai sozinho (a allowlist do worker já apontava para o apex), mas o resto **não**. Nenhum item abaixo é opcional: cada um, se esquecido, tira páginas do índice ou expõe o que não devia.

- [x] **Host canônico hardcoded.** Resolvido em 18/08/2026. A string estava escrita à mão em 399 pontos do repo, dos quais 44 em `src/`. Agora o valor vive em [`src/lib/site-host.mjs`](../../src/lib/site-host.mjs) (front, `vite.config.ts` e scripts de pós-build, via [`src/lib/site.ts`](../../src/lib/site.ts)) e em [`supabase/functions/_shared/site.ts`](../../supabase/functions/_shared/site.ts) (Deno). São dois arquivos porque são três runtimes que não se importam entre si; quem impede a divergência é [`src/lib/site.contract.test.ts`](../../src/lib/site.contract.test.ts), que reprova host repetido à mão em `src/` e nas Edges, compara as duas declarações e varre a superfície estática publicada.
- [x] **Hostname do sitemap.** Resolvido em 18/08/2026. O `hostname` do plugin sai do host canônico, com `VITE_PUBLIC_SITE_URL` sobrescrevendo em build de preview.
- [x] **`Sitemap:` do [`robots.txt`](../../public/robots.txt).** Resolvido em 18/08/2026.
- [x] **404 real.** Resolvido em 13/08/2026. URL inexistente responde 404 com corpo, em vez de 200 com o HTML da home. A regra vive no worker, com fail-open, e as rotas de app que não têm HTML próprio (`/checkout/:code`, `/operator/*`, `/manager/*`) continuam em 200 por padrão declarado. Ver [`borda-cloudflare.md`](./borda-cloudflare.md).
- [x] **Rotas privadas com `noindex` próprio.** Resolvido em 18/08/2026. `/manager`, `/operator`, `/account`, `/checkout`, `/bookings`, `/onboarding` e `/voucher` respondem `noindex, follow` por regra de caminho no worker, independente de host, então continuam fora do índice depois da migração. Ver [Áreas privadas](#áreas-privadas-noindex-independente-de-host). Ampliado em 18/08/2026, depois de conferir rota a rota em produção: entraram `/descadastro` (carrega o destinatário em `?t=<token>`, então indexar publica o token, não só uma página magra), `/auth` e as duas ferramentas internas `/motor-preview` e `/design-system`. As quatro estavam no opt-out do sitemap, que só deixa de anunciar e **não** emite `noindex`; enquanto o host inteiro respondia `noindex` a diferença não aparecia. Segue aberto, por ser decisão de produto e não descuido: `/docs` (documentação pública da API, com canonical próprio) e o `/search` parametrizado.
- [x] **Exclusões do sitemap.** Resolvido em 13/08/2026. A lista de exclusão do [`vite.config.ts`](../../vite.config.ts) passou a derivar de [`src/lib/sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts): opt-out declarado com motivo, mais os prefixos de área logada. Medido no `dist/` depois da mudança: 149 URLs, zero de `/manager`, `/operator`, `/account`, `/checkout`, `/bookings`, `/onboarding`, `/docs`, `/search` ou `/design-system`. Guarda extra desde 14/08/2026: [`scripts/canonicalize-sitemap.mjs`](../../scripts/canonicalize-sitemap.mjs) remove no pós-build qualquer bloco `<url>` de área privada que escape, e loga quantos caíram.
- [x] **Arquivos de rascunho em `public/`.** `public/images/arco-iris.html` foi apagado em 13/08/2026. Varrer `public/` atrás de HTML solto continua valendo.
- [x] **`www.movepark.co` → 301 para o apex.** Resolvido em 18/08/2026. Antes respondia **522**: tinha registro DNS proxiado para uma origem que não existe mais. 522 é pior que não existir, porque o Google lê como falha temporária e volta, em vez de entender que o endereço certo é outro. O redirect vive em `redirecionaWww` no [`src/worker.ts`](../../src/worker.ts), preserva caminho e query, e o `www` foi ligado ao worker por **route** em [`wrangler.jsonc`](../../wrangler.jsonc). O apex NÃO entra nessa lista: ele está preso ao worker por **Custom Domain**, que é outro recurso; medido antes de mexer, a zona tinha zero routes, então a entrada é aditiva. **Se o apex um dia virar route, ele precisa entrar na lista junto**, porque o deploy substitui o conjunto de routes pelo que está no config.
- [ ] **301 do WordPress para o Hub.** Cada URL de `/estacionamentos/*` que sair precisa de redirect permanente para a página equivalente do Hub, senão a autoridade acumulada é perdida. Isso não vive neste repo.
- [x] **`hub.movepark.co` saiu do ar.** Medido em 18/08/2026: o host **não resolve mais** (NXDOMAIN), então não há como 301 para o apex. O custo é baixo e conhecido: o subdomínio respondeu `noindex` a vida inteira e o baseline de 04/08/2026 achou só 18 páginas dele indexadas, já alvo de remoção temporária no GSC. Elas caem por erro de rastreio em vez de transferir sinal. **Se um dia o host voltar a resolver, aponte 301 para o apex em vez de servir conteúdo.**
- [x] **`llms.txt` e superfície `.well-known`.** Resolvido em 18/08/2026, junto com o corpus de Markdown do blog (95 arquivos) e os templates de auth. Ver ADR-003.
- [x] **`PUBLIC_SITE_URL` nos secrets do Supabase.** Corrigido em 18/08/2026. A env **estava** setada com `https://hub.movepark.co` e, por vencer o default do código, teria mantido todo link de e-mail transacional apontando para um host que já não resolve. Confira pelo digest: `supabase secrets list` mostra o sha256 do valor.
- [x] **`api.movepark.co` não muda.** A Public API fica onde está, fora da superfície de SEO. `mcp.movepark.co` idem.

## Sitemap: o que entra e por quê

O `vite-plugin-sitemap` roda no `closeBundle`, **antes** de o `vite-react-ssg` pré-renderizar.
Naquele instante o `dist/` só tem o `index.html` do build de cliente, então o plugin não
descobre sozinho que `/sobre` e `/faq` existem: tudo vem da lista montada no
[`vite.config.ts`](../../vite.config.ts). Foi por isso que o sitemap publicado em 13/08/2026
tinha 135 URLs e **nenhuma página institucional**, mesmo com as nove pré-renderizadas no
`dist/`.

A lista estática mora em [`src/lib/sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts), que
**não pode importar nada**: o Vite empacota o config com esbuild antes de o alias `@` existir,
então qualquer import em cadeia (por exemplo `@/routes`, que puxa `RequireRole` e o client do
Supabase) quebra o build inteiro. Foi a primeira tentativa e ela não compila.

Quem impede a lista de envelhecer é [`src/lib/sitemapRoutes.test.ts`](../../src/lib/sitemapRoutes.test.ts):
lê o `routes.tsx` como texto e reprova qualquer rota que não esteja no sitemap, no opt-out com
motivo escrito, ou sob prefixo de área logada. Rota nova sem decisão deixa o CI vermelho.

### Um arquivo por seção, com índice (17/08/2026)

O `/sitemap.xml` é um **`<sitemapindex>`** e aponta para um arquivo por tipo de conteúdo.
Medido no build de 17/08/2026, 364 URLs no total:

| Arquivo | Conteúdo | URLs |
|---|---|---|
| `sitemap-faq.xml` | `/faq` e `/faq/*` | 185 |
| `sitemap-blog.xml` | `/blog/` e `/blog/*/` | 70 |
| `sitemap-estacionamentos.xml` | lotes mapeados publicados | 43 |
| `sitemap-destinos.xml` | `/destinos` e `/destinos/*` | 27 |
| `sitemap-unidades.xml` | listagens `/p/*` | 17 |
| `sitemap-paginas.xml` | home e institucionais | 11 |
| `sitemap-precos.xml` | `/precos` e `/precos/*` | 6 |
| `sitemap-mais-barato.xml` | `/estacionamento-mais-barato/*` | 5 |

Peso nunca foi o motivo: o arquivo único tinha 79 KB contra um limite de 50 MB e 50.000 URLs.
O motivo é a seção crescer sem que ninguém precise mexer na estrutura de novo, e o relatório
de cobertura do Search Console passar a separar blog de FAQ de destino em vez de somar tudo
num número só.

**A porta de entrada continua em `/sitemap.xml`.** Isso preserva o `Sitemap:` do
[`robots.txt`](../../public/robots.txt), o `<link rel="sitemap">` que o plugin injeta no
`<head>` e a descoberta que o Google já fez. Não há o que resubmeter.

**Sem paginação dentro da seção.** O Yoast quebra em 1.000 URLs por arquivo, número que é
herança de PHP antigo e não exigência do protocolo. A maior seção teria que crescer 270 vezes
para encostar no limite real, então paginar agora seria caminho de código que nunca roda.

**Como a classificação é decidida.** O `vite.config.ts` já monta as URLs em variáveis
separadas por origem (`blogRoutes`, `faqRoutes`, `prospectRoutes`…), e um plugin inline grava
esse agrupamento em `node_modules/.cache/movepark-sitemap-sections.json`. O
[`scripts/split-sitemap.mjs`](../../scripts/split-sitemap.mjs) lê o mapa, fatia o sitemap e
apaga o mapa. **A seção vem de quem buscou a URL, nunca de prefixo de path adivinhado
depois:** o repo já tem duas listas de prefixo que divergiram (`SITEMAP_PRIVATE_PREFIXES` com
cinco entradas, `PRIVADOS` do canonicalize com doze), e uma terceira seria drift garantido.
Rota nova só precisa entrar no mapa; se esquecerem, ela cai em `sitemap-paginas.xml` e o
build **reporta como órfã** no log.

Três coisas derrubam o build, todas por invariante e não por contagem: soma dos shards
diferente da entrada, seção vinda do banco saindo vazia (mesmo sintoma de Supabase mudo que o
`write-paths-manifest.mjs` já trata como fatal) e entrada que já é um índice, para o script
não picotar o próprio resultado se rodar duas vezes. A lógica pura fica em
[`scripts/sitemap-split.logic.mjs`](../../scripts/sitemap-split.logic.mjs) e é testada em
[`src/lib/sitemapSplit.test.ts`](../../src/lib/sitemapSplit.test.ts).

### `lastmod` real por URL (17/08/2026)

**353 das 364 URLs levam a data que o banco conhece**, e não mais o timestamp do build. As 11
que sobram são as institucionais de `sitemap-paginas.xml`, que não têm linha em banco; inventar
data para elas seria a mentira que este trabalho existe para tirar do sitemap.

| Seção | De onde vem a data | Datas distintas |
|---|---|---|
| blog | `greatest(published_at, updated_at)` | 69, de 22/07/2022 a 12/08/2026 |
| unidades | `location_parking_type.updated_at` | 17 |
| faq | `faq.updated_at` | 10 |
| mais-barato | maior data das unidades daquele destino | 5 |
| precos | maior data das unidades daquele destino | 5 |
| destinos | `destination.updated_at` | 4 |
| estacionamentos | `prospect_location.updated_at` | 2 |
| paginas | sem data em banco, usa o default do plugin | 1 (data do build) |

Cada entrada do `<sitemapindex>` carrega a **data mais recente do seu shard**, não a da
primeira URL. Capa de seção (`/blog/`, `/faq`, `/destinos`, `/precos`) herda a data do filho
mais recente, porque é isso que uma listagem é: ela muda quando um item muda.

Um `lastmod` que anda sozinho a cada deploy é pior que nenhum, porque o Google aprende a
ignorar o sinal do site inteiro. Era o que acontecia antes: as 364 URLs saíam com o horário do
build, mesmo quando nada tinha mudado.

**Duas correções de dado foram necessárias, e as duas valem por si.**

1. **`blog_post.updated_at` guardava a data do import, não a da edição**
   (migration `20261028120000`). O import do WordPress tocou em todas as linhas e o trigger
   `set_updated_at` carimbou agosto de 2026 por cima do histórico: 69 posts com 3 datas
   distintas, contra 51 de `published_at`. O `updated_at` alimenta também o `dateModified` do
   BlogPosting, então cada post declarava ao Google ter sido modificado em agosto enquanto o
   `datePublished` dizia 2022. A data do import não se perdeu, continua no `created_at`.
2. **`prospect_location.updated_at` não era legível pelo `anon`**
   (migration `20261028130000`). A tabela usa GRANT por coluna (ADR-010, Q-021) e a coluna
   ficou de fora da allowlist. A consulta do build voltava `permission denied` com `data`
   nulo, e as 43 fichas sumiam do sitemap inteiro; o guarda de seção vazia derrubou o build em
   vez de publicar o índice sem elas. O GRANT novo é nominal e só para `updated_at`: o
   telefone e o resto seguem fora.

`changefreq` e `priority` continuam uniformes (`daily`, `1.0`). Prioridade igual para tudo não
informa nada, mas também não mente; mexer nelas é outra conversa.

**Taxonomia e paginação do blog (fechado em 18/08/2026):** `/blog/page/N`, `/blog/categoria/*`,
`/blog/tag/*`, `/blog/autor/*` e `/blog/aeroporto/*` (48 arquivos no `dist/`) entram no sitemap
pela mesma seção `blog`. `getBlogTaxonomyRoutes`, no `vite.config.ts`, espelha a contagem do
`getStaticPaths` de `src/routes.tsx` (mesmo `PAGE_SIZE`), agrupando por slug de categoria, tag,
autor e destino. Os padrões estão em `SITEMAP_DYNAMIC_PATTERNS`, junto do resto do dinâmico.

**Nomes das páginas legais.** As rotas do Hub são `/termos` e `/privacidade`; o WordPress
publica `/termos-de-uso/` e `/politica-de-privacidade/`. São nomes diferentes, então a
migração precisa de 301 e não de URL igual. Um teste trava os dois nomes.

## Indexação de vídeo: miniatura obrigatória (20/08/2026)

O Search Console avisou que nenhum vídeo do site estava sendo indexado, com o motivo
**"Nenhum URL de miniatura enviado"** (`WNC-20237597`).

O site tem vídeo em dois lugares, e só um deles chega ao HTML que o buscador lê:

| Onde | O que o crawler vê | Por que faltava miniatura |
|---|---|---|
| `/seja-parceiro` | `<iframe>` do YouTube, no HTML do SSG | O player é do YouTube, mas quem precisa declarar o vídeo é a página que o exibe. Sem `VideoObject`, o Google acha o vídeo e não descobre a miniatura. |
| Home (`Hero`) | nada no HTML: o `<video>` só entra depois que o JS roda | Se o Googlebot renderiza a página, encontra seis `<video>` sem `poster`, e um vídeo sem `poster` não oferece quadro nenhum. |

Correção:

1. **`youTubeVideoSchema()`** em [`src/lib/jsonld.ts`](../../src/lib/jsonld.ts), emitido no
   `Helmet` de `/seja-parceiro`. Traz os quatro campos que o Google exige (`thumbnailUrl`,
   `name`, `description`, `uploadDate`) mais `duration` e `embedUrl`. Os valores são os reais
   do YouTube: dado estruturado que não bate com o que a página mostra é motivo de ação
   manual, não de rich result.
2. **`poster` nos clipes do hero**, apontando para `/images/hero-image.webp`, que é a foto
   que já está por baixo e mostra a mesma cena. Na tela não muda nada, porque o clipe só
   aparece depois do `canPlay`; muda para o robô.

A miniatura usa **`maxresdefault.jpg`** (1280x720). O `hqdefault` que o oEmbed devolve tem
480px de largura, e o Google pede pelo menos 1200 para a imagem aparecer no resultado rico:
entregaria o dado e perderia a vitrine.

**O guard:** [`scripts/audit-structured-data.mjs`](../../scripts/audit-structured-data.mjs)
reprova o build se um `VideoObject` sair sem `thumbnailUrl`, `name`, `description`,
`uploadDate` ou sem `contentUrl`/`embedUrl`. É o mesmo motivo de o script existir: o Search
Console avisa tarde, e isso é detectável no `dist/` antes do deploy. Vídeo novo no site nasce
com miniatura ou não passa no `bun run lint:schema`.
