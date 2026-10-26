# Autoridade e backlinks: menos volume, mais link que conta

> **Status:** aberto em 01/10/2026, com as atividades Conteúdo 60 a 74 no ClickUp, todas com o Diego.
> **Atividade-mãe:** [Autoridade e backlinks](https://app.clickup.com/t/17tn9e9gfg2).
>
> **Depende de:**
> - [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md): o plano de conteúdo, o placar de citação em IA e as metas de posição. Esta spec cobre a parte que ele não cobre: autoridade de domínio.
> - [ataque-cnf-bepark.md](./ataque-cnf-bepark.md): as pautas de imprensa de BH (Conteúdo 55 e 56) já moram lá e não se repetem aqui.
> - [selo-parceiro.md](./selo-parceiro.md): o selo existe desde 11/09/2026; aqui entra a adoção.
> - [seo-indexacao.md](./seo-indexacao.md): domínio canônico, redirects e política de índice.
>
> **Dados:**
> - Semrush, painel de SEO e visão geral de backlinks de `movepark.co`, retrato de 29/09/2026 (print enviado pelo Diego em 30/09).
> - WhitePress, painel do anunciante dos projetos Movepark e Virapark, enviado pelo Diego em 01/10/2026.
> - Search Console de 31/08 a 14/09/2026 ([dados/gsc-baseline-2026-09-14](./dados/gsc-baseline-2026-09-14/)).
> - Auditoria de 13/10/2026 (Conteúdo 63): Backlink Audit do Semrush, relatório de Links do Search
>   Console e lista de compras do painel do WhitePress
>   ([dados/backlinks-auditoria-2026-10-13](./dados/backlinks-auditoria-2026-10-13/)). Seção 2.7.
> - Auditoria de 26/10/2026 (Conteúdo 65): auditoria própria do site inteiro, Auditoria do Site e
>   On Page SEO Checker do Semrush ([dados/auditoria-site-2026-10-26](./dados/auditoria-site-2026-10-26/)).
>   Seção 2.8.

## 1. O diagnóstico em uma frase

A Movepark compra **volume** de link, mas o que sobe posição é **autoridade**, e ela não se mexeu:
o Authority Score do Semrush está em **25 há 12 meses**, com os domínios de referência crescendo
22% no mesmo período. E a pouca autoridade que existe aponta para as páginas que não vendem.

## 2. O retrato de 29/09/2026

| Métrica | Valor | Leitura |
|---|---|---|
| Authority Score | **25** (estável há 12 meses) | O volume novo não pesa |
| Domínios de referência | 762 (+22%) | Cresce, mas veja a qualidade abaixo |
| Backlinks | 2,4 milhões (+28%) | ~3.100 links por domínio: rodapé e rede automática, não matéria |
| Domínios com AS 0 a 10 | **672 de 762 (90%)** | Acima de AS 40 são cerca de 10 |
| Sub-redes de origem | 294 para 762 domínios | Poucos donos controlando muitos sites |
| Domínios do Brasil | **15** | Singapura 64, EUA 48, Moldávia 19 |
| Domínios `.br` | 56 (7%) | `.com` 501, `.shop` 38 |
| Domínios de viagem e turismo | 15 (2%) | O nicho que dá relevância quase não aparece |
| Follow / nofollow | 81% / 19% | |
| Pontuação de toxicidade | não medida | Medida em 05/10/2026: **Alta** (seção 2.6) |
| Tráfego orgânico (estimado) | 2,6 mil/mês (+26,8%) | |
| Palavras orgânicas | 5,7 mil (+22%) | |
| Saúde do site | 76%, 35 erros, 248 avisos | Mas só **100 páginas** rastreadas, contra 934 no GSC |
| Monitoramento de posição | 9 termos, 1 no top 3, 5 no top 10 | Amostra pequena, com marca de parceiro misturada |
| Visibilidade em IA | 17, 8 menções, 117 páginas citadas | ChatGPT 5 menções, Gemini 0 |

### 2.1 As âncoras denunciam a origem

Entre as âncoras mais usadas aparece, mais de uma vez, "high quality do...ks online cheap"
("backlinks dofollow baratos"). É assinatura de rede de venda de link: pacote barato comprado em
algum momento ou SEO negativo de terceiro. O pico de domínios novos em agosto e setembro (até 59
por semana no gráfico) coincide com o crescimento sem efeito no Authority Score. **Antes de
qualquer limpeza, era preciso saber se esse pico foi compra nossa.

**Respondido em 01/10/2026 pelo histórico do WhitePress (seção 2.4): não foi.** Em agosto de 2026
saiu uma única publicação paga, e em setembro nenhuma. As centenas de domínios novos do pico vieram
de fora, por rede de spam ou SEO negativo, e são o alvo da auditoria da Conteúdo 63.

**Auditado em 13/10/2026 (seção 2.7):** o pico é uma rede automática que vende PBN e link e usa
`aeromixparkestacionamento.com`, `movepark.com.br` e `movepark.co` como isca na âncora. O template só
troca o nome do domínio, padrão de spam em massa, e o Google não lista nenhum desses domínios no
Search Console.

### 2.2 A autoridade está nas páginas erradas

| Página | Domínios de ref. | Posição média no GSC (31/08 a 14/09) |
|---|---|---|
| Ponce Park (`/estacionamento/ponce-park-guarulhos`, 301 para a ficha) | 316 + 83 | lote mapeado, sem contrato (ADR-010) |
| Home | 171 | |
| `/estacionamentos/aeroporto-viracopos` | 100 | 12 a 25 nos termos de cabeça de VCP |
| `/estacionamentos/aeroporto-guarulhos` | **17** | **40 a 55** nos termos de cabeça de GRU |

Viracopos tem link e está na primeira ou segunda página. Guarulhos, o maior mercado, quase não tem
e está na quarta ou quinta. A página que mais concentra autoridade é a ficha de um lote que não
vende. O 301 da URL antiga funciona (conferido em 30/09/2026: responde 301 para
`/estacionamentos/aeroporto-guarulhos/ponce-park`), então a força chega na ficha. Falta ela escoar
para a página do destino.

### 2.3 O domínio antigo

O Semrush aponta `movepark.com.br` como o perfil de links mais parecido com o nosso (40% de
sobreposição). Em 30/09/2026, nem `https://movepark.com.br` nem uma URL antiga de ficha
responderam com cabeçalho HTTP no teste feito daqui. Se o domínio estiver fora do ar ou sem 301
caminho a caminho, os links dele não passam para o `movepark.co`. É o item mais barato e
possivelmente o de maior efeito do plano (Conteúdo 60). Atenção: o `movepark.com.br` sobrevive
como `wl_domain` de backend legado por empresa, então o redirect não pode quebrar subdomínio de
white-label.

**Medido em 05/10/2026 (Conteúdo 60).** O domínio está ativo (registro até 30/11/2028, zona no
Cloudflare com o mesmo par de nameservers do `movepark.co`) e **já respondia 301**: uma regra de
redirect no painel da zona antiga troca só o domínio e preserva o caminho
(`<qualquer>.movepark.com.br/<caminho>` → `<qualquer>.movepark.co/<caminho>`). O teste de 30/09
provavelmente esbarrou num timeout de rede. O problema real era a **cadeia**:

| URL antiga | Antes | Saltos |
|---|---|---|
| `movepark.com.br/` | → `movepark.co/` | 1 |
| `www.movepark.com.br/` | → `www.movepark.co/` → `movepark.co/` | 2 |
| `movepark.com.br/estacionamento/ponce-park-guarulhos/` | → `movepark.co/estacionamento/...` → `/estacionamentos/aeroporto-guarulhos/ponce-park` | 2 |
| `www.movepark.com.br/estacionamento/ponce-park-guarulhos/` | → `www.movepark.co/...` → `movepark.co/...` → destino | 3 |

**O que mudou.** O `src/worker.ts` passou a atender o apex e o `www` do domínio antigo
(`redirecionaAlias`, host em `LEGACY_SITE_HOST` de `src/lib/site-host.mjs`, rotas em
`wrangler.jsonc`) e resolve a URL pelos mesmos mapas de 301 do apex: o primeiro salto já é o
destino final. O `www.movepark.co` ganhou o mesmo tratamento.

**Depois do deploy (05/10/2026, commit `17611da7`).** A rota do worker passou na frente da regra
da zona sem mexer no painel. As quatro URLs da tabela acima, e também
`www.movepark.co/estacionamento/ponce-park-guarulhos/`, respondem **um 301 só** para o destino
final, que responde 200. Para conferir de novo:
`curl -sI https://www.movepark.com.br/estacionamento/ponce-park-guarulhos/` tem que trazer
`location: https://movepark.co/estacionamentos/aeroporto-guarulhos/ponce-park`. A regra do painel
continua lá e segue valendo para os subdomínios, que o worker não atende.

**White-label.** Os `wl_domain`/`wl_public_domain` do banco estão todos em `*.movepark.co`
(`nationpark-app.movepark.co` etc.). Os oito pares antigos em `.movepark.com.br` respondem 301
para o equivalente em `.movepark.co`, antes e depois do deploy, e continuam na regra da zona,
fora do worker. Os `*-app.movepark.co` respondem 302 para `/backend/auth` e os públicos 200.

### 2.4 O histórico do WhitePress

| Projeto | Publicações pagas | Inserções de link | Gasto total | Últimos 12 meses |
|---|---|---|---|---|
| Movepark | 33 | 4 | R$ 16.964,86 + R$ 1.954,72 = **R$ 18.919,58** | 4 em nov/2025 (cerca de R$ 3.000) e 1 em ago/2026; nos outros meses, nada |
| Virapark | 18 (+1 pendente) | 3 | R$ 12.770,75 + R$ 2.392,00 = **R$ 15.162,75** | 9 entre out/2025 e mar/2026 e 1 em ago/2026 |

Saldo na conta em 01/10/2026: R$ 2.457,17; em 13/10/2026, R$ 4.457,17; em 14/10/2026, depois dos
quatro pedidos de outubro (seção 4.3), R$ 432,17. A lista de pedidos do
painel, lida em 13/10, data a única publicação recente (`guiadoviajante.com.br`) em 24/09/2026.

Três leituras:

1. **O custo médio é de cerca de R$ 510 por link** no projeto Movepark (R$ 18.919,58 por 37
   itens). Com os 37 dentro de um perfil de 762 domínios e o Authority Score parado em 25, a compra
   antiga não escolheu por autoridade. A Conteúdo 63 confere o AS de cada um dos 37 sites.
2. **A compra foi em rajada, não constante:** um lote em novembro de 2025 e quase nada depois.
   O plano troca isso por ritmo mensal.
3. **O projeto Virapark leva quase metade do investimento** e fortalece `virapark.com.br`, não o
   `movepark.co` (o Semrush mostra 21% de sobreposição entre os dois perfis). Daqui pra frente,
   compra para parceiro só com motivo comercial explícito; o padrão é apontar para a ficha do
   parceiro dentro do `movepark.co`, que soma para a página do aeroporto. **Atualizado em
   13/10/2026 (seção 4.3):** a verba passou a ser dividida entre Movepark e Virapark, e todo
   artigo pago pela Virapark também leva link para o `movepark.co`.

### 2.5 O que o print traz e que não deve guiar decisão

- O widget "Rankings orgânicos" do painel estava configurado para **United States**, por isso aparecia
  zerado. Trocado para Brasil em 05/10/2026.
- O Traffic Analytics é estimativa de painel. A queda de 71% no tempo médio só vira problema depois
  de conectar GA e GSC ao Semrush e confirmar com dado real.

### 2.6 O projeto do Semrush em 05/10/2026 (Conteúdo 61)

**A conta é do plano gratuito.** Isso define o que o painel consegue medir, e decidimos não assinar
(05/10/2026). O que mudou, o que ficou de fora e por quê:

| Item | Estado | Observação |
|---|---|---|
| Widget "Rankings orgânicos" | **Brasil** | Estava em United States; a troca persiste ao recarregar |
| Backlink Audit | **Configurado e rodado** | Já conectado ao Search Console; primeira rodada concluída em 05/10 |
| Search Console | Conectado ao Backlink Audit | |
| Google Analytics | **Desconectado** | O Organic Traffic Insights pede "Reconectar conta". Autorização OAuth na conta Google, feita por quem administra o GA |
| Auditoria do site acima de 1.000 páginas | **Bloqueada pelo plano** | O limite por auditoria é fixo em 100 no gratuito ("Você atingiu o limite de rastreamento 100/100") |
| Domínios novos com AS ≥ 20 por mês | **Bloqueado pelo plano** | O relatório completo de domínios de referência, que traz a data de descoberta, redireciona para a visão geral no gratuito |

**Primeira nota de toxicidade (Backlink Audit, 05/10/2026): Alta.**

| | Tóxicos | Potencialmente tóxicos | Não tóxicos | Total analisado |
|---|---|---|---|---|
| Domínios de referência | 217 (57,4%) | 35 (9,3%) | 126 (33,3%) | 378 |
| Backlinks | 676 | 84 | 937 | 1,7 mil |

Insights do relatório: 68 domínios tóxicos novos e 16 potencialmente tóxicos; 113 domínios com o
mesmo título de página e 81 numa rede de links por caminho de URL (assinatura de rede); 631 backlinks
com âncora frequente e 236 de domínio desindexado; 93,7% dos domínios com AS de 0 a 20. O Backlink
Audit analisa 378 dos 851 domínios que a Análise de backlinks conta, então a nota vale para essa
amostra. **Atenção para a Conteúdo 63:** o `virapark.com.br` (parceiro, 146 backlinks, AS 28)
aparece como tóxico com TS 42. Rede de parceiro não entra em disavow pela nota da ferramenta.

**Retrato da Análise de backlinks no mesmo dia:** 851 domínios de referência (+11%), 2,6 mil
backlinks, Authority Score 25. Por faixa de AS: 50 domínios com AS acima de 20 (22 de 21 a 30, 17 de
31 a 40, 11 acima de 40), 32 de 11 a 20 e 770 de 0 a 10. Brasil segue com 15 domínios. Auditoria do
site (02/10, 100 páginas): saúde 82%, 13 erros, 204 avisos.

**Como medir sem o plano pago.** A auditoria completa e a linha de base de AS ≥ 20 por mês saem de
fonte própria; ver a seção 5.5.

### 2.7 A auditoria de 13/10/2026 (Conteúdo 63)

Fontes: Backlink Audit do Semrush (no plano gratuito, os resumos e a busca por domínio), relatório de
Links do Search Console e o painel do anunciante do WhitePress. Arquivos em
[dados/backlinks-auditoria-2026-10-13](./dados/backlinks-auditoria-2026-10-13/).

**O Google conta outra coisa.** O Search Console lista **60 domínios** (455 links externos) para o
`movepark.co`; o Semrush conta 851. Nenhum domínio das redes de spam abaixo aparece no Search
Console. O pico infla a contagem do Semrush e fica fora da do Google. E não mexeu o Authority Score
porque os domínios dele têm AS de 2 a 6.

**A origem do pico de agosto e setembro.** Não foi compra nossa: a única publicação do WhitePress no
período é a do `guiadoviajante.com.br`, publicada em 24/09/2026. O template troca só o nome do
domínio na âncora, padrão de spam em massa, e se divide em três redes:

| Rede | Domínios | Assinatura | Desde | Decisão |
|---|---|---|---|---|
| 1. Venda de PBN e link | 51 entre os 100 maiores; as âncoras do template somam cerca de 216 | Título "Boost your Google rankings with Premium PBN & Link Building", âncora "High Quality Dofollow Backlinks DA 50 PA 40 Premium PBN Network Service *domínio* ... Buy Backlinks Online Cheap" ou "Reliable Manual Outreach Backlinks for *domínio*". Follow, Cloudflare nos EUA, cassino e `.shop`/`.online` | jun a set/2026: **é o pico** | Disavow |
| 2. "Aged domains" | 15 | Título "Where to buy aged domains and backlinks", âncora com o domínio puro. Sub-redes repetidas: 118.139.x (Singapura), 184.168.115.60 e 103.224.212.142 | fev/2026 | Disavow |
| 3. Página de estatística | 19 | "seo domain research", "Website Stats", "Domain Report", "URL Shared", quase tudo no IP 195.20.19.178 | out/2025 | Fora: é `nofollow` e não passa nada |

As três miram os mesmos nomes: `aeromixparkestacionamento.com`, `movepark.com.br` e `movepark.co`.
O `aeromixparkestacionamento.com` é domínio nosso (está na mesma conta do Cloudflare) e faz 301 para
`/estacionamentos/aeroporto-viracopos/`. É dele a âncora mais usada do perfil (135 domínios), e
Viracopos continua entre as posições 12 e 25, então a rede não derrubou a página. Detalhe: o 301 dele
leva **dois saltos** (o destino tem barra no fim e o site tira a barra). Dá para resolver como foi
feito com o `movepark.com.br` na Conteúdo 60.

**O spam que o Google enxerga.** Dos 60 domínios do Search Console, 13 são comentário ou fórum, todos
para a URL antiga `movepark.com.br/estacionamento/ponce-park-guarulhos/` (fórum coreano, blog de
lorem ipsum, site do governo da Nigéria). No Semrush, os dois do mesmo padrão que aparecem
(`abc1.com.br` e `fismat.com.br`, ambos `nofollow`) são de out/2025 a abr/2026. Sete têm link sem `nofollow` ou não
deu para conferir, e entraram no disavow. Nos outros seis o link é `ugc`/`nofollow` ou já saiu. A
origem não aparece; a âncora é de cabeça de Guarulhos ("estacionamento perto aeroporto Guarulhos"),
padrão de pacote barato de link.

**Disavow enviado em 13/10/2026, às 14:14.** 73 domínios (51 da rede 1, 15 da rede 2, 7 de comentário
e fórum), no arquivo [`disavow.txt`](./dados/backlinks-auditoria-2026-10-13/disavow.txt), com o
motivo de cada grupo. A ferramenta não aceita propriedade de domínio, então foi criada a propriedade
por prefixo **`https://movepark.co/`** no Search Console, verificada sozinha pelo DNS da propriedade
de domínio. Ficou de fora: parceiro (inclusive o `virapark.com.br`, que o Semrush marca com TS 42),
site editorial, toda compra do WhitePress e link `nofollow`. A expectativa é de efeito perto de zero
no ranking, porque o Google já não lista esses domínios; o disavow é um seguro barato contra uma
revisão manual que leia âncora de venda de link. Para mudar a lista, use "Substituir" na mesma página:
o arquivo novo apaga o anterior. Limite conhecido: o plano gratuito do Semrush lista os 100 maiores
domínios, então cerca de 160 da rede 1 não aparecem por nome. Se algum deles entrar no Search
Console, entra no arquivo.

**As 37 compras do WhitePress, uma a uma.** A lista do painel (projeto Movepark) soma exatamente
R$ 18.919,58: 33 publicações e 4 inserções. Planilha com URL, destino, status e AS em
[`whitepress-compras.csv`](./dados/backlinks-auditoria-2026-10-13/whitepress-compras.csv).

| Situação em 13/10/2026 | Compras | Valor |
|---|---|---|
| No ar, com link dofollow | 33 | R$ 17.206,36 |
| Perdidas: o `egobrazil.ig.com.br` virou `egobrazil.com.br` e o post sumiu; o `atendimentoaocliente.app.br` responde 404 | 2 | R$ 966,00 |
| Sem como conferir daqui: o `dropsdejogos.uai.com.br` está "Indisponível no Brasil" e o `agendaculturalporto.org` exige desafio do Cloudflare. O Google lista as duas | 2 | R$ 747,22 |

Para onde vão os 33 links no ar, já depois do 301:

| Destino final | Links |
|---|---|
| `/estacionamentos/aeroporto-viracopos` | 9 |
| `/estacionamentos/aeroporto-curitiba/nationpark` | 5 |
| `/estacionamentos/aeroporto-guarulhos` | 5 |
| `/estacionamentos/aeroporto-guarulhos/ponce-park` (lote sem contrato) | 4 |
| `/estacionamentos/aeroporto-curitiba` | 4 |
| Fichas de Viracopos (GarageInn 2, Virapark 1) | 3 |
| Home, `/precos` e `virapark.movepark.co` | 3 |

Três leituras:

1. **Nenhum link comprado cai em 404.** Sete posts apontam para URL antiga (`/estacionamento/...`,
   `/estacionamentos/campinas`) e todos chegam numa página viva com um 301 só.
2. **Guarulhos, o maior mercado, recebeu 5 dos 33**, e outros 4 foram para a ficha do Ponce Park. A
   Conteúdo 64 (link interno da ficha para a página de Guarulhos) recupera parte disso.
3. **A compra mais recente é a pior.** O `guiadoviajante.com.br` (24/09/2026, R$ 805) tem AS 8 e cerca
   de 10 visitas orgânicas por mês no Semrush; o `webcitizen.com.br` (3 compras) tem AS 20 e o mesmo
   tráfego. Pela regra da seção 4, nenhum dos dois entraria hoje. Os portais em subdomínio de
   `ig`, `uol`, `r7` e `uai` mostram o AS da raiz (72 a 98), não o da seção que publica, como a seção
   4.1 já alertava.

O AS de hoje saiu da ficha de cada portal no próprio WhitePress (Semrush, setembro de 2026) para 15 dos
25 portais. Fora os já citados, `futebolinterior.com.br` tem AS 51 e 482 mil visitas por mês,
`guiafloripa.com.br` tem AS 37 e `followthecolours.com.br` tem AS 29 e 2 mil visitas. Os outros 10
ficaram sem número: o `agenciainforma.app.br` saiu da base do WhitePress, e o WhitePress pediu
verificação de conta por e-mail duas vezes no meio das consultas (ver pendências).

**De onde vem a autoridade da ficha do Ponce Park.** O Search Console lista 27 sites linkando para
ela: 10 editoriais de viagem fora do WhitePress (o `carpemundi.com.br` com 10 posts), 13 de spam de
comentário e fórum, 3 de parceiro e agência e 1 inserção do WhitePress. Boa parte do "316 + 83" que o
Semrush atribui à ficha (seção 2.2) é spam, então a força real que a Conteúdo 64 pode escoar para
Guarulhos é menor do que o número sugere.

**Pendências.**

- **AS de 9 portais comprados:** `mamrio.org.br`, `aguabrancaemfoco.com.br`, `gazetadasemana.com.br`,
  `culturaenegocios.com.br`, `oparana.com.br`, `1news.correiobraziliense.com.br`,
  `agendaculturalporto.org`, `egobrazil.com.br` e `atendimentoaocliente.app.br`. O WhitePress trava a
  base de ofertas e pede verificação por e-mail depois de umas quatro fichas seguidas, mesmo com pausa
  de 10 segundos, e a visão geral de domínio do Semrush esbarrou no aviso de sessões demais na mesma
  conta. Dá para ler à mão, poucas fichas por dia. Nenhum dos 9 muda decisão: nenhum entra em
  disavow, e o status do link de cada um já está na planilha.
- **Rede 1 completa.** Só no plano pago do Semrush. A revisão de 30 dias (Conteúdo 73) reconfere pelo
  Search Console.
- **Os dois saltos do `aeromixparkestacionamento.com`.** Regra na zona do Cloudflare, fora do repo.

### 2.8 A auditoria de 26/10/2026 e as ideias do On Page SEO Checker (Conteúdo 65)

Três fontes. A **auditoria própria** (`bun run seo:auditoria`, seção 5.5) varreu as 1.150 URLs do
sitemap em 26/10, antes das correções:
[`antes.md`](./dados/auditoria-site-2026-10-26/antes.md). A **Auditoria do Site do Semrush** é a
de 02/10 (100 páginas, o teto do plano gratuito; não foi reexecutada). O **On Page SEO Checker**
foi reexecutado pelo próprio Semrush em 06/10: as 38 ideias de 29/09 viraram **32 para 7 páginas**
(10 de conteúdo, 7 técnicas, 6 de backlinks, 5 semânticas, 3 de estratégia e 1 de experiência).

**Auditoria própria: 70 erros, 77 avisos e 7 informativos, um a um.**

| Tipo | Qtd. | Decisão |
|---|---|---|
| `noindex` no sitemap (erro) | 70 | **Corrigido.** É o arquivo e a paginação do blog, que respondem `noindex, follow` por decisão do [blog.md](./blog.md) e estavam no sitemap desde 18/08. Saíram do sitemap (`SITEMAP_OPT_OUT`), continuam pré-renderizados, e o `canonicalize-sitemap.mjs` reprova o build se algum voltar |
| Página órfã | 28 | 21 são o arquivo de aeroporto do blog e saíram com o item acima. **Corrigidas:** `/en` e `/es` (o seletor de idioma do rodapé não aparecia na home, que existe nos três idiomas), as "mais barato" de Congonhas, Tietê e Confins (link na página de preço do destino, `temPaginaMaisBarato`) e `/estacionamento-de-aeroporto-e-seguro` (o card dela existia em `RELACIONADOS`, mas nenhuma página o usava; entrou em `/cancelamento` e `/metodologia`). **Justificada:** `/selo`, que vai direto ao parceiro; o link para ela vem com a adoção do selo (Conteúdo 70) |
| Title repetido | 16 grupos | **Corrigido.** FAQ de destino com pergunta longa perdia o sufixo e saía igual em até 22 aeroportos. `tituloDaPergunta` (`faqPagina.logic.ts`) nunca deixa o aeroporto cair: pelo nome, e no limite pelo código IATA, cortando a pergunta |
| Description repetida | 15 grupos | **Justificado e resolvido junto:** todas eram paginação do arquivo do blog repetindo a description da raiz, e saíram do sitemap com o primeiro item |
| Link interno com redirect | 12 | **Corrigido no render.** Links `/blog/<slug>` sem a barra final, cada um um 301. `hrefInterno` (`markdown.logic.ts`) põe a barra no corpo do post e da FAQ, então vale também para o que ainda vai ser escrito |
| Link de saída quebrado | 3 | **2 corrigidos** (migration `20261201000000`): a página de estatística da Sesp-PR mudou para `/CAPE/Estatisticas`, e a de ônibus do BH Airport virou "Como chegar". **Justificado:** o `seguranca.mg.gov.br` respondia 503 no site inteiro, inclusive na home; é queda, não endereço morto, e a auditoria da segunda seguinte reconfere |
| Sem description | 2 | **Falso positivo do script**, corrigido: a FAQ traduzida traz `"My bookings" > "Edit vehicle"`, e o parser cortava a tag no `>`. Ao abrir as duas, apareceu um defeito real: a description de toda FAQ em inglês e espanhol saía metade em português ("Estacionamento de Aeroporto: Yes. (...) Confira a tabela atualizada."). Agora é o aeroporto no idioma da página mais a resposta |
| Sem canonical | 1 | **Corrigido:** `/seja-parceiro` |
| Externo sem resposta ou que barra robô (informativo) | 7 | **Justificado:** não reprova. O Planalto derruba a conexão do robô, a Calculauto não respondeu no tempo, `viracopos.com` serve cadeia de certificado incompleta, gov.br e Voe Azul respondem 401 e 403 ao robô |

**Auditoria do Semrush (02/10/2026): 13 erros em 3 tipos.**

| Erro | Decisão |
|---|---|
| 10 dados estruturados inválidos | **9 corrigidos:** as fichas emitiam `isPartOf` em `LocalBusiness`, e a propriedade é de `CreativeWork`. O mesmo defeito estava no `Place` do destino e no `ParkingFacility` do lote mapeado. O elo com o site passou para um `WebPage` com `mainEntity` apontando para o lugar. **1 justificado:** a calculadora é `WebApplication` sem `aggregateRating`, e o Google só pede a nota para dar o resultado rico de app. Ela não tem avaliação, e nota inventada viola a regra de dado estruturado |
| 2 title repetidos | **Corrigido:** `/login` e `/operator` herdavam o "Movepark Hub" do `defaultTitle`. O `/login` ganhou title; o `/operator` é área logada, com `noindex` por caminho |
| `robots.txt` com erro de formato | **Justificado:** é a linha `Content-Signal` da política de Content Signals da Cloudflare, posta de propósito (E0.8). Linha que o Google não conhece ele ignora, e o resto do arquivo vale |

**On Page SEO Checker: as 32 ideias.** Duas leituras antes da tabela. Seis das sete URLs que o
Checker analisa são **endereços de antes da migração** e respondem 301 para a ficha nova; foi por
isso que ele marcou as 7 como "torne a página rastreável" (o rastreador de 100 páginas não chega
nelas). E três das ideias pedem para encaixar termo de aeroporto na ficha de um parceiro, que é o
contrário do mapa de canonicalização: o termo de cabeça é da página do destino, e o próprio Checker
confirma que ela é quem ranqueia melhor (Guarulhos na posição 6, Congonhas na 5, Curitiba na 6).

| Página analisada (URL de hoje) | Palavra-chave | Ideias | Decisão |
|---|---|---|---|
| Ficha do Virapark (`/estacionamentos/aeroporto-viracopos/virapark`) | aeroporto campinas, aeroporto de campinas | 4 de conteúdo (termo no title, H1, meta e corpo), 1 semântica, 1 de backlinks, 1 técnica | **Recusadas.** É busca pelo aeroporto, não por vaga: trocar "Estacionamento Aeroporto Viracopos" por "aeroporto de Campinas" no title e no H1 da ficha perderia o termo comercial e disputaria com a dona de "guia do aeroporto" do [mapa VCP](./canonicalizacao-vcp-cnf.md). As palavras semânticas ("companhias aéreas", "América Latina") são de página sobre o aeroporto. A meta já cita Campinas |
| Ficha do Grand Parking (`/estacionamentos/aeroporto-congonhas/grand-parking`) | estacionamento aeroporto congonhas | 1 de estratégia, 3 de conteúdo (legibilidade, H1, title), 1 de backlinks, 1 técnica | **Recusadas.** É lote mapeado sem contrato (ADR-010), e o termo de cabeça é da página de Congonhas, que está na posição 5. Congonhas é ainda o controle do plano (seção 7) e fica fora de compra de link |
| Guia comparativo de Guarulhos (blog) | estacionamento aeroporto guarulhos | 1 de estratégia, 1 de legibilidade, 1 semântica, 1 de backlinks, 1 técnica, 1 de tempo na página | **Recusadas, com um ajuste.** O post é o dono de "melhor" em GRU e o termo de cabeça é da página do destino (posição 6). A lista semântica é frase de template de concorrente, inclusive em português de Portugal ("é por isso que compilámos"), e os conceitos (traslado, reserva, tarifa) já estão no texto. O tempo na página vem do GA, desconectado desde 05/10 (seção 2.6), e post answer-first entrega a resposta no topo. A técnica é o limite de 100 páginas: a auditoria própria rastreia a página. **Ajuste:** o H1 dizia "Guia Atualizado: (...) em 2024" e passou a "As 5 melhores opções de estacionamento no Aeroporto Guarulhos em 2026" (migration `20261201010000`); era o único post publicado com ano vencido no título |
| Destino Curitiba (`/estacionamentos/aeroporto-curitiba`) | estacionamento aeroporto curitiba | 1 de estratégia, 1 semântica, 1 de backlinks, 1 técnica | **Sem ação.** A "outra página que ranqueia melhor" é a própria URL nova, destino do 301 (posição 6). "24 horas por dia" já aparece 8 vezes como "24 horas" |
| Ficha do Nationpark (`/estacionamentos/aeroporto-curitiba/nationpark`) | aeroporto afonso pena, aeroporto curitiba, aeroporto de curitiba | 1 semântica, 1 de backlinks, 1 técnica | **Recusadas** pelo mesmo motivo do Virapark: "centro de Curitiba", "Foz do Iguaçu" e "voos diários" são vocabulário de guia do aeroporto, não de ficha |
| Ficha do BePark (`/estacionamentos/aeroporto-confins/bepark`) | estacionamento aeroporto confins | 1 semântica, 1 de backlinks, 1 técnica | **Recusadas.** "Além disso" é conector, e "Aeroporto Internacional de Belo Horizonte" pediria mudar o template de todas as fichas por uma expressão; a página de Confins já traz o nome oficial (Tancredo Neves) |
| Ficha da Garageinn (`/estacionamentos/aeroporto-viracopos/garageinn`) | estacionamento viracopos | 2 de conteúdo (title e H1), 1 técnica | **Recusadas.** Title e H1 já dizem "Estacionamento Aeroporto Viracopos"; a forma curta exata é o termo de cabeça da página de Viracopos, e ficha de parceiro com ele canibaliza |

As **6 de backlinks** não viram compra por esta atividade. As listas misturam concorrente
(`parkindigo.com.br`, `bandeirapark.online`, `parkivado.com.br`), o próprio `movepark.co`, Wikipedia,
Yahoo e Skyscanner com uns poucos sites de nicho (`melhoresdestinos.com.br`,
`passageirodeprimeira.com`, `aeroin.net`, `dicasdeviagem.com`, `guiaviajarmelhor.com.br`,
`hoteliernews.com.br`, `bemparana.com.br`). Os de nicho são candidatos da Conteúdo 72, pelas regras
da seção 4; concorrente nunca. O `carpemundi.com.br`, também listado, já linka a ficha do Ponce Park
em 10 posts (seção 2.7).

**A rodada depois do deploy (26/10/2026, commit `bade0907`):** 1.080 URLs, **0 erros, 8 avisos
e 43 informativos** ([`depois.md`](./dados/auditoria-site-2026-10-26/depois.md)), contra 70, 77 e 7
na rodada da manhã. Os 8 avisos, um a um:

- **3 links de saída quebrados.** Os dois corrigidos de manhã continuavam nas versões em inglês e
  espanhol dos mesmos posts, que têm corpo próprio em `blog_post_i18n`; corrigidos na migration
  `20261201020000`, e o banco ficou sem nenhuma ocorrência. O terceiro é a Sejusp-MG, fora do ar.
- **4 posts órfãos** (`estacionamento-gratuito-no-aeroporto-de-viracopos` e três de Lisboa).
  Nenhum post linkava para eles: o único caminho era o arquivo do blog, que é `noindex`. Para o
  Google nada tinha mudado, porque o arquivo continua lá com `follow` e os quatro seguem no
  sitemap; a auditoria só passou a enxergar, porque deixou de contar link vindo do arquivo.
  **Corrigido no template, para todo post, sem link escrito à mão:** o "Leia também" da lateral
  era buscado no navegador (`useRelatedPosts`) e o crawler não o via. Agora ele sai no HTML
  pré-renderizado, escolhido no loader do post, e a regra deixou de ser "os 3 mais recentes do
  destino" (que em Viracopos mandava o link dos 22 posts para os mesmos 4) e passou a ser
  **vizinho de data dentro do destino**, que dá link a todo post de destino com dois ou mais.
  Medido no acervo do dia: os 4 passaram a receber 3, 4, 2 e 4 links, e os 10 posts sem link da
  lateral são os de destino com post único, que a página do destino já linka. Detalhe em
  [blog.md](./blog.md), seção "O Leia também sai no HTML do build".
  **Conferido no ar** (commit `7bc90533`, terceira rodada do dia): 1.080 URLs, **0 erros e 2
  avisos**, nenhum de post do blog. Os dois são `/selo` e a Sejusp-MG fora do ar, justificados
  nesta seção ([`depois-leia-tambem.md`](./dados/auditoria-site-2026-10-26/depois-leia-tambem.md)).
- **1 órfã:** `/selo`, justificada acima.

Os 43 informativos são 39 links de compartilhar no LinkedIn (`/sharing/share-offsite`, que
responde 403 a robô) dos botões de compartilhamento dos posts, mais Planalto e `viracopos.com`. Não
reprovam.

**O Checker com as URLs de hoje (26/10/2026, autorizado pelo Diego).** As seis páginas de antes da
migração foram trocadas pelas atuais em "Editar palavras-chave ou URL", com as mesmas
palavras-chave: `/estacionamentos/aeroporto-viracopos/virapark`, `.../aeroporto-congonhas/grand-parking`,
`.../aeroporto-curitiba`, `.../aeroporto-curitiba/nationpark`, `.../aeroporto-confins/bepark` e
`.../aeroporto-viracopos/garageinn`. O guia de Guarulhos já estava na URL certa. **A reexecução não
rodou:** o plano gratuito coleta ideias de 10 palavras-chave por mês, e o Semrush respondeu
"Limite mensal atingido, 0 de 10". As seis páginas ficam marcadas "Reexecutar" e saem com ideia nova
quando o limite renovar; até lá o painel mostra só as 6 ideias do guia. Duas coisas para a próxima
rodada: as palavras-chave do Virapark ("aeroporto campinas") e do Nationpark ("aeroporto curitiba")
seguem as antigas, de intenção de aeroporto, então o Checker vai repetir as ideias recusadas acima
até alguém trocar por termo da ficha; e o próprio "potencial de 1000%" do painel é a soma do volume
dessas palavras como se a página fosse a 1ª em todas, não uma estimativa de ganho.

## 3. A tese

1. **Parar de somar volume.** Link de rede estrangeira com AS 0 a 10 não move o Authority Score e
   acumula risco.
2. **Recuperar o que já é nosso** antes de comprar mais: domínio antigo e autoridade parada na
   ficha do Ponce Park e na home.
3. **Comprar pouco, brasileiro e no nicho**, sempre apontando para a página de destino que precisa
   subir, começando por Guarulhos.
4. **Conquistar link com o dado que só a Movepark tem**: preço vivo de parceiro e preço pesquisado
   de 26 destinos, com data.

## 4. Regras de compra no WhitePress

Valem para todo pedido a partir de outubro de 2026. Pedido fora da regra não entra.

| Critério | Regra |
|---|---|
| País e idioma | Brasil, pt-BR |
| Autoridade | AS do Semrush a partir de 30 (ou DR equivalente), conferido no dia do pedido |
| Tráfego | Orgânico real e estável nos últimos 6 meses, no próprio Semrush |
| Nicho | Viagem e turismo, milhas, automotivo, finanças pessoais, negócios e **portal regional** (Guarulhos, Campinas, BH, Curitiba, Florianópolis, Porto Alegre) |
| Site que fica de fora | Publica "artigo patrocinado" de qualquer assunto, tem dezenas de links de saída por post, ou cai na lista de exclusão da seção 4.2 (Conteúdo 63) |
| Verba | Cerca de R$ 4.000 por mês, dividida entre os projetos Movepark e Virapark no WhitePress (perto de metade cada), e **todo artigo leva link para o `movepark.co`**, inclusive os da Virapark (seção 4.3) |
| Destino do link | Maioria para `/estacionamentos/<aeroporto>` (Guarulhos primeiro), uma parte para post-pilar dono do termo ([canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md), [canonicalizacao-vcp-cnf.md](./canonicalizacao-vcp-cnf.md)), pouco para a home. No artigo da Virapark, o link da Movepark vai para a página do aeroporto (seção 4.3) |
| Âncora | Maioria marca ou URL ("Movepark", "movepark.co"), uma parte parcial ("estacionamento perto do aeroporto de Guarulhos"), **exata quase nunca** |
| Ritmo | Constante, todo mês, nunca em rajada. A quantidade sai do orçamento: no custo histórico de cerca de R$ 510 por link, R$ 3.000 por mês compram de 4 a 6 links de AS 30 ou mais (site melhor custa mais, e está certo) |
| Conteúdo do artigo | Útil por si só, sem promessa de transação que a unidade não entrega (ADR-009) e sem travessão |
| Registro | Todo link comprado entra na planilha de controle (Conteúdo 66), [`dados/backlinks-controle.csv`](./dados/backlinks-controle.csv): pedido, projeto, site, AS no dia, preço, URL publicada, destino, âncora, dofollow, se ainda está no ar e a data da conferência. Criada em 14/10/2026 com as 37 compras auditadas na seção 2.7 e os cinco pedidos de outubro |

**Risco a conhecer:** para o Google, link pago tem que levar `rel="sponsored"`. Site com público
real e âncora natural reduzem o risco, mas não zeram. Por isso o peso do plano está em link
conquistado (seção 5.4), e a compra é complemento.

**Gate:** o orçamento mensal do WhitePress não está nesta spec. A Conteúdo 66 só fecha com ele
definido pelo Diego. Referência: o gasto histórico foi de cerca de R$ 18.900 no projeto Movepark,
concentrado num único mês. **Resolvido em 13/10/2026 (seção 4.3):** cerca de R$ 4.000 por mês, em
média, dividido entre Movepark e Virapark.

### 4.1 A lista do WhitePress de 06/10/2026

O WhitePress mandou 195 sites com preço, TF/CF (Majestic), DA (Moz), DR e tráfego (Ahrefs), e
tráfego e AS (Semrush). A métrica que vale é o **AS do Semrush**, a mesma das metas da seção 6.
O DA do Moz é a coluna menos confiável da planilha: há site com DA 62 e AS 21 com 411 visitas
por mês (`mfpdigital.com.br`), ou DA 53 com AS 9 e Trust Flow 0 (`turistandonorio.com.br`).

**Mais domínios ou poucos com autoridade alta?** Os dois extremos perdem. Volume sem qualidade a
Movepark já testou: 851 domínios e AS parado em 25 há 12 meses. Na outra ponta o retorno cai
rápido: o `g1.globo.com` custa R$ 7.245, 15 vezes o `gazetaweb.com` (AS 45 e 300 mil visitas
por mês), e matéria patrocinada em portal grande costuma sair marcada como publicidade. O ponto
certo é **muitos domínios diferentes, cada um com AS de 30 a 60, tráfego real e relevância de
praça ou de viagem**, na faixa de R$ 300 a R$ 3.300. Um domínio novo pesa mais que um segundo link
do mesmo site, então **nunca comprar duas vezes no mesmo domínio**.

**O filtro aplicado:** AS ≥ 30, tráfego Semrush ≥ 5 mil e Ahrefs ≥ 1 mil sobram 113 dos 195.
Depois sai o que não tem relação com praça da Movepark nem com viagem (portal de cidade sem
aeroporto atendido, receita, maternidade, adolescente) e o que cai nos alertas abaixo.

| Alerta | Sites | Motivo |
|---|---|---|
| Subdomínio com a métrica do domínio-raiz | `*.ig.com.br`, `cartaodevisita.r7.com`, `tnonline.uol.com.br`, `brusque.portaldacidade.com` | O AS 72 a 98 é do `ig`, do `r7` ou do `uol`, não da seção que publica; o `cartaodevisita.r7.com` é vitrine de anúncio |
| DA inflado sem tráfego | `mfpdigital.com.br`, `turistandonorio.com.br`, `viajenodetalhe.com.br`, `followthecolours.com.br` | DA de 53 a 68 com AS abaixo de 30 |
| Trust Flow desproporcional | `curtamais.com.br` (TF 6, CF 38), `atoananet.com.br/blog` (TF 0, CF 0) | Perfil de link artificial |
| Fora do Brasil | `leca-palmeira.com`, `agendaculturalporto.org`, `portugalnummapa.com`, `atlaslisboa.com`, `surftotal.com`, `fulltravel.it` | Seção 4: Brasil e pt-BR |
| Caro para o que entrega | `queroviajarmais.com` (R$ 17.860, AS 39), rede `dicas*.com.br` (R$ 3.470 a R$ 3.955, AS 30 a 34), `guiadasemana.com.br`, `cnnbrasil.com.br` | Sites equivalentes saem por um décimo |

**A shortlist.** Decisão do Diego em 06/10/2026: **a compra se concentra nas quatro praças da
Movepark, Guarulhos, Viracopos, Curitiba e Confins**. Nenhum link vai para outro aeroporto, mesmo
barato. A lista não tem portal de Guarulhos nem de Curitiba: Guarulhos recebe link de site
nacional de viagem e do portal do Alto Tietê, Curitiba recebe dos dois maiores portais do interior
do Paraná, e o WhitePress precisa ser consultado sobre portais das duas cidades (Conteúdo 85).

| Mês | Site | Preço | AS | Tráfego Semrush | Destino do link |
|---|---|---|---|---|---|
| Outubro (C67) | `viagensecaminhos.com` | R$ 1.610,00 | 54 | 795 mil | `/estacionamentos/aeroporto-guarulhos` |
| Outubro (C67, Virapark) | `rotadeferias.com.br` (era de Guarulhos até 13/10) | R$ 885,50 | 34 | 26 mil | `virapark.com.br` e `/estacionamentos/aeroporto-viracopos` |
| Outubro (C67) | `mochileiros.com` | R$ 483,00 | 33 | 31 mil | `/estacionamentos/aeroporto-guarulhos` (âncora exata) e o post dono do termo de GRU (`canonicalizacao-gru-cwb.md`) |
| Outubro (C67, Virapark) | `campinas.com.br` (veio de dezembro em 13/10) | R$ 1.046,50 | 32 | 27 mil | `virapark.com.br` e `/estacionamentos/aeroporto-viracopos` |
| Novembro (C68) | `em.com.br` (Estado de Minas) | R$ 3.220,00 | 61 | 521 mil | `/estacionamentos/aeroporto-confins` |
| Novembro (C68) | `odiariodemogi.net.br` (Alto Tietê) | R$ 1.606,55 | 33 | 10 mil (Ahrefs 23 mil) | `/estacionamentos/aeroporto-guarulhos` |
| Dezembro (C69) | `sampi.net.br` (era reserva; a confirmar na C69) | R$ 3.059,00 | 52 | | `/estacionamentos/aeroporto-viracopos` |
| Dezembro (C69) | `carpemundi.com.br` (viagem) | R$ 1.432,90 | 39 | 83 mil | `/estacionamentos/aeroporto-viracopos` |
| Dezembro (C69) | `maringapost.com.br` (Maringá) | R$ 1.932,00 | 37 | 48 mil | `/estacionamentos/aeroporto-afonso-pena` |
| Janeiro | `cgn.inf.br` (Cascavel) | R$ 2.237,90 | 48 | 379 mil | `/estacionamentos/aeroporto-afonso-pena` |
| Janeiro | `bhaz.com.br` (BH) | R$ 2.737,00 | 45 | 89 mil | `/estacionamentos/aeroporto-confins` |

**Por praça:**

| Praça | Links | Investimento |
|---|---|---|
| Guarulhos | 3 | R$ 3.699,55 |
| Confins | 2 | R$ 5.957,00 |
| Curitiba | 2 | R$ 4.169,90 |
| Viracopos | 4 | R$ 6.423,90 |
| **Total** | **11** | **R$ 20.250,35** |

Guarulhos leva 3 links e Viracopos 4 desde 13/10/2026, quando a verba passou a ser dividida com a
Virapark e a metade dela foi para Viracopos (seção 4.3). Confins custa mais porque os dois
portais de BH da lista são caros; se a pauta da Conteúdo 56 sair no Estado de Minas sem custo, a
compra do `em.com.br` cai e Confins fica em R$ 2.737. Por mês: outubro R$ 4.025,00, novembro
R$ 4.826,55, dezembro R$ 6.423,90 (com o `sampi.net.br` ainda a confirmar) e janeiro R$ 4.974,90,
média de R$ 1.841 por link e AS médio de 43. **Com o orçamento de R$ 4.000 por mês (seção 4.3),
novembro, dezembro e janeiro passam do teto** e precisam ser enxugados quando cada lote abrir. Os
totais de 06/10, antes da divisão, eram 10 links e R$ 17.191,35.

**Reservas por praça** (troca um item mantendo a praça): Guarulhos, `turistaprofissional.com`
(viagem, R$ 2.415, AS 46) e `diariodoturismo.com.br` (trade de turismo, R$ 1.760, AS 36, já
linka para a ficha do Ponce Park, seção 4.2); Viracopos, `maladeaventuras.com` (viagem, R$ 1.932,
AS 38), que entrou e saiu do lote de outubro em 13/10; Confins, `patoshoje.com.br` (interior de
MG, R$ 1.607, AS 41, conferir a cidade antes); Curitiba, `turistaprofissional.com` se não for usado
em Guarulhos.

**Fora do foco, para registro:** `gazetaweb.com` (Maceió, R$ 483, AS 45), `guiafloripa.com.br`
(R$ 467, AS 37) e `sul21.com.br` (Porto Alegre, R$ 322, AS 36) são o melhor custo por AS da lista,
mas apontariam para aeroporto fora das quatro praças.

**Atividades (todas com o Diego):** uma por compra.
[Conteúdo 75](https://app.clickup.com/t/17tn9e9hy61) a [77](https://app.clickup.com/t/17tn9e9hy73) e
[86](https://app.clickup.com/t/17tn9e9mk9g) em outubro, [81](https://app.clickup.com/t/17tn9e9hy92) e [82](https://app.clickup.com/t/17tn9e9hy93) em
novembro, [83](https://app.clickup.com/t/17tn9e9hy96), [84](https://app.clickup.com/t/17tn9e9hy99) e
[78](https://app.clickup.com/t/17tn9e9hy7t) em dezembro, [79](https://app.clickup.com/t/17tn9e9hy8p) e
[80](https://app.clickup.com/t/17tn9e9hy90) em janeiro, e a [85](https://app.clickup.com/t/17tn9e9hy9a)
para pedir ao WhitePress portais de Guarulhos e Curitiba. As 78 a 80 nasceram para Maceió,
Florianópolis e Porto Alegre e foram reaproveitadas quando o foco ficou nas quatro praças. A 83
era o `campinas.com.br` em dezembro; em 13/10/2026 ele foi para outubro (86) e a 83 passou a ser
o `sampi.net.br`. No mesmo dia a 76 (`rotadeferias.com.br`) passou de Guarulhos para a metade
Virapark, e a [87](https://app.clickup.com/t/17tn9e9mk9j) (`maladeaventuras.com`) virou reserva.

**Antes de cada pedido** (a planilha não traz): AS conferido no Semrush no dia; o link sai
dofollow ou com `rel="sponsored"`; o artigo fica no ar por quanto tempo; quantos links de saída
o post tem; o site publica patrocinado de qualquer assunto (busca por "patrocinado" no próprio
site); o domínio não cai na lista de exclusão da seção 4.2.

### 4.2 A lista de exclusão (Conteúdo 63, 13/10/2026)

Antes de cada pedido, o domínio passa por três filtros. A evidência de cada um está em
[dados/backlinks-auditoria-2026-10-13](./dados/backlinks-auditoria-2026-10-13/).

1. **Spam: nunca.** Os 73 domínios do [`disavow.txt`](./dados/backlinks-auditoria-2026-10-13/disavow.txt),
   os 19 de estatística da rede 3 (classe `estatistica_nofollow` em `semrush-dominios-revisados.csv`)
   e os sites de spam de comentário marcados em `gsc-dominios.csv`.
2. **Já comprado e fraco: nunca de novo.** `guiadoviajante.com.br` (AS 8, cerca de 10 visitas por mês),
   `webcitizen.com.br` (AS 20, mesmo tráfego), `cartaodevisita.r7.com` (vitrine de anúncio),
   `followthecolours.com.br` (DA inflado, seção 4.1), `agendaculturalporto.org` (fora do Brasil),
   `dropsdejogos.uai.com.br` (indisponível no Brasil), `1news.correiobraziliense.com.br` (o próprio
   WhitePress marca a publicação como não indexada) e os portais `*.app.br` de nome genérico
   (`agenciainforma`, `atendimentoaocliente`, e os que o projeto Virapark usou: `techblog`,
   `revistadicas`, `snaptik`, `metaverso`). Dos dois que o projeto Movepark comprou, um post sumiu e o
   outro portal saiu da base do WhitePress. **`obutecodanet.ig.com.br`** entrou na lista em 14/10/2026,
   por decisão do Diego: no artigo de outubro o portal publicou os H2 como negrito, tirou a imagem do
   corpo, trocou o nome e o `alt` da foto principal e não pôs meta description (seção 4.3). Além
   disso, ele já tinha seis posts pagos pela Movepark e pela Virapark desde dez/2023, e este foi o sétimo.
3. **Já linka para o `movepark.co`: a compra nova pesa menos.** Pela regra da seção 4.1, domínio novo
   vale mais que um segundo link do mesmo site. Já linkam: `ig.com.br` (qualquer subdomínio),
   `uol.com.br`, `r7.com`, `uai.com.br`, `sul21.com.br`, `gazetaweb.com`, `guiafloripa.com.br`,
   `mamrio.org.br`, `futebolinterior.com.br`, `aguabrancaemfoco.com.br`, `gazetadasemana.com.br`,
   `culturaenegocios.com.br`, `oparana.com.br` e, fora do WhitePress, `carpemundi.com.br`,
   `guarulhostododia.com.br`, `administradores.com.br`, `pousadasincriveis.com`,
   `quantocustaviajar.com`, `blogvambora.com.br`, `viajoteca.com`, `vivaomundo.com.br`,
   `somosnoticia.com.br`, `guiaviajarmelhor.com.br`, `diariodoturismo.com.br` e `egobrazil.com.br`.

**Cruzamento com a lista da seção 4.1.** Só dois nomes batem:

- **`carpemundi.com.br` (Conteúdo 78): mantido.** Ele já linka a ficha do Ponce Park em 10 posts, fora
  do WhitePress. Decisão do Diego em 13/10/2026: a compra segue, porque o link novo vai para
  `/estacionamentos/aeroporto-viracopos`, página que o carpemundi ainda não linka. É exceção ao filtro
  3, registrada aqui para não virar precedente silencioso.
- **`diariodoturismo.com.br` (reserva de Guarulhos):** já linka a ficha do Ponce Park. Se a reserva
  for usada, a decisão cabe na Conteúdo 66; o `turistaprofissional.com` não tem esse conflito.

### 4.3 Orçamento e verba dividida com a Virapark (13/10/2026)

Decisão do Diego em 13/10/2026, que vale para todo lote daqui em diante:

1. **Orçamento de cerca de R$ 4.000 por mês, em média,** somando os dois projetos.
2. **Metade da verba de compra é do projeto Virapark e metade do projeto Movepark.** A divisão é
   aproximada, porque os preços dos sites não fecham valores iguais. Cada pedido sai pelo projeto
   dele no WhitePress, para o gasto de cada metade ficar separado.
3. **Todo artigo leva link para o `movepark.co`**, inclusive os pagos pela Virapark. O artigo da
   Virapark tem dois links: `virapark.com.br`, com âncora "Virapark", e a página do aeroporto no
   `movepark.co`, com âncora de marca. Só entra oferta que aceite dois links dofollow no artigo.
4. **A metade Virapark vai para Viracopos**, a praça da Virapark. O link da Movepark nesses artigos
   aponta para `/estacionamentos/aeroporto-viracopos`, e não para a ficha da Virapark: o
   `virapark.com.br` já cobre o parceiro, e a página do aeroporto é a que vende.

Isso atualiza a leitura 3 da seção 2.4: a compra da Virapark tem motivo comercial declarado e
sempre soma para o `movepark.co`.

**Outubro ([Conteúdo 67](https://app.clickup.com/t/17tn9e9gfh9)), R$ 4.025,00:**

| Metade | Site | Preço | AS | Links | Atividade |
|---|---|---|---|---|---|
| Movepark | `viagensecaminhos.com` | R$ 1.610,00 | 54 | `/estacionamentos/aeroporto-guarulhos` | [C75](https://app.clickup.com/t/17tn9e9hy61) |
| Movepark | `mochileiros.com` | R$ 483,00 | 33 | `/estacionamentos/aeroporto-guarulhos` e `/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/` | [C77](https://app.clickup.com/t/17tn9e9hy73) |
| Virapark | `campinas.com.br` | R$ 1.046,50 | 32 | `virapark.com.br` e `/estacionamentos/aeroporto-viracopos` | [C86](https://app.clickup.com/t/17tn9e9mk9g) |
| Virapark | `rotadeferias.com.br` | R$ 885,50 | 34 | `virapark.com.br` e `/estacionamentos/aeroporto-viracopos` | [C76](https://app.clickup.com/t/17tn9e9hy6w) |

R$ 2.093,00 da Movepark e R$ 1.932,00 da Virapark. Cabe no orçamento de R$ 4.000 e no saldo do
WhitePress em 13/10/2026 (R$ 4.457,17), sem depósito. Em relação ao combinado em 06/10 (três links
de Guarulhos, R$ 2.978,50), o `rotadeferias.com.br` passou para a Virapark e o `campinas.com.br`
veio de dezembro. O `maladeaventuras.com` chegou a entrar e voltou a ser reserva
([Conteúdo 87](https://app.clickup.com/t/17tn9e9mk9j)).

**Pedido em 14/10/2026.** Os quatro saíram com artigo próprio, escrito pela Movepark e revisado
antes da compra. Texto, meta title, meta description, slug sugerido, âncoras e imagens estão em
[`docs/imprensa/whitepress-2026-10/`](../imprensa/whitepress-2026-10/). A Movepark compra pelo
projeto **204794** do WhitePress (`https://movepark.co`); o 132436 é o projeto antigo, das 37
compras auditadas na seção 2.7, e não aparece mais no formulário de artigo.

| Site | Pedido | Rascunho | Frase-chave | Âncora para o `movepark.co` |
|---|---|---|---|---|
| `viagensecaminhos.com` | 1887783 | 1736178 | estacionamento aeroporto Guarulhos | "Movepark" (o portal só aceita marca, genérica, imagem ou URL) |
| `mochileiros.com` | 1887784 | 1736182 | estacionamento aeroporto Guarulhos | exata, "estacionamento aeroporto Guarulhos", mais uma parcial para o post |
| `campinas.com.br` | 1887785 | 1736191 | estacionamento aeroporto Viracopos | parcial, "estacionamentos perto do aeroporto de Viracopos" |
| `rotadeferias.com.br` | 1887786 | 1736193 | estacionamento aeroporto Viracopos | "Movepark" (o portal só aceita marca, genérica, imagem ou URL) |

A âncora exata ficou só no `mochileiros.com`, por decisão do Diego em 13/10/2026: uma exata no lote
mantém o perfil de âncoras natural. O `campinas.com.br` é a exceção à âncora de marca do item 3,
porque aceita qualquer âncora. Os quatro pedidos ficaram "Em andamento", com prazo do publicador em
19/10/2026.

**Quinto artigo, sem custo novo.** O pedido 1720083 da Virapark (`obutecodanet.ig.com.br`, R$ 424,35)
estava pago e "À espera do conteúdo" desde 22/09/2026, sem artigo. O painel não oferece cancelamento,
então o Diego decidiu aproveitá-lo: em 14/10/2026 ele recebeu artigo próprio sobre estacionar dentro ou
fora do aeroporto de Viracopos, com a tarifa oficial conferida no site do aeroporto no mesmo dia
(edifício garagem R$ 83,00 a diária, bolsão F R$ 31,00). Links: "www.virapark.com.br", a âncora que
o pedido exige, e uma parcial para `/estacionamentos/aeroporto-viracopos`. Prazo do publicador:
19/10/2026.

**Primeira publicação conferida (14/10/2026).** O `rotadeferias.com.br` publicou no mesmo dia, em
[`/estacionamento-aeroporto-viracopos-checklist-para-ir-de-carro-e-embarcar-sem-correria/`](https://rotadeferias.com.br/estacionamento-aeroporto-viracopos-checklist-para-ir-de-carro-e-embarcar-sem-correria/):
`index, follow`, H1 e intertítulos como enviados, tabela no lugar e os dois links sem `rel`, ou seja,
dofollow. Ficaram de fora a meta description e o `alt` da imagem do corpo, que o portal publicou
vazio; o nome do arquivo, com a frase-chave, se manteve. Pedimos as duas correções por comentário e o portal corrigiu no mesmo dia.

**Quatro de cinco no ar e aprovados (14/10/2026).** O Diego aprovou no WhitePress as publicações do
`rotadeferias.com.br`, do [`mochileiros.com`](https://www.mochileiros.com/blog/estacionamento-aeroporto-guarulhos-mochilao),
do [`campinas.com.br`](https://campinas.com.br/turismo/2026/10/estacionamento-do-aeroporto-de-viracopos-nas-ferias-quanto-custa-e-como-se-planejar/)
e do [`obutecodanet.ig.com.br`](https://obutecodanet.ig.com.br/estacionamento-aeroporto-viracopos-vale-mais-parar-dentro-do-aeroporto-ou-fora-com-van/).
Nos quatro, a página é indexável e os links para o `movepark.co` (e para a Virapark, quando é o caso)
estão no corpo, sem `rel` de nofollow ou sponsored. O `mochileiros.com` saiu como enviado, com a meta
description e os `alt`. O `campinas.com.br` trocou o H1 para "Estacionamento do aeroporto de Viracopos
nas férias", publicou as imagens sem `alt` e usou o primeiro parágrafo como meta description. O
`obutecodanet.ig.com.br` foi o que mais mexeu: publicou os H2 como parágrafo em negrito, tirou a imagem
do corpo, renomeou a foto principal para `image-300.jpg` sem `alt` e não pôs meta description. O link,
que é o que a compra paga, ficou certo nos quatro. Decisão do Diego: não pedir correção ao
`obutecodanet.ig.com.br` e não comprar mais nele (entrou na lista de exclusão, seção 4.2). O `viagensecaminhos.com` seguia "Em andamento", com
prazo em 19/10/2026. O registro de cada um está na planilha de controle.

**De novembro a janeiro,** cada lote abre com o teto de R$ 4.000 e a divisão entre os projetos
(Conteúdo 68, 69 e o de janeiro). Como está na seção 4.1, os três meses passam do teto (R$ 4.826,55,
R$ 6.423,90 e R$ 4.974,90) e precisam ser enxugados. A referência: Guarulhos, Confins e Curitiba
com a metade Movepark, Viracopos com a metade Virapark. A metade Virapark dos próximos meses tem o
`carpemundi.com.br`, o `sampi.net.br` (a confirmar) e o `maladeaventuras.com` (reserva) como
opções; vale pedir ao WhitePress mais sites de Campinas e de viagem junto da Conteúdo 85.

## 5. O plano

### 5.1 Semanas 1 e 2: limpar e medir

- **[Conteúdo 60](https://app.clickup.com/t/17tn9e9gfgr):** domínio antigo com 301 caminho a caminho para `movepark.co`.
- **[Conteúdo 61](https://app.clickup.com/t/17tn9e9gfgv):** projeto do Semrush configurado (Backlink Audit, GA e GSC conectados, auditoria
  com limite acima de 1.000 páginas, widget orgânico no Brasil).
- **[Conteúdo 62](https://app.clickup.com/t/17tn9e9gfgy):** monitoramento de posição com cerca de 60 termos no Brasil: as 12 consultas do
  placar, os clusters de cabeça por aeroporto e as cabeças de CNF do Ataque CNF. Marca de parceiro
  (virapark, ponce park, urbanpark) fica num grupo separado, fora da meta.
  **Feito em 07/10/2026, no Search Console e não no Semrush:** o Position Tracking gratuito não
  passa de 10 termos. São 59 termos na meta, medidos por `bun run seo:posicao`; as 10 vagas do
  Semrush ficam com as consultas que o GSC não enxerga. Ver
  [monitoramento-posicao.md](./monitoramento-posicao.md).
- **[Conteúdo 63](https://app.clickup.com/t/17tn9e9gfgz):** origem do pico de agosto e setembro e auditoria de toxicidade. Disavow **só**
  de rede claramente spam (âncora de venda de link, domínio sem conteúdo, sub-rede repetida), nunca
  em massa. **Feito em 13/10/2026** (seção 2.7): pico explicado, disavow de 73 domínios enviado, as 37
  compras conferidas e a lista de exclusão na seção 4.2.

### 5.2 Semanas 2 a 4: aproveitar o que já temos

- **[Conteúdo 64](https://app.clickup.com/t/17tn9e9gfh2):** link interno contextual da ficha do Ponce Park, da home e da página de Viracopos
  para `/estacionamentos/aeroporto-guarulhos`, com âncora de cabeça.
  **Feito em 15/10/2026, só a ficha do Ponce Park.** A home e a página de Viracopos ficaram de
  fora por decisão do Diego e seguem sem link para Guarulhos. Antes, a ficha linkava o destino
  só pela trilha e pelo rodapé ("Ver estacionamentos com reserva no Guarulhos (GRU)"), sem o
  termo de cabeça na âncora. Agora o topo do corpo traz "Para reservar online, veja as outras
  opções de estacionamento no aeroporto de Guarulhos", e o link é o trecho "estacionamento no
  aeroporto de Guarulhos". A frase fala das outras opções e não promete nada do lote (ADR-009 e ADR-010). O template da
  ficha serve cerca de 150 lotes mapeados, e o link sai só para o par destino e lote listado
  em `ancoraParaODestino` (`src/features/destinations/loteMapeado.logic.ts`): os outros lotes
  não têm link externo chegando na ficha e não mudaram. Lote novo entra na lista quando o
  Search Console mostrar link externo apontando para ele.
- **[Conteúdo 65](https://app.clickup.com/t/17tn9e9gfh4):** os erros da auditoria do Semrush e as 38 ideias do On Page SEO Checker nas 7
  páginas que ele analisou. **Feito em 26/10/2026** (seção 2.8): os 70 erros da auditoria
  própria e os 13 do Semrush corrigidos ou justificados um a um, e as 32 ideias que restaram na
  reexecução de 06/10 decididas, uma aplicada e as outras recusadas com motivo.

### 5.3 Meses 2 a 5: compra qualificada

- **[Conteúdo 66](https://app.clickup.com/t/17tn9e9gfh8):** regras da seção 4 aplicadas no WhitePress, orçamento e planilha de controle.
- **[Conteúdo 67](https://app.clickup.com/t/17tn9e9gfh9):** lote de outubro, Guarulhos (metade Movepark) e Viracopos (metade Virapark), seção 4.3. Pedido em 14/10/2026 (R$ 4.025,00).
- **[Conteúdo 68](https://app.clickup.com/t/17tn9e9gfha):** lote de novembro, Guarulhos e Confins (junto do Ataque CNF).
- **[Conteúdo 69](https://app.clickup.com/t/17tn9e9gfhb):** lote de dezembro, Curitiba e Viracopos.
- **Janeiro (Conteúdo 79 e 80):** Curitiba e Confins, fechando dois links por praça (seção 4.1).

### 5.4 Meses 2 a 6: link conquistado

- **[Conteúdo 70](https://app.clickup.com/t/17tn9e9gfhe):** adoção do selo de parceiro nos sites dos estacionamentos.
- **[Conteúdo 71](https://app.clickup.com/t/17tn9e9gfhf):** índice de preço de estacionamento em aeroporto como pauta nacional de férias de
  fim de ano. As pautas de BH continuam nas Conteúdo 55 e 56.
- **[Conteúdo 72](https://app.clickup.com/t/17tn9e9gfhh):** blogs de viagem e milhas, com a calculadora e o índice como motivo do link, e
  recuperação de menção sem link.

### 5.5 Medição

- **[Conteúdo 73](https://app.clickup.com/t/17tn9e9gfhj):** revisão de 30 dias, com print novo do Semrush.
- **[Conteúdo 74](https://app.clickup.com/t/17tn9e9gfhm):** revisão de 90 dias.
- **Sem o plano pago do Semrush (seção 2.6):** a auditoria completa do site é a
  [`scripts/auditoria-site.mjs`](../../scripts/auditoria-site.mjs) (`bun run seo:auditoria`), que
  varre todas as URLs do sitemap de produção e roda **toda segunda** no workflow
  `auditoria-site.yml` (com erro, abre issue atribuída e o run fica vermelho). Ela se soma às
  checagens que o build já faz (`check-internal-links`, `audit-structured-data`,
  `check-meta-producao`, Lighthouse). **Primeira rodada, 06/10/2026:** 1.187 URLs em 4 minutos,
  70 erros e 200 avisos. Os achados que valem decisão:
  - 40 prévias `.html` do gerador de imagem, commitadas em `public/images/blog/` em 05/10, viraram
    páginas públicas no sitemap (título "Gemini Image: …"). Removidas no mesmo dia, e
    `public/images/**/*.html` foi para o `.gitignore`.
  - Os 70 erros: arquivo e paginação do blog (`/blog/page/*`, `/tag/*`, `/categoria/*`,
    `/autor/*`, `/aeroporto/*`) estão no sitemap desde 18/08 e respondem `noindex, follow`, como
    manda `blog.md`. Sitemap com URL `noindex` é sinal contraditório para o Google; uma das duas
    decisões tem que ceder.
  - 16 grupos de title repetido nas páginas de FAQ por aeroporto: a mesma pergunta sai com o mesmo
    title em até 22 aeroportos (em pt, en e es).
  - 12 links internos de post sem a barra final do blog, que custam um 301 a cada clique.
  - 2 links de saída mortos (404): `seguranca.pr.gov.br/Pagina/Estatisticas-2` e a página de
    ônibus do `bh-airport.com.br`. A linha de base de domínios novos por
  mês sai do Ahrefs Webmaster Tools (gratuito para site verificado, com DR e data de descoberta por
  domínio). Nesse caso a meta da seção 6 passa a ser medida em DR, não em AS.

## 6. Metas

| Métrica | 29/09/2026 | 90 dias | 180 dias |
|---|---|---|---|
| Authority Score | 25 | 30 | 35 |
| Domínios de ref. de `/estacionamentos/aeroporto-guarulhos` | 17 | 40 | 60 |
| Domínios novos com AS ≥ 20 por mês | sem linha de base no plano gratuito (50 domínios com AS > 20 no total em 05/10; seção 2.6) | 10 | 15 |
| Domínios de ref. do Brasil | 15 | 40 | 70 |
| Posição média dos termos de cabeça de GRU no GSC | 40 a 55 | até 20 | até 5 |
| Termos monitorados no top 10 (GSC, `bun run seo:posicao`) | 9 de 59 em 04/10 (eram 5 de 9 no Semrush, com marca de parceiro) | 20 de 59 | 35 de 59 |
| Saúde do site no Semrush (auditoria completa) | 76% sobre 100 páginas (82% em 02/10; o plano gratuito não passa de 100) | 85% | 90% |

A meta de posição soma o efeito deste plano com o do plano de conteúdo. As duas specs medem o mesmo
GSC, então a revisão é feita junto.

## 7. Riscos

- **Penalidade por link pago.** Mitigada pela seção 4 e pelo peso no link conquistado.
- **Disavow errado derruba link bom.** Por isso só rede claramente spam, e com a lista revisada
  antes de subir.
- **Redirect do domínio antigo quebrar white-label.** A Conteúdo 60 testa os subdomínios antes e
  depois.
- **Atribuição.** Conteúdo e link sobem juntos e o efeito se mistura. Até 06/10/2026 a
  comparação era Viracopos, mas ela passou a receber link comprado (seção 4.1). O controle agora é
  a página de **Congonhas**, que fica fora da compra: as quatro praças recebem link novo e
  Congonhas mostra o que conteúdo e sazonalidade fazem sozinhos.
