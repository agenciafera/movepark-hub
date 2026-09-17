# Índice de preços (/precos)

> **Superfície pública de referência de preço**: quanto custa estacionar perto de cada
> destino, em 1, 7, 15 e 30 diárias, no preço real do motor de reservas. Existe para
> disputar a consulta "quanto custa estacionamento no aeroporto X" no Google e nas IAs
> (GEO), com uma vantagem estrutural sobre índices de concorrente coletados à mão:
> aqui o valor publicado é o valor cobrado no checkout, em toda publicação.

Back-ref: pedido de 14/08/2026 (benchmark xpark.ai/indice-de-precos e
/calculadora-estacionamento-aeroporto). Decisões de renderização seguem
[agent-readiness-seo.md](./agent-readiness-seo.md); domínio canônico segue
[seo-indexacao.md](./seo-indexacao.md).

## O que o cliente vê

Duas rotas SSG no `ConsumerAppShell`, pré-renderizadas no build (crawler de IA não
executa JS):

| Rota | Conteúdo |
|---|---|
| `/precos` | Índice editorial que cobre **todos os aeroportos publicados** (decidido em 14/08/2026): retrato em 4 números, **lateral de filtros** (busca sem acento por nome/cidade/UF/código, select de estado, "Só com reserva online", atalho por aeroporto; sticky no desktop, empilhada no mobile) e **uma tabela por aeroporto com até 5 estacionamentos**: vagas de parceiro primeiro (ordenadas pela diária avulsa, colunas Diária avulsa / 7 dias (R$/dia + total) / 15 dias (R$/dia + total), "Parceiro Movepark" + **botão Reservar**), e **lotes mapeados sem contrato completam o corte sem preço** (ADR-010: "consulte a tabela no local" + link Ver ficha para `/estacionamentos/<destino>/<lote>`). Aeroporto sem parceiro e sem lote mapeado entra mesmo assim, com aviso de mapeamento e link para `/seja-parceiro`. Linha de fonte com as datas, link "Tabela completa" (ou "Página do destino"); metodologia. Filtros nascem vazios no build, então o HTML pré-renderizado sai completo |
| `/precos/<slug>` | Página do destino (matriz completa, **inclui 30 diárias**): breadcrumb, **Resposta rápida** (menor preço por duração, com quem pratica), tabela unidades × durações com balcão riscado e economia %, estadia mínima explicada, seção de moto quando existe, metodologia, cross-link com os outros destinos |
| `/calculadora-estacionamento-aeroporto` | Calculadora (pedida em 14/08/2026, benchmark da calculadora do concorrente): destino + diárias (1 a 60, atalhos 1/7/15/30) viram o ranking do motor com balcão, economia e botão Reservar. Durações da matriz padrão respondem com o dado do build (SSG abre já calculada: primeiro destino, 7 diárias); outras vão à RPC com uma duração só, memoizada por consulta (`calculadora.logic.ts` + `fetchPriceForDays`). Estadia mínima sai da conta com o motivo visível. O select cobre **todos os destinos publicados** (decidido em 15/08/2026): sem parceiro precificado, a lista mostra os lotes mapeados ("consulte a tabela no local") ou o aviso de mapeamento, com CTA seja-parceiro; a sidebar de filtros fica sticky no desktop e o resultado ("N de M com reserva online") vive no próprio formulário. A MESMA página carrega o **comparador de app ou de carro** (centralizado aqui em 15/08/2026, sem URL própria; a antiga `/uber-ou-estacionamento-aeroporto` redireciona): duas corridas (ida + volta) contra o menor estacionamento da duração. Uber e 99 **não têm API de preço para terceiros** (a do Uber proíbe comparação nos termos), então o lado do app é **estimativa declarada** (`comparadorApp.logic.ts`: tarifa de referência com fonte/data, minutos a 30 km/h, mínima), com distância em km, tarifa dinâmica (1x-2x), campo para a corrida real do usuário e combustível opcional; break-even por diárias e metodologia aberta com aviso de marcas na própria página. Os dois cálculos são separados por uma pergunta explícita no topo ("O que você quer calcular?", decidida em 16/08/2026): o modo estacionamento (default, pré-renderizado) mostra só o ranking; o modo app habilita os campos e a conta específicos, e `?modo=app` (usado pelo redirect da URL antiga) pré-seleciona. Quando estacionar vence, o veredito recomenda a vaga do menor total com CTA de reserva que leva a duração calculada para a página da vaga via `?from/to` (`reservaWindow`: entrada D+1 às 22h, saída +N às 08h, que fecha N diárias no motor). Link no rodapé do consumer |

O `<slug>` é o mesmo da `destination` (contrato de URL compartilhado com
`/destinos/<slug>`). Só destino publicado com pelo menos uma unidade listada e
precificada ganha página.

### Regras de exibição (as que não se negociam)

