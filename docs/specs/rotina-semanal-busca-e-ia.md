# Rotina semanal: primeira posição no Google e citação nas IAs

> **Status:** proposto em 26/11/2026.
> **Pergunta que responde:** o que fazer toda semana para a Movepark ocupar o topo de
> "estacionamento aeroporto <nome do aeroporto>" no Google e ser a fonte citada por ChatGPT,
> Gemini, Perplexity, Claude e Google (visão geral e Modo IA).
> **Não substitui** as specs que já existem. Junta o que está espalhado nelas numa cadência e diz
> o que vem primeiro:
> [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md) (alavancas, fases, placar de IA),
> [plano-autoridade-backlinks.md](./plano-autoridade-backlinks.md) (links),
> [monitoramento-posicao.md](./monitoramento-posicao.md) (os 59 termos),
> [canonicalizacao-vcp-cnf.md](./canonicalizacao-vcp-cnf.md) (qual URL é dona de cada termo),
> [seo-white-label.md](./seo-white-label.md) (os subdomínios dos parceiros),
> [rotina-mensal-frescor.md](./rotina-mensal-frescor.md) (preço publicado),
> [dados/analise-concorrentes-conteudo-2026-11.md](./dados/analise-concorrentes-conteudo-2026-11.md)
> (a pauta dos 16 posts, Conteúdo 88).

## 1. Onde estamos em 26/11/2026

### 1.1 A evolução, medida

| Indicador | Marco | 02 a 05/11 | 23 a 25/11 | Fonte |
|---|---|---|---|---|
| Cliques orgânicos em 28 dias (Brasil) | 3.427 (27/08 a 23/09) | 5.103 (24/09 a 21/10) | **6.114** (27/10 a 23/11) | Search Console |
| Impressões em 28 dias | 258 mil | 339 mil | **375 mil** | Search Console |
| Termos da meta no top 10 | 9 de 59 (04/10) | 14 de 59 | **17 de 59** | `bun run seo:posicao`, [gsc-posicao-2026-11-23](./dados/gsc-posicao-2026-11-23/RESUMO.md) |
| Tráfego orgânico estimado | 2,6 mil (29/09) | 4,4 mil | **5 mil** | Semrush |
| Authority Score | 25 | 26 | **25** | Semrush |
| Menções em IA | 8 | 29 | **38** (ChatGPT 18, visão geral 14, Gemini 5, Modo IA 1) | Semrush |
| Placar manual de citação em IA | 12 de 44 (28/08) | não rodou | **não rodou** | planilha do placar |

O tráfego quase dobrou em três meses e a Movepark está na primeira página da cabeça de quase
todos os aeroportos. **Mas não está no top 3 de nenhum.** A média do Search Console nas cabeças:

| Termo | Posição (celular / computador / geral) | Impressões em 28 dias | URL que responde |
|---|---|---|---|
| estacionamento aeroporto congonhas | 8,9 / 9,7 / **9,1** | 4.027 | `/estacionamentos/aeroporto-congonhas` |
| estacionamento viracopos | 7,1 / 9,5 / **7,8** | 4.076 | ficha do Virapark, não a praça (praça em 18,8) |
| estacionamento aeroporto curitiba | 7,6 / 8,1 / **7,7** | 5.156 | `/estacionamentos/aeroporto-curitiba` |
| estacionamento aeroporto afonso pena | 7,6 / 9,4 / **8,2** | 1.656 | a mesma de Curitiba |
| estacionamento aeroporto confins | 12,4 / 25,7 / **16,5** (caiu 4,3) | 854 | três URLs disputando: post-guia, praça e ficha da BePark |
| estacionamento aeroporto guarulhos | 16,7 / 29,8 / **22,9** | 858 | duas URLs: praça (16,6) e `/mais-barato` (14,4), mais posts antigos |

Dois padrões contam mais que qualquer número isolado:

1. **O computador fica de 5 a 25 posições atrás do celular** em Guarulhos, Confins e nos termos
   de preço de Viracopos. A causa não está medida (hipóteses na seção 4, item 12).
2. **Onde há mais de uma URL da Movepark no mesmo termo, nenhuma sobe** (Guarulhos e Confins). Onde
   há uma só (Congonhas, Curitiba), ela está entre 7 e 9 e sobe devagar todo mês.

