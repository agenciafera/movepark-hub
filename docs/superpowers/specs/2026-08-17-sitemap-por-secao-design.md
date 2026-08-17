# Sitemap dividido por seção, com índice

Data: 17/08/2026
Estado: desenho aprovado, aguardando plano de implementação

## Problema

O Hub publica um `dist/sitemap.xml` único com 383 URLs (79 KB). Os limites do Google são
50.000 URLs e 50 MB por arquivo, então **peso não é o problema hoje**, e este desenho não
finge que é.

O que motiva a mudança é estrutura para crescer. A FAQ sozinha já responde por 185 das 383
URLs, e os lotes mapeados (`/estacionamentos/*`) vão crescer no cutover do WordPress. Cortar
por tipo agora custa um script; cortar depois custa mexer numa superfície que o Google já
aprendeu.

## Decisão

Um `sitemapindex` em `/sitemap.xml` apontando para sete sitemaps por tipo de conteúdo.

| Arquivo | Conteúdo | URLs em 14/08/2026 |
|---|---|---|
| `sitemap.xml` | índice, aponta para os sete abaixo | 7 |
| `sitemap-faq.xml` | `/faq` e `/faq/*` | 185 |
| `sitemap-blog.xml` | `/blog/` e `/blog/*/` | 96 |
| `sitemap-estacionamentos.xml` | lotes mapeados publicados | 39 |
| `sitemap-destinos.xml` | `/destinos` e `/destinos/*` | 27 |
| `sitemap-unidades.xml` | listagens `/p/*` | 19 |
| `sitemap-precos.xml` | `/precos` e `/precos/*` | 7 |
| `sitemap-paginas.xml` | home e institucionais | 10 |

### Por que o índice continua em `/sitemap.xml`

Manter a porta de entrada no mesmo endereço preserva três coisas de graça: o `Sitemap:` do
[`public/robots.txt`](../../../public/robots.txt), o `<link rel="sitemap">` que o plugin
injeta no `<head>` de toda página, e qualquer descoberta que o Google já tenha feito. Nada a
resubmeter, nada a editar.

### Por que sem paginação dentro da seção

O Yoast pagina em 1.000 URLs por arquivo. Esse número é herança de PHP antigo, não exigência
do protocolo: o limite real é 50.000. A maior seção teria que crescer 270 vezes para
encostar nele. Paginação agora seria caminho de código que nunca roda, e caminho que nunca
roda é caminho que não funciona quando precisar.

Quando a paginação for real, o corte por tipo já existe e ela vira uma mudança local.

## Restrição de origem: o plugin não faz isso

O `vite-plugin-sitemap@0.8.2` chumba o nome `sitemap.xml` na escrita e não tem opção de
shard nem de índice
([`node_modules/vite-plugin-sitemap/dist/index.mjs`](../../../node_modules/vite-plugin-sitemap/dist/index.mjs),
função `generateSitemap`). A opção `externalSitemaps` só alimenta a geração de `robots.txt`,
que aqui está desligada. Dividir significa produzir os arquivos por conta própria.

Dois defeitos do plugin apurados na leitura do fonte, que explicam o pipeline atual e não
mudam com este desenho:

1. A `exclude` é comparação exata de string (`!options.exclude.includes(route)`), **não
   glob**. Os padrões `"/manager/*"` montados no
   [`vite.config.ts`](../../../vite.config.ts) nunca casam com nada. Quem realmente poda a
   área logada é o `canonicalize-sitemap.mjs`.
2. O plugin roda `parse(route).name` em todo path, e é isso que come a barra final das URLs
   do blog. Não é ajustável, por isso o canonicalize repõe.

Corrigir esses dois na raiz exigiria aposentar o plugin e reescrever a montagem inteira.
Fica fora deste desenho: é reescrever o que funciona, e não serve ao objetivo de estrutura
para crescer.

## Arquitetura

### Pipeline