- **Nada "sob consulta".** Unidade sem preço em nenhuma duração fica fora (filtro na
  própria RPC). É o diferencial contra o índice do concorrente, cheio de célula vazia.
- **Balcão só quando maior.** `old_price` igual ou menor que o online não é economia e
  não renderiza riscado (`economyPct` devolve null).
- **Estadia mínima aparece como regra, não como buraco.** Célula abaixo do piso mostra
  "entrada a partir de N diárias" (o motor devolve null abaixo da primeira faixa; ver
  [espelhamento-preco-wl.md](./espelhamento-preco-wl.md)).
- **Moto compara com moto.** `parking_type_code = motorcycle` sai da tabela de carro e
  dos resumos; ganha seção própria quando existe.
- **Data à vista.** "Conferido no motor de reservas em <data do build>" e a data da
  tabela de parceiro mais recente (`max(pricing_rule.updated_at)`).
- **ADR-009:** preço exibido é fato da tabela do parceiro (o mesmo da vitrine/busca); o
  CTA "Reservar" leva para `/p/...`, onde as promessas de transação já são gateadas por
  capacidade. Esta página não promete cancelamento, vaga garantida nem serviço.

## Dado: RPC `destination_price_index`

Migration `20260814154329_destination_price_index.sql`. Função pública
(`security invoker`, executável por `anon`), uma chamada devolve o índice inteiro:

```
destination_price_index(p_days int[] default '{1,7,15,30}', p_destination text default null)
  → { days: int[], destinations: [{ slug, code, name, short_name, type, city, state,
      units: [{ company_slug, company_name, location_slug, location_name,
                parking_type_code, parking_type_name, checkout_mode,
                review_avg, review_count, has_shuttle, shuttle_minutes,
                distance_m, min_stay_days, price_updated_at,
                prices: [{ days, total, old_total }] }] }] }
```

- O preço vem de `simulate_price` (motor no Postgres, ADR: nunca recalcular em TS);
  `old_total` é o balcão (`old_price_strategy`).
- `distance_m` é `ST_Distance(location.geog, destination.geog)` (PostGIS, ADR-001).
- Filtros espelham a RLS de catálogo: destino publicado, unidade listada/ativa, empresa
  ativa com onboarding ativo, vaga ativa com `pricing_rule`.
- Guarda anti-abuso: no máximo 8 durações, entre 1 e 60; fora disso a função recusa.
- pgTAP: `supabase/tests/price_index.test.sql` (grants, matriz 4 entradas, motor real,
  balcão, piso de estadia, unidade não listada/destino oculto fora, leitura como anon).

## Frontend

- `src/features/price-index/priceIndex.logic.ts`: lógica pura testada (ordenação por
  7 diárias, melhor preço por coluna, economia, resumos answer-first, meta description
  derivada do dado; `buildAirportSections` monta a seção de cada aeroporto com parceiro
  na frente e lote mapeado completando o corte de 5, `matchesAirportFilter` resolve a
  lateral de filtros). `api.ts` só transporta a RPC.
- `src/routes/precos.tsx` e `src/routes/precos-destino.tsx`: páginas finas; loaders em
  `routes.tsx` (`precosLoader`/`precosDestinoLoader` + `fetchAllPrecosPaths`). O loader
  do destino busca o índice inteiro porque o fim da página cruza com os demais. O
  `precosLoader` soma o catálogo de aeroportos publicados e os lotes mapeados de cada um
  (RPC `destination_prospect_cards`, em blocos de 6 para não esbarrar no statement
  timeout do anon durante o build).
- Tabela responsiva com um DOM só: `<table>` real no desktop (semântica para crawler);
  no mobile as linhas viram cartões via CSS (`block`/`grid` até `tablet:`), com o rótulo
  da duração dentro da célula.

## SEO / GEO