### 1.2 Os concorrentes, medidos

Semrush, banco Brasil, 25/11/2026 (plano gratuito, visão geral do domínio):

| | Movepark | Bandeira Park | Xpark |
|---|---|---|---|
| Authority Score | 25 | **29** | 10 |
| Tráfego orgânico estimado | 5 mil (+14%) | **14,2 mil** (+0,8%) | 763 (+129%) |
| Palavras orgânicas | **6 mil** | 2,5 mil | 1,7 mil (+76%) |
| Domínios de referência | 2,8 mil (57% tóxicos no Backlink Audit de 05/10) | 386 | 171 |
| Visibilidade em IA | 18 | **34** | 14 |
| Menções em IA | 38 | **174** | 12 |
| Menções na visão geral de IA do Google | 14 | **113** | 1 |
| Fontes que a IA usa para citar a marca | movepark.co 33, google.com 15, zuldigital 13 | bandeirapark.com.br 150, **google.com 86**, **gru.com.br 59** | xpark.ai 11, parkmundo 6, movepark.co 6 |

A leitura: **a Bandeira Park tem menos da metade das palavras da Movepark e quase três vezes o
tráfego**, porque está no top 3 dos termos de dinheiro das quatro praças dela. A autoridade dela é
maior com um sétimo dos domínios, porque são domínios de verdade (imprensa), e a IA a cita a partir
de três fontes: o site, o Google (perfil e avaliações) e o site do aeroporto.

SERP orgânica do Google Brasil em 26/11/2026 (Firecrawl, retrato de um dia, sem visão geral de IA
nem mapa):

| Termo | Top 3 | Movepark | Bandeira | Xpark |
|---|---|---|---|---|
| estacionamento aeroporto congonhas | Estapar, **Bandeira**, The Parking | 7 | **2** | fora |
| estacionamento aeroporto viracopos | oficial, Virapark, Garageinn | 6 (ficha Virapark) | 4 | 9 |
| estacionamento aeroporto guarulhos | oficial, Indigo, Urban Park | fora | fora | fora |
| estacionamento aeroporto confins | oficial (2x), Multipark | fora | 8 | fora |
| estacionamento aeroporto curitiba | Indigo, Nikkey, Best Park | 8 | fora | fora |
| estacionamento aeroporto guarulhos mais barato | **Bandeira**, Econopark, Multipark | 7 | **1** | fora |
| estacionamento viracopos preço | oficial, Virapark, **Bandeira** | 7 | 3 | fora |
| estacionamento aeroporto brasília / florianópolis / porto alegre | oficial, Estapar, ParkMundo / ... | fora | fora | **6 / 3 / 9** |

Os parceiros da Movepark (Virapark e Garageinn em Viracopos, Nationpark em Curitiba) já ocupam
posições 2 a 4. Somando o ecossistema, Viracopos é a única praça onde a Movepark tem o top 3.

### 1.3 O que eles fizeram desde 03/11

- **Bandeira Park:** passou a servir a página comercial na URL exata do termo de cabeça
  (`/estacionamento-mais-barato-<aeroporto>` faz 308 para `/estacionamento-aeroporto-<aeroporto>`),
  com title "Estacionamento Aeroporto <X> (<sigla>) Mais Barato", que pega as duas intenções.
  Publicou 4 posts em 23/11 (um deles compara a Bandeira com Ponce Park e Callpark pelo nome),
  tem preço "conferido em 17/11" no topo, nota do Google e seguro de R$ 1 milhão acima da dobra,
  e saiu em 6 matérias em 2026, a mais recente no **SBT em 19/11**.