```
vite-react-ssg build          plugin escreve dist/sitemap.xml (achatado)
→ canonicalize-sitemap.mjs    repõe barra do blog, poda área privada     (existe)
→ split-sitemap.mjs           fatia em 7 e reescreve o índice            (NOVO)
→ write-paths-manifest.mjs    manifesto de 404                           (existe)
→ generate-geo-artifacts.mjs                                             (existe)
```

O split roda **depois** do canonicalize, então fatia um arquivo já corrigido e já podado.
Ele não precisa saber nada sobre barra final nem sobre área logada, e cada script segue com
um trabalho só.

### O mapa de seções

Um plugin inline no `vite.config.ts`, declarado logo abaixo do `sitemap()`, grava no
`closeBundle`:

```
node_modules/.cache/movepark-sitemap-sections.json
{ "blog": [...], "faq": [...], "destinos": [...], "estacionamentos": [...],
  "unidades": [...], "precos": [...], "paginas": [...] }
```

As sete listas saem das variáveis que o `vite.config.ts` já mantém separadas antes de
fundi-las num `Set` (`listingRoutes`, `destinationRoutes`, `blogRoutes`, `prospectRoutes`,
`faqRoutes`, `precosRoutes`, mais `SITEMAP_STATIC_ROUTES`).

**A classificação não é re-derivada por prefixo de path, ela vem de quem buscou a URL.** Essa
é a decisão central do desenho. O repo já tem duas listas de prefixo que divergiram
(`SITEMAP_PRIVATE_PREFIXES` com cinco entradas em
[`src/lib/sitemapRoutes.ts`](../../../src/lib/sitemapRoutes.ts), `PRIVADOS` com doze em
[`scripts/canonicalize-sitemap.mjs`](../../../scripts/canonicalize-sitemap.mjs)); uma
terceira seria drift garantido.

Duas propriedades do arquivo:

- **Mora fora do `dist/`.** Arquivo de trabalho que vaza para o `dist/` é arquivo que vai
  para produção.
- **É apagado pelo split depois de lido.** Mapa velho de build anterior não existe para ser
  usado por engano. Mapa ausente faz o split falhar alto em vez de adivinhar.

### O que o `split-sitemap.mjs` faz

Reaproveita o prolog XML e a tag `<urlset ...>` do arquivo de origem palavra por palavra, e
só redistribui os blocos `<url>`. Os namespaces dos shards ficam idênticos aos de hoje e não
há XML remontado à mão.

O host dos `<loc>` do índice é derivado da primeira URL do próprio sitemap, não de uma
segunda cópia de `SITE_URL`. É um item a menos na lista de ~20 pontos com
`hub.movepark.co` chumbado, catalogada no checklist de migração de
[`docs/specs/seo-indexacao.md`](../../specs/seo-indexacao.md).

O `lastmod` de cada entrada do índice é o timestamp do build, o mesmo valor que o plugin já
carimba em toda URL hoje.

### Invariantes que derrubam o build

1. **Soma diferente.** O total de URLs nos sete shards tem que bater com o total da entrada.
   Nenhuma URL pode sumir nem duplicar na fatia.
2. **Seção do banco vazia.** É o mesmo sintoma que o `write-paths-manifest.mjs` já trata
   como fatal: Supabase mudo durante o build. Sem esta guarda, um build ruim publicaria um
   índice apontando para um `sitemap-blog.xml` vazio, tirando do anúncio 95 posts que hoje
   rankeiam e deixando a redescoberta deles por conta só do link interno. Vale para as seis seções que vêm de
   consulta (`blog`, `faq`, `destinos`, `estacionamentos`, `unidades`, `precos`);
   `paginas` vem de lista literal e não tem como esvaziar.
3. **Entrada já é `<sitemapindex>`.** Guarda de idempotência: rodar o script duas vezes não
   pode picotar o índice. O `canonicalize-sitemap.mjs` ganha a mesma recusa, pelo mesmo
   motivo.

### Degradação declarada

