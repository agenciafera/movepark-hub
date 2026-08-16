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
| `/calculadora-estacionamento-aeroporto` | Calculadora (pedida em 14/08/2026, benchmark da calculadora do concorrente): destino + diárias (1 a 60, atalhos 1/7/15/30) viram o ranking do motor com balcão, economia e botão Reservar. Durações da matriz padrão respondem com o dado do build (SSG abre já calculada: primeiro destino, 7 diárias); outras vão à RPC com uma duração só, memoizada por consulta (`calculadora.logic.ts` + `fetchPriceForDays`). Estadia mínima sai da conta com o motivo visível. O select cobre **todos os destinos publicados** (decidido em 15/08/2026): sem parceiro precificado, a lista mostra os lotes mapeados ("consulte a tabela no local") ou o aviso de mapeamento, com CTA seja-parceiro; a sidebar de filtros fica sticky no desktop e o resultado ("N de M com reserva online") vive no próprio formulário. A MESMA página carrega o **comparador de app ou de carro** (centralizado aqui em 15/08/2026, sem URL própria; a antiga `/uber-ou-estacionamento-aeroporto` redireciona): duas corridas (ida + volta) contra o menor estacionamento da duração. Uber e 99 **não têm API de preço para terceiros** (a do Uber proíbe comparação nos termos), então o lado do app é **estimativa declarada** (`comparadorApp.logic.ts`: tarifa de referência com fonte/data, minutos a 30 km/h, mínima), com distância em km, tarifa dinâmica (1x-2x), campo para a corrida real do usuário e combustível opcional; break-even por diárias e metodologia aberta com aviso de marcas na própria página. Os dois cálculos são separados por uma pergunta explícita no topo ("O que você quer calcular?", decidida em 16/08/2026): o modo estacionamento (default, pré-renderizado) mostra só o ranking; o modo app habilita os campos e a conta específicos, e `?modo=app` (usado pelo redirect da URL antiga) pré-seleciona. Link no rodapé do consumer |

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
- JSON-LD: `BreadcrumbList` + `ItemList` de `Product` com `AggregateOffer` (faixa real
  entre as durações) por unidade; no índice, `ItemList` das páginas.
- Gêmeo Markdown no build (`scripts/generate-geo-artifacts.mjs`): `dist/precos.md` e
  `dist/precos/<slug>.md` com a mesma ordem de blocos e a tabela em Markdown; servidos
  pelo worker via `Accept: text/markdown`. O `precos.md` fecha com a lista de aeroportos
  ainda sem parceiro precificado (link para `/destinos/<slug>`), espelhando a cobertura
  total da página. Tabelas também inline no `llms-full.txt`; seção própria no
  `public/llms.txt`.
- Sitemap: `getPrecosRoutes` em `vite.config.ts` (mesma RPC do loader, sem divergência).
- Cobertura de rota: `e2e/windup/precos.json` e `precos-destino.json`.
- Indexação: vale a regra de host de [seo-indexacao.md](./seo-indexacao.md) (hoje
  `hub.movepark.co` responde noindex; as páginas nascem prontas para o cutover).

## Atualização

Sem coleta manual e sem tabela própria: o índice é um retrato do motor a cada build.
Push na `main` (ou rebuild por webhook) republica tudo, incluindo os gêmeos Markdown.
Parceiro novo com preço entra sozinho; destino sem unidade precificada sai sozinho.
