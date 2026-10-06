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

Saldo na conta em 01/10/2026: R$ 2.457,17.

Três leituras:

1. **O custo médio é de cerca de R$ 510 por link** no projeto Movepark (R$ 18.919,58 por 37
   itens). Com os 37 dentro de um perfil de 762 domínios e o Authority Score parado em 25, a compra
   antiga não escolheu por autoridade. A Conteúdo 63 confere o AS de cada um dos 37 sites.
2. **A compra foi em rajada, não constante:** um lote em novembro de 2025 e quase nada depois.
   O plano troca isso por ritmo mensal.
3. **O projeto Virapark leva quase metade do investimento** e fortalece `virapark.com.br`, não o
   `movepark.co` (o Semrush mostra 21% de sobreposição entre os dois perfis). Daqui pra frente,
   compra para parceiro só com motivo comercial explícito; o padrão é apontar para a ficha do
   parceiro dentro do `movepark.co`, que soma para a página do aeroporto.

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
| Site que fica de fora | Publica "artigo patrocinado" de qualquer assunto, tem dezenas de links de saída por post, ou já aparece na lista de domínios tóxicos da Conteúdo 63 |
| Destino do link | Maioria para `/estacionamentos/<aeroporto>` (Guarulhos primeiro), uma parte para post-pilar dono do termo ([canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md), [canonicalizacao-vcp-cnf.md](./canonicalizacao-vcp-cnf.md)), pouco para a home |
| Âncora | Maioria marca ou URL ("Movepark", "movepark.co"), uma parte parcial ("estacionamento perto do aeroporto de Guarulhos"), **exata quase nunca** |
| Ritmo | Constante, todo mês, nunca em rajada. A quantidade sai do orçamento: no custo histórico de cerca de R$ 510 por link, R$ 3.000 por mês compram de 4 a 6 links de AS 30 ou mais (site melhor custa mais, e está certo) |
| Conteúdo do artigo | Útil por si só, sem promessa de transação que a unidade não entrega (ADR-009) e sem travessão |
| Registro | Todo link comprado entra na planilha de controle (Conteúdo 66): site, AS no dia, URL de destino, âncora, preço, data e se ainda está no ar |

**Risco a conhecer:** para o Google, link pago tem que levar `rel="sponsored"`. Site com público
real e âncora natural reduzem o risco, mas não zeram. Por isso o peso do plano está em link
conquistado (seção 5.4), e a compra é complemento.

**Gate:** o orçamento mensal do WhitePress não está nesta spec. A Conteúdo 66 só fecha com ele
definido pelo Diego. Referência: o gasto histórico foi de cerca de R$ 18.900 no projeto Movepark,
concentrado num único mês.

## 5. O plano

### 5.1 Semanas 1 e 2: limpar e medir

- **[Conteúdo 60](https://app.clickup.com/t/17tn9e9gfgr):** domínio antigo com 301 caminho a caminho para `movepark.co`.
- **[Conteúdo 61](https://app.clickup.com/t/17tn9e9gfgv):** projeto do Semrush configurado (Backlink Audit, GA e GSC conectados, auditoria
  com limite acima de 1.000 páginas, widget orgânico no Brasil).
- **[Conteúdo 62](https://app.clickup.com/t/17tn9e9gfgy):** monitoramento de posição com cerca de 60 termos no Brasil: as 12 consultas do
  placar, os clusters de cabeça por aeroporto e as cabeças de CNF do Ataque CNF. Marca de parceiro
  (virapark, ponce park, urbanpark) fica num grupo separado, fora da meta.
- **[Conteúdo 63](https://app.clickup.com/t/17tn9e9gfgz):** origem do pico de agosto e setembro e auditoria de toxicidade. Disavow **só**
  de rede claramente spam (âncora de venda de link, domínio sem conteúdo, sub-rede repetida), nunca
  em massa.

### 5.2 Semanas 2 a 4: aproveitar o que já temos

- **[Conteúdo 64](https://app.clickup.com/t/17tn9e9gfh2):** link interno contextual da ficha do Ponce Park, da home e da página de Viracopos
  para `/estacionamentos/aeroporto-guarulhos`, com âncora de cabeça.
- **[Conteúdo 65](https://app.clickup.com/t/17tn9e9gfh4):** os erros da auditoria do Semrush e as 38 ideias do On Page SEO Checker nas 7
  páginas que ele analisou.

### 5.3 Meses 2 e 3: compra qualificada

- **[Conteúdo 66](https://app.clickup.com/t/17tn9e9gfh8):** regras da seção 4 aplicadas no WhitePress, orçamento e planilha de controle.
- **[Conteúdo 67](https://app.clickup.com/t/17tn9e9gfh9):** lote de outubro, Guarulhos.
- **[Conteúdo 68](https://app.clickup.com/t/17tn9e9gfha):** lote de novembro, Guarulhos e Confins (junto do Ataque CNF).
- **[Conteúdo 69](https://app.clickup.com/t/17tn9e9gfhb):** lote de dezembro, Curitiba e Viracopos.

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
| Termos monitorados no top 10 | 5 de 9 | 20 de 60 | 35 de 60 |
| Saúde do site no Semrush (auditoria completa) | 76% sobre 100 páginas (82% em 02/10; o plano gratuito não passa de 100) | 85% | 90% |

A meta de posição soma o efeito deste plano com o do plano de conteúdo. As duas specs medem o mesmo
GSC, então a revisão é feita junto.

## 7. Riscos

- **Penalidade por link pago.** Mitigada pela seção 4 e pelo peso no link conquistado.
- **Disavow errado derruba link bom.** Por isso só rede claramente spam, e com a lista revisada
  antes de subir.
- **Redirect do domínio antigo quebrar white-label.** A Conteúdo 60 testa os subdomínios antes e
  depois.
- **Atribuição.** Conteúdo e link sobem juntos e o efeito se mistura. O controle é a página de
  Guarulhos: ela recebe link novo, e a de Viracopos, que já tem 100 domínios, serve de comparação.