- **Xpark:** parou de escrever guia (o último é de 27/10) e cresce por modelo: +23 FAQs por
  aeroporto ("quanto custa 17 dias", "uber ou estacionamento", "traslado 24h") e +7 ferramentas,
  hoje 15 páginas de preço e 14 de "mais barato", inclusive em praça sem parceiro (é assim que
  ranqueia em Brasília, Florianópolis e Porto Alegre). Coleta preço todo dia ("última atualização
  26/11/2026"), publica `precos.json` em CC BY 4.0 e tem `/conector-claude`, uma página que ensina o
  consumidor a ligar o MCP dela no Claude, além de `/avaliacoes`, `/selo` e `/metodologia`.

### 1.4 Furos da Movepark encontrados nesta rodada

| Furo | Evidência | Efeito |
|---|---|---|
| A versão Markdown da página de praça traz 12 perguntas; o HTML traz 21 | `curl -H "Accept: text/markdown" movepark.co/estacionamentos/aeroporto-congonhas` | Quem lê por agente vê metade da página. É a superfície que a IA prefere |
| Preço pesquisado de lote mapeado em Viracopos com data de 08/09 a 09/10 | página da praça | Contra "conferido em 17/11" e "atualizado hoje" dos concorrentes, a página parece velha, mesmo com o preço do parceiro vivo |
| `/conector-claude` e `/avaliacoes` respondem 404 | curl | O MCP da Movepark é mais completo que o da Xpark e ninguém sabe |
| `/uber-ou-estacionamento-aeroporto` responde 200 sem `<title>` | curl | A consulta de decisão que a Xpark ganha em 2º não tem página nossa de verdade (o post de 23/11 cobre parte) |
| Placar de citação em IA sem rodada desde 28/08 e a tarefa agendada `placar-citacao-ia-movepark` não existe mais | planilha e lista de tarefas agendadas | A meta de 180 dias (passar Bandeira + Xpark somados) está sem medida |
| As 10 vagas do Position Tracking do Semrush não foram trocadas como manda a §4 do monitoramento | painel do projeto 17618451 | Segue medindo `virapark` e Navegantes |
| Domínio `moveparkestacionamentos.com.br` e uma página "MovePark Estacionamentos" no Reclame Aqui aparecem na busca da marca | SERP de "movepark estacionamento aeroporto" | **Homônimo, conferido em 27/11/2026:** CNPJ 22.132.629/0001-28, CPP Estacionamentos Ltda (pátio de Guarulhos), reputação "Não recomendada". Disputa a marca na IA. Ver [diretorios-gratuitos.md](./diretorios-gratuitos.md) |

## 2. A tese

Para a cabeça "estacionamento aeroporto <X>", o primeiro lugar é quase sempre do oficial, e não é
para ele que a Movepark corre. A corrida é pelas posições **2 e 3**, que hoje são da Bandeira Park
(Congonhas, Guarulhos "mais barato"), dos parceiros (Viracopos, Curitiba) ou de operador grande
(Estapar, Indigo). Quem chega lá tem quatro coisas ao mesmo tempo:

1. **Uma URL por termo**, com o termo exato no title e no H1, e nenhuma outra página da casa
   disputando.
2. **O número mais novo da SERP**, com data visível de hoje ou da semana, e a mesma página inteira
   na versão Markdown.
3. **Prova de confiança acima da dobra**: nota do Google, quantidade de avaliações, quem opera.
4. **Autoridade de verdade**: imprensa e sites do setor, não volume de domínio.

A Movepark já tem o que eles não têm (preço vivo do motor, 26 destinos, MCP, FAQ em camadas). O que
falta é o 1, o fim do 2, o 3 e o 4. Na IA vale o mesmo, com um acréscimo: **a IA cita quem aparece
em várias fontes com o mesmo número**. A Bandeira aparece no site dela, no Google e no site do
aeroporto. A Movepark aparece quase só nela mesma.

## 3. A rotina semanal

Tempo estimado: cerca de 12 horas por semana de conteúdo e 4 de dev. Os donos estão em branco de
propósito: a falta de dono é o que fez o placar de IA parar em agosto.

| Dia | O quê | Como | Dono | Pronto quando |
|---|---|---|---|---|
| **Segunda** (1h) | Medir | `bun run seo:posicao` e commitar a pasta; ler o run da `auditoria-site.yml` da madrugada; `select public.site_rebuild_health();`; print do painel do Semrush (projeto 17618451) | | Placar "X de 59" e cabeças anotados na seção 5 desta spec |
| **Segunda** (30 min) | Escolher a semana | Pegar da seção 4 o próximo item da fila e as 2 pautas da semana | | Itens no ClickUp com data |
| **Terça e quarta** | Publicar 2 peças | 1 post da pauta da Conteúdo 88 (ou da seção 4) pela skill `blogpost-seo-geo` **e** 1 atualização de uma página dona de cabeça (data, preço, FAQ, prova) | | As duas no ar, com `site_rebuild_health()` ok |
| **Quarta** | 5 FAQs novas | Perguntas reais (Pessoas também perguntam, autocomplete, perguntas que chegam no atendimento e na Mia) nas praças da semana, escopo `destination` (ADR-002) | | Cada uma com página `/faq/<slug>` no ar |
| **Quinta** | Autoridade | 1 ação de link conquistado (pauta para jornalista, parceiro, blog de viagem) **ou** 1 compra pela regra da seção 4 da spec de backlinks; conferir os links da planilha que vencem na semana | | Linha nova em `backlinks-controle.csv` |
| **Quinta** | Fontes que a IA lê | 1 fonte de terceiro com o número da Movepark: perfil de parceiro no Google, site do parceiro, diretório, matéria, resposta no Reclame Aqui, vídeo | | URL anotada na seção 5 |
| **Sexta** (1h) | Revisar | Comparar com a semana anterior, anotar o que subiu e caiu, decidir se algo da fila muda de lugar | | Uma linha na seção 5 |

**A cada 15 dias (dias 13 e 28): placar de citação em IA.** As 12 consultas da planilha, nos cinco
motores (ChatGPT, Gemini, Perplexity, visão geral e Modo IA do Google), logado sempre nas mesmas
contas, com print. Somar o Claude com busca como sexto motor a partir da próxima rodada, numa coluna
nova (nunca sobrescrever). Precisa de dono com nome e de tarefa agendada nova.

**Todo mês:** rodada de frescor (skill `frescor-de-preco`), repesquisa dos preços de lote mapeado
com mais de 30 dias, revisão do Semrush e da planilha de links.

## 4. A fila: o que fazer primeiro

Em ordem. Cada semana tira de cima o que couber.

| # | Ação | Por quê (evidência) | Esforço |
|---|---|---|---|
| 1 | ✅ **Paridade do Markdown da praça** (26/11/2026): o `.md` de `/estacionamentos/<slug>` passou a trazer as perguntas gerais junto das do destino, pela mesma regra de camadas da Edge `get-faq` (`scripts/faq-camadas.mjs`). O `audit-structured-data` do build reprova se uma pergunta do `FAQPage` faltar no `.md` | Agente de IA lê o Markdown. Via metade (12 de 21 em Congonhas) | feito |
| 2 | ✅ **Data de hoje na praça** (26/11/2026): "Conferido no motor de reservas em <data do build>" subiu do rodapé para logo abaixo do título da tabela, traduzido nos três idiomas; o rodapé ficou com a data da tabela do parceiro. **Repesquisa em andamento:** em 26/11 os 71 preços de lote mapeado publicados tinham mais de 30 dias (o mais velho, de 01/08), lista em [dados/preco-pesquisado-vencido-2026-11-26.csv](./dados/preco-pesquisado-vencido-2026-11-26.csv). A página esconde o preço sozinha aos 90 dias (`preco_pesquisado_fresco`); 30 é a meta de frescor desta rotina, não a validade. ✅ GRU (12 lotes) reconferido em 26/11 na migration `20261208150000`: GoPark e Park 222 subiram, o Bandeira tinha 15 e 30 dias na faixa errada e o Ponce Park deixou de publicar as faixas. ✅ VCP (5 lotes e a FAQ "quanto custa") reconferido em 26/11 na migration `20261208160000`: o Bandeira tinha 15 e 30 dias na faixa errada, o BR Parking virou só coberta a R$ 40,00, o Aeroparking é R$ 33,00 no sistema de reserva, o Yellow publica pacote fechado e não publica 7 dias, e o site do KM64 estava fora do ar. ✅ Os 16 posts e 12 traduções que citavam os valores antigos ([lista](./dados/vcp-textos-com-preco-antigo-2026-11-26.csv)) foram reescritos na migration `20261208170000` (47 campos, trava de md5, números de parceiro conferidos antes e depois); em 30 dias na descoberta o menor total passou a ser o do Yellow. ✅ CGH reconferido em 27/11 (migrations `20261208180000`, lotes e as duas FAQs em pt, en e es, e `20261208190000`, 4 posts): The Parking R$ 35,00, MultiPark R$ 45,00 online, Grand Parking com preço por data e sem a taxa de 20% (30 dias caíram de R$ 1.070,00 para R$ 642,39 na simulação com entrada em 01/12), e o site do Congonhas Park fora do ar (o valor de 09/10 vence em 07/01/2027). ✅ CNF reconferido em 27/11 (migration `20261208200000`): os 10 lotes publicam exatamente o mesmo que em outubro, então só a data da leitura mudou e nenhum texto precisou de reescrita. ✅ CWB reconferido em 27/11 (migration `20261208210000`): os 4 lotes iguais a outubro, só a data muda; o motor da rede do Best Park vende também o Executive Park (R$ 30,00 / 210,00 / 450,00 / 600,00), que não está no mapa e fica como candidato a lote mapeado. **Onda 1 fechada em 27/11/2026.** Só ficaram com data antiga os lotes que não deu para ler (Congonhas Park e KM64, sites fora do ar) e os que não publicam tarifa. Próxima passada: a partir de 27/12/2026, pelas praças da onda 2 da lista | Bandeira mostra 17/11, Xpark mostra o dia. A data é o primeiro critério da IA para escolher a fonte | repesquisa: 1 dia por praça |
| 3 | **Uma URL por cabeça em Guarulhos e Confins.** GRU: decidir entre a praça (16,6) e `/mais-barato` (14,4) quem é dona de "estacionamento aeroporto guarulhos", e tirar da cabeça os posts `estacionamento-gru-airport-guia-completo-...` e `preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui`. CNF: o post `guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins` (12,9) é dono de proximidade, não da cabeça; a praça (13,8) é a dona e a ficha da BePark fica com a marca. Registrar em `canonicalizacao-vcp-cnf.md` | Onde há uma URL (CGH, CWB) a Movepark está entre 7 e 9. Onde há duas ou três, está entre 14 e 23 | conteúdo 2 dias |
| 4 | **Title e topo da praça no molde que ganha:** "Estacionamento Aeroporto <X> (<sigla>): preços de hoje de <N> opções", e acima da dobra a menor diária com data, a nota do Google das unidades e quem opera. Testar primeiro em Congonhas (controle) e medir 4 semanas antes de levar às outras. **Viracopos foi antes, a pedido (27/11/2026, migration `20261209140000`):** o title virou "Estacionamento Viracopos: preços no aeroporto (VCP) \| Movepark" (`destination.meta_title`), a abertura da description e a primeira frase do intro começam pelo termo exato, e a dona de preço e o guia do aeroporto ganharam âncora "estacionamento Viracopos" para a praça. Antes disso a forma exata aparecia zero vezes no HTML da praça, que estava em 18,8 contra 7,8 da ficha do Virapark. O H1 ficou como estava, para não perder "estacionamento aeroporto viracopos" (9,8). A ficha do parceiro continua sem link para a praça (pedido da Pare Seguro, `cascaDaFicha.logic.ts`). Medir as duas consultas na segunda-feira por 4 semanas | A Bandeira ganha Congonhas em 2º com o termo exato e prova no topo. "Mais barato" no title só se a praça tiver o menor preço verificado (ADR-009) | dev 1 dia |
| 5 | **Trocar as 10 vagas do Semrush:** 5 cabeças (Congonhas, Viracopos, Guarulhos, Confins, Curitiba) + 5 perguntas do placar sem impressão no GSC | O GSC dá média; o Semrush dá o retrato diário da cabeça, que é o que esta spec persegue | 30 min |
| 6 | **Placar de IA de volta:** dono, rodada em 28/11 e 13/12, tarefa agendada nova | Sem ele a meta de IA não tem medida desde agosto | 3h por rodada |
| 7 | **Preço e "mais barato" nas praças sem parceiro** (Brasília, Galeão, Santos Dumont, Porto Alegre, Florianópolis, Salvador), com preço pesquisado datado do lote mapeado (ADR-010) | Xpark tem 15 + 14 dessas páginas e ranqueia 3 a 9 nessas praças; a Movepark tem 6 + 6 | conteúdo 1 dia por praça |
| 8 | **`/conector-claude` (e ChatGPT):** página que ensina o viajante a ligar o MCP da Movepark e perguntar o preço; linkada do `llms.txt`, do rodapé e da `/metodologia` | Xpark tem e é a única fonte que a IA encontra sobre "conector de estacionamento" | dev 1 dia, copy pela `revisar-texto` |
| 9 | **Imprensa com o índice de preços:** pauta de férias de janeiro e Carnaval com o ranking nacional (Conteúdo 71) para O Tempo, Itatiaia, g1 regional, SBT e rádios das praças | Bandeira tem 6 matérias em 2026 e AS 29 com 386 domínios. É o link que sobe autoridade e a fonte que a IA cruza | 1 pauta por quinzena |
| 10 | **Perfis do Google dos parceiros:** URL limpa para o white-label ou a ficha, resposta a avaliação, fotos, "reserve pela Movepark" onde for verdade (Conteúdo 112) | google.com é a 2ª fonte da Bandeira na IA (86 menções). Os white-labels já aparecem em 1,1 em Viracopos pelo perfil | 1 parceiro por semana |
| 11 | **Ferramenta "Uber ou estacionamento" de verdade:** a rota existe sem conteúdo no HTML; usar o post de 23/11 e o motor para servir a conta por bairro pré-renderizada | Xpark ganha a consulta em 2º com a ferramenta | dev 2 dias |
| 12 | **Investigar a diferença celular x computador:** comparar as SERPs de computador de GRU e CNF (mapa, anúncios, quem entra), o LCP de computador da praça e o CTR por dispositivo | 5 a 25 posições de diferença, sem causa medida | 3h |
| 13 | **Marca:** ~~conferir `moveparkestacionamentos.com.br` e a página "MovePark Estacionamentos" no Reclame Aqui~~ conferido em 27/11/2026: é homônimo (CPP Estacionamentos Ltda, Guarulhos). Falta: cadastrar a Movepark no Reclame Aqui no próprio CNPJ, tirar "Movepark Estacionamentos" do `alternateName` da Organization (é o nome do homônimo) e desambiguar no `llms.txt`. Plano em [diretorios-gratuitos.md](./diretorios-gratuitos.md) | A IA mistura homônimo com a marca | 2h |
| 14 | **Página `/avaliacoes`** com avaliação de reserva real, só quando houver volume que se sustente (em 03/11 eram 54 reservas) | Xpark tem; sem volume vira promessa vazia | depois |
| 15 | **SEO dos white-labels (Conteúdo 105 a 114)** na ordem da spec | Os subdomínios dos parceiros já ranqueiam em 1º no Google pelo perfil, com HTML quase vazio | Pedro e Kallef |

### 4.1 Achados das rodadas de frescor (26/11/2026), sem dono ainda

Apareceram ao reescrever Guarulhos e Viracopos e ficaram de fora porque não são preço de concorrente:

| Achado | Onde | O que fazer |
|---|---|---|
| Tabelas com dado sem fonte: lotes de Viracopos (BR Parking, Yellow) listados como de Guarulhos, Aerovalet e Ponce Park como valet, endereço "Rua das Acácias, 500" | `guia-completo-sobre-o-aeroporto-de-guarulhos` | reescrever ou tirar as tabelas |
| "JF Parking" que não existe em nenhuma outra fonte, Garageinn "100% climatizado, 17°C", rastreio "Go2Park", seguro de R$ 50.000 do Virapark, notas divergentes | `guia-completo-estacionamento-aeroporto-viracopos` | auditar contra a ficha de cada unidade |
| meta_description diz "a partir de R$ 40,00", que é o preço do Virapark e não o do Bandeira (R$ 18,49) | `bandeira-park-viracopos`, gravado pela `20261201170000` | trocar pela diária do Bandeira |
| Garageinn com duas tabelas convivendo (20/10: R$ 398,30 / R$ 1.707,00; 12/11: R$ 321,30 / R$ 1.377,00) e restos da antiga ("R$ 810,00 em 30 diárias", "R$ 189,00 na semana" contra R$ 112,00 no mesmo texto) | `como-funciona...`, `como-pagar-mais-barato...`, `e-seguro...`, `onde-deixar...` | rodada da skill `frescor-de-preco` no Garageinn VCP |
| Multipark com números idênticos aos do Bandeira (R$ 13,31 a partir da 7ª diária, 7 = R$ 93,17), de 03/09 | posts de VCP | reconferir na fonte |
| KM64 com o site fora do ar (DNS) | ficha do lote | se continuar fora, o preço vence em 07/01/2027 e some sozinho |

### 4.2 Cuidado: push em rajada derruba a API (27/11/2026)

Entre 15h06 e 15h58 de 27/11 saíram 8 pushes de conteúdo seguidos. Cada push dispara três builds
(Workers Builds, CI e Lighthouse), e cada build pré-renderiza as páginas chamando `/rest/v1/faq`
milhares de vezes. Foram 126 mil requisições em uma hora, de 337 IPs do Cloudflare e da Azure, contra
umas 500 a cada 5 minutos no normal. Às 16h05 a API do Supabase passou a responder 522 para quase
tudo, inclusive `simulate_price` de cliente, e só voltou depois de reiniciar o projeto no painel,
perto das 17h35. O Postgres continuou de pé o tempo todo; quem travou foi a camada de acesso.

Regra da rotina: **conteúdo que vive no banco não precisa de push para publicar** (a fila de rebuild
faz isso sozinha). Junte os commits de uma rodada num push só. O conserto de fundo é o build buscar a
FAQ uma vez e reaproveitar, em vez de uma chamada por página.

## 5. Registro semanal

Uma linha por semana, sem apagar as anteriores. Números da segunda-feira.

| Semana | Top 10 (de 59) | CGH | VCP | GRU | CNF | CWB | Cliques 28d | Publicado | Fonte de terceiro | Nota |
|---|---|---|---|---|---|---|---|---|---|---|
| 23/11/2026 | 17 | 9,1 | 7,8 | 22,9 | 16,5 | 7,7 | 6.114 | `vale-a-pena-deixar-o-carro-no-aeroporto-ou-ir-de-uber`, `preco-estacionamento-aeroporto-ferias`, `voo-de-madrugada-guarulhos` | | Marco desta spec. Posição geral do GSC na cabeça; em VCP é "estacionamento viracopos" |

## 6. Metas

Somam-se às das specs de conteúdo e de backlinks, sem trocá-las.

| Métrica | 26/11/2026 | 28/02/2027 | 31/05/2027 |
|---|---|---|---|
| Cabeças (CGH, VCP, GRU, CNF, CWB) com URL da Movepark no top 3 do Semrush | 0 de 5 no retrato do Firecrawl (o Semrush marca CGH e CWB em 1º; ver seção 7) | 2 de 5 | 4 de 5 |
| Posição geral no GSC da cabeça de GRU | 22,9 | até 10 | até 5 |
| Termos da meta no top 10 | 17 de 59 | 25 de 59 | 35 de 59 |
| Menções em IA no Semrush | 38 (Bandeira 174) | 80 | acima da Bandeira |
| Placar manual de IA, Movepark contra Bandeira + Xpark | 12 contra 21 (28/08) | empate | à frente |
| Matérias de imprensa com link no ano | 0 encontradas | 3 | 8 |

## 7. Cuidados de leitura

- **Semrush e Search Console discordam na cabeça.** O Position Tracking marca Congonhas e Curitiba
  em 1º (retrato de um dia, uma localização), o GSC dá 9,1 e 7,7 (média de todas as buscas) e o
  Firecrawl deu 7 e 8. O GSC é o que manda para tendência; o Semrush, para saber se o retrato do
  topo mudou.
- **O white-label conta no Search Console.** A propriedade `sc-domain:movepark.co` inclui
  `virapark.movepark.co` e os outros subdomínios, que aparecem em 1,1 pelo perfil do Google. Não
  somar isso à posição do `movepark.co`.
- **Indício Bandeira e Xpark do mesmo grupo** (selo "Parceiro Xpark", link da página de Congonhas
  da Bandeira para o comparador da Xpark): segue sendo indício e não vai para texto publicado.
- **Nada de comparar parceiro com concorrente pelo nome** em página da Movepark só porque a
  Bandeira faz. Em site de parceiro a regra é não citar concorrente nenhum.