- Title/H1 com a consulta ("Preços de estacionamento em Guarulhos (GRU): diária, 7, 15
  e 30 dias"); meta description derivada do dado (menor diária + 7 dias).
- JSON-LD: `BreadcrumbList` + uma **lista de `Product`** com `AggregateOffer` por
  estacionamento, nas **três** páginas de preço (`/precos`, `/precos/<slug>` e
  `/estacionamento-mais-barato/<slug>`), de uma função só: `priceTableOffersSchema`, em
  `src/lib/jsonld.ts` (testes em `jsonld.test.ts`). O índice mantém, ao lado, o `ItemList`
  de links das páginas e o `Dataset`. O que o bloco publica e o que ele cala:
  - **Array de `Product`, sem invólucro de `ItemList`.** O teste de resultados ricos lê um
    `ItemList` como tentativa de **carrossel**, que só existe para Course, Movie, Recipe e
    Restaurant, e reprovava a página com "Carousels: 1 invalid item" mesmo com os produtos
    válidos ao lado (medido em 16/09/2026). Vários produtos num `script` só é o formato que
    o Google documenta para página que lista produtos, e a ordem do array é a da tabela.
  - `lowPrice`/`highPrice` são o menor e o maior **total** da linha, que é o número que a
    célula mostra; `priceSpecification` traz a **escada** (`UnitPriceSpecification` com a
    diária de cada janela e o `eligibleQuantity` de dias em que ela vale).
  - `validFrom` é a data de conferência que a página exibe, e `priceValidUntil` é ela mais
    **90 dias**, o mesmo teto de frescor que o projeto já aplica a preço pesquisado
    (`preco_pesquisado_fresco`). Não é congelamento: mudou a tabela do parceiro, a
    publicação automática regera a página com janela nova. O campo existe porque quem lê
    só o JSON-LD não enxerga a data na tela, e citação de preço envelhece sem aviso. Isto
    substitui a decisão anterior de deixar `priceValidUntil` fora.
  - Sem `availability`: afirmar `InStock` é prometer vaga garantida, e quem controla o
    estoque da unidade externa é o parceiro (ADR-009). Sem `aggregateRating`: a nota é da
    unidade e mora na página dela.
  - Linha sem preço em duração nenhuma fica fora da lista (segue visível na tabela), e
    lista sem nenhum item precificado não emite bloco: `Product` sem `offers` e `ItemList`
    vazia são itens inválidos para o Google.
  - **Uma entrada por URL.** A tabela tem uma linha por vaga e a ficha é do lote, então
    coberta e descoberta do mesmo estacionamento viram um `Product` só, com a faixa
    cobrindo as duas tabelas e sem a escada (duas tabelas dariam dois preços para a mesma
    janela). Dois `Product` com a mesma URL são a mesma entidade dita duas vezes; no
    formato de lista o Google chegava a reprovar com "Identical property values given, but
    unique values are required", e a página do destino publicava 19 itens para 15 fichas.
    O `destinationOffersSchema` (vitrine do destino) recebeu a mesma junção e também perdeu
    o invólucro de lista, e o guard `bun run lint:schema` passou a reprovar URL repetida em
    `ItemList`, para o caso voltar a aparecer onde a lista ainda existe.
  - A página do destino (`/estacionamentos/<slug>`) usa o `destinationOffersSchema`, que é
    outro bloco (mistura parceiro e lote mapeado), e ganhou a mesma validade.
  - A **calculadora** fica de fora de propósito: o que ela mostra muda com o que a pessoa
    digita, e schema tem que espelhar a tela. Ela emite `WebApplication`.
- Gêmeo Markdown no build (`scripts/generate-geo-artifacts.mjs`): `dist/precos.md` e
  `dist/precos/<slug>.md` com a mesma ordem de blocos e a tabela em Markdown; servidos
  pelo worker via `Accept: text/markdown`. O `precos.md` fecha com a lista de aeroportos
  ainda sem parceiro precificado (link para `/destinos/<slug>`), espelhando a cobertura
  total da página. Tabelas também inline no `llms-full.txt`; seção própria no
  `public/llms.txt`.
- Sitemap: `getPrecosRoutes` em `vite.config.ts` (mesma RPC do loader, sem divergência).
- Cobertura de rota: `e2e/windup/precos.json` e `precos-destino.json`.
- Indexação: vale a regra de host de [seo-indexacao.md](./seo-indexacao.md) (hoje
  o Hub respondia noindex no `hub.movepark.co`; desde 18/08/2026 as páginas estão no ar e indexáveis no `movepark.co`).

## Endpoint JSON, datado (`/precos.json`)

> **Decidido em 16/09/2026 (Conteúdo 24).** O índice responde em JSON **como asset
> estático regerado no build**, e **não** como rota da Public API. A alternativa foi
> avaliada e recusada pelos motivos abaixo; o registro fica aqui e em
> [public-api.md](./public-api.md) §9.1 para a ausência ser decisão, não drift.

| Arquivo | Conteúdo |
|---|---|
| `/precos.json` | o índice inteiro: todos os destinos precificados, cada unidade, cada duração, mais a lista de destinos publicados **sem** reserva online |
| `/estacionamentos/<destino>/precos.json` | o mesmo payload recortado num destino, ao lado do `precos.md` daquele aeroporto |

### Por que não é rota da Public API

1. **Quem procuramos não tem chave.** Toda rota do gateway exige
   `Authorization: Bearer mp_live_…` (§5 de `public-api.md`). O consumidor deste
   índice é o crawler de IA e o agente que acabou de ler o `llms.txt`, que não passa
   por cadastro de chave. Atrás de autenticação, o endpoint entrega zero do que o
   Conteúdo 24 quer.
2. **O gateway é tenant-scoped por princípio** (§1, princípio 2): toda chave pertence
   a uma `company` e só enxerga o dado dela. O índice é cross-tenant por definição.
3. **Custo e latência.** São 39 KB planos na borda do Cloudflare: nenhuma ida ao
   Postgres, nenhum `simulate_price` por requisição, nada entrando na contabilidade de
   rate-limit por chave.
4. **Uma fonte, três formatos.** Página, gêmeo Markdown e JSON saem do **mesmo retrato
   do build**, então nunca divergem. Uma rota ao vivo responderia um número diferente
   do que a página mostra assim que um parceiro editasse a tabela, e aí a promessa de
   "data como campo de desempate" cai.

Se um parceiro pedir o índice ao vivo por chave, o caminho já existe sem rota nova:
`POST /v1/pricing/simulate` (escopo `pricing:read`), tenant-scoped, é a mesma conta.

### ADR-003 nesta entrega

Não é rota do gateway nem tool de MCP, então não há path no `openapi.yaml` nem escopo
no catálogo `api_scope` (o `lint:openapi` reprovaria um escopo órfão sem rota). A
obrigação de nascer documentado foi cumprida nas três superfícies de descoberta:
esta seção, o `service-desc` do
[`/.well-known/api-catalog`](../../public/.well-known/api-catalog) e a seção "Índice de
preços" do [`public/llms.txt`](../../public/llms.txt).

### Formato

Montado por `scripts/price-index-json.mjs` (puro, sem rede e sem `fs`) e escrito por
`scripts/generate-geo-artifacts.mjs`. Teste: `scripts/price-index-json.test.mjs`, no
gate `bun run test` (o projeto `unit` do Vitest passou a incluir
`scripts/**/*.test.mjs`).

```
{ version: 1, index, scope: "all" | "<slug do destino>", generated_at,
  currency: "BRL", source, attribution, license, usage, methodology_url, html_url,
  markdown_url, days: int[], counts: { destinations, locations, units },
  destinations: [{ slug, code, name, short_name, type, city, state,
    url, prices_url, prices_json_url,
    cheapest: [{ days, total, per_day, company_name, parking_type_name, url }],
    units: [{ company_slug, company_name, location_slug, location_name,
              parking_type_code, parking_type_name, url, checkout_mode,
              distance_m, has_shuttle, shuttle_minutes, review_avg, review_count,
              min_stay_days, price_updated_at,
              prices: [{ days, total, old_total, per_day }] }] }],
  destinations_without_online_booking: [{ slug, code, name, type, city, state, url }] }
```

- **`price_updated_at` é o campo de desempate**, o que o Conteúdo 24 pede: a data da
  tabela *daquele parceiro*, por unidade, não uma data global do arquivo. O
  `generated_at` diz quando o retrato foi tirado; os dois juntos respondem "qual fonte
  está mais nova" quando o índice divergir de outra.
- Mesmas regras de exibição da página: `old_total` só quando é **maior** que o online,
  `total: null` embaixo do piso de `min_stay_days`, e `cheapest` ignora moto (a vaga de
  moto continua em `units`, com o `parking_type_code` dizendo o que é).
- `per_day` vem calculado para o agente não errar a divisão.
- `version` sobe só em mudança incompatível; campo novo é aditivo.
- `destinations_without_online_booking` só existe no índice completo. Sem ele o JSON
  diria "6 aeroportos" e calaria sobre os outros 20 que a Movepark cobre, que é a
  leitura errada de cobertura. O gêmeo Markdown traz a mesma lista, só de aeroporto,
  porque lá o bloco é editorial.
- `license` repete a **CC BY 4.0** que o `Dataset` (JSON-LD) da página `/precos` já
  declara, e o `/precos.json` entra como `DataDownload` daquele `Dataset`
  (`datasetSchema` em `src/lib/jsonld.ts`): quem chega pelo schema descobre o JSON, e
  quem chega pelo JSON lê a mesma permissão.
- CORS liberado em `public/_headers` (`Access-Control-Allow-Origin: *`): sem isso o
  arquivo não abre de dentro de um navegador. **Só CORS naquele bloco, nunca
  `Content-Type`**, e isso foi medido em produção em 16/09/2026: o `_headers` é
  aplicado antes do worker, então declarar `application/json` no padrão
  `/estacionamentos/:destino/precos.json` rotulava também o fallback da SPA. Destino
  que não existe caía no `index.html`, a guarda `type.includes("text/html")` do worker
  deixava de reconhecer o HTML, e a resposta saía com 200, content-type de JSON e 94 KB
  da casca do app. O tipo certo já vem da extensão do asset.

## Atualização

Sem coleta manual e sem tabela própria: o índice é um retrato do motor a cada build.
Push na `main` (ou rebuild por webhook) republica tudo, incluindo os gêmeos Markdown
e o `precos.json`.
Parceiro novo com preço entra sozinho; destino sem unidade precificada sai sozinho.