URL presente no sitemap e ausente do mapa cai em `sitemap-paginas.xml` e é **listada no
log**, sem derrubar o build. É o sinal de que o plugin a descobriu sozinho varrendo o
`dist/` atrás de HTML, que é o mesmo vazamento que obrigou o canonicalize a existir. Não
derruba porque o `sitemapRoutes.test.ts` já cobra decisão explícita para toda rota do
`routes.tsx`, então o caso é raro e o log basta para investigar.

## Testes

A lógica pura fica em `scripts/sitemap-split.logic.mjs`: recebe o XML e o mapa, devolve os
arquivos e o índice, sem tocar em disco. O `scripts/split-sitemap.mjs` fica só com I/O.

Teste em `src/lib/sitemapSplit.test.ts`, no projeto `unit` que já roda no CI:

- distribui cada `<url>` para a seção declarada no mapa;
- preserva o prolog e o `<urlset>` com os namespaces originais;
- a soma dos shards bate com a entrada;
- URL órfã cai em `paginas` e é reportada;
- o índice lista exatamente os arquivos que foram escritos, e nenhum vazio;
- entrada `<sitemapindex>` é recusada.

**Ressalva:** não há precedente no repo de teste em `src/` importando de `scripts/`. Nenhuma
das outras build scripts `.mjs` tem teste. A alternativa seria escrever o split em TS
e rodar com `bun` para a lógica morar em `src/lib/`, mas isso mistura `bun` num
encadeamento que hoje é todo `node`. O import atravessando a fronteira é preferível a
lógica de build sem teste.

Verificação manual depois do primeiro build: somar as URLs dos sete shards e conferir contra
o total anterior, e abrir um shard pela borda para confirmar o `Content-Type`.

## O que não muda

Cada item abaixo foi confirmado lendo o código, não por suposição.

- **`public/robots.txt`**: segue apontando para `/sitemap.xml`, que agora é o índice.
- **`src/worker.ts`**: `/sitemap-blog.xml` termina em extensão que não é `.html`, então cai
  no ramo `isAssetRequest` e vai direto ao ASSETS. Shard inexistente já devolve 404 limpo
  pela regra que existe. Nenhuma edição.
- **`paths-manifest.json`**: o gerador só indexa `.html` e arquivo sem extensão. Os `.xml`
  são ignorados por construção, hoje e depois.
- **`public/_headers`, `wrangler.jsonc`**: nada. Content-Type de `.xml` é automático.
- **`src/lib/sitemapRoutes.ts` e seu teste**: inalterados. A política de o que entra no
  sitemap não muda, muda só a forma de empacotar.

## Fora de escopo

- **`lastmod`, `changefreq` e `priority` reais.** As 383 URLs continuam saindo com o
  timestamp do build, `daily` e `1.0`. Misturar isso aqui faria a mudança de estrutura
  carregar uma mudança de sinal para o Google no mesmo deploy, e aí nenhum dos dois efeitos
  é legível. Fica como próximo passo: o corte por tipo é justamente o que torna o `lastmod`
  real viável por seção, tirando o `updated_at` de cada tabela na mesma consulta que já
  busca os slugs.
- **Taxonomia e paginação do blog** (`SITEMAP_BLOG_TAXONOMY_PENDING`, 48 arquivos no
  `dist/`). Segue fora do sitemap, como está.
- **Aposentar o `vite-plugin-sitemap`.** Ver "Restrição de origem".

## Documentação a atualizar no mesmo PR

`docs/specs/seo-indexacao.md`, seção "Sitemap: o que entra e por quê": a estrutura nova, a
tabela de seções e o motivo do corte.

Não é ADR. Não muda regra de arquitetura, muda a forma de um artefato de build.

## Risco conhecido

O Google precisa recrawlear `/sitemap.xml` para descobrir os sete filhos. Leva de horas a
dias e não há perda no meio do caminho: as URLs continuam todas anunciadas, só que em outro
envelope. O host inteiro segue com `X-Robots-Tag: noindex, follow` até a migração para o
`movepark.co` (ver `INDEXABLE_HOSTS` no worker), então o efeito prático só aparece de fato
depois do cutover.
