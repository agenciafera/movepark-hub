# Rotina mensal de frescor das páginas de cabeça

**Status:** primeira rodada executada em 17/09/2026; rodada extra em 19/10/2026, puxada pela virada de fim de ano de GRU e CGH; rodada de outubro executada em 03/11/2026 (GRU, CGH, CWB e VCP)
**Atividade:** [Conteúdo 38, rotina mensal de carimbo e valores](https://app.clickup.com/t/86ak6hdhe)
**Depende de:** [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md) (Defesa), [canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md), [baseline-search-console.md](./baseline-search-console.md)

## Por que existe

Conteúdo de preço apodrece, e o modelo trata número sem data como possivelmente velho. A rotina
existe para que o frescor seja fato verificável, e não promessa: toda cifra publicada carrega a data
em que foi apurada, e a data acompanha a revisão do parceiro.

## O que a rodada de 17/09/2026 encontrou

### Passo 1: quem revisou tabela desde a última rodada

`destination_price_freshness(<slug>)` responde isso sem abrir o Manager. Em 17/09/2026:

| Praça | Tabela do parceiro mudou em | Situação |
| --- | --- | --- |
| Guarulhos (GRU) | 11/09/2026 | revisou depois da última rodada |
| Congonhas (CGH) | 11/09/2026 | revisou depois da última rodada |
| Confins (CNF) | 10/09/2026 | revisou depois da última rodada |
| Tietê | 12/08/2026 | sem mudança |
| Afonso Pena (CWB) | 10/08/2026 | sem mudança |
| Viracopos (VCP) | 10/08/2026 | sem mudança |

Praça que não revisou tabela não precisa de texto novo, só de conferência. Praça que revisou tem
todas as cifras do acervo dela vencidas até prova em contrário.

### Passo 2: o que foi corrigido nas páginas que citam R$

Em Guarulhos, seis páginas foram atualizadas para a tabela de 17/09/2026. Quatro já tinham sido
corrigidas na entrega do Conteúdo 31 (preço, barato, proximidade e segurança) e duas entraram
nesta rodada:

| Página | O que estava publicado | O que passou a valer |
| --- | --- | --- |
| `guia-atualizado-5-melhores-opcoes-...-guarulhos-em-2024` | semana descoberta de R$ 132,30 no Aeropark e R$ 111,30 no Aerovalet, coleta de 27/08 | R$ 93,17 nos dois, porque de sete diárias em diante as tabelas ficaram iguais |
| `estacionamento-gru-airport-guia-completo-...` | tarifa do oficial inventada e sem data ("Premium cerca de R$ 120/dia", "Econômico a partir de R$ 70/dia"), mais "quatro terminais" | tabela real do operador por setor, com data, e três terminais |

O segundo caso é o mais grave e vale a regra: **tarifa de terceiro sem data nem fonte é invenção com
cara de dado**, e ela sobreviveu a duas consolidações. A busca por faixa de valor ("R$ 70 a R$ 120
por dia") não existia em nenhuma tabela do aeroporto.

A mesma página ganhou link para as três páginas por terminal, o que resolve o risco de ela disputar
a consulta de terminal com as novas.

### Passo 3: o carimbo automático está de pé

O carimbo do Conteúdo 26 funciona e dispensa trabalho manual. Conferido no ar em 17/09/2026:

- Em post que publica preço, a linha sai como `Preços conferidos no motor de reservas em 11/09/2026`,
  que é a data da revisão do parceiro, e não a data em que o texto foi editado.
- Em post sem cifra (`guia-completo-sobre-o-aeroporto-de-guarulhos`), a linha não aparece.
- O `dateModified` do `BlogPosting` sai como a maior data entre a edição do texto e a tabela.

Ou seja, o passo 3 da rotina deixou de ser editorial. O que resta é conferir se o carimbo aparece,
não escrever a data à mão.

### Passo 4: as páginas que mais caíram de posição

Comparação das duas janelas de 15 dias que já estavam coletadas, 12 a 26/08 contra 31/08 a 14/09,
filtrando páginas com pelo menos 30 impressões na janela anterior (227 páginas comparáveis):

| Página | Posição antes | Posição depois | Impressões | Leitura |
| --- | --- | --- | --- | --- |
| `/p/nationpark/aeroporto-afonso-pena/covered` | 13,1 | 79,0 | 206 para 3 | queda esperada: caminho legado que responde 301 |
| `/estacionamento-mais-barato/<gru>` | 41,9 | 77,1 | 81 para 179 | impressão subiu e posição caiu: passou a aparecer para consulta mais ampla |
| `/blog/aeroporto-afonso-pena-5-melhores-opcoes-...` | 20,1 | 50,0 | 361 para 43 | queda esperada: slug consolidado em 28/08 |
| `/blog/onde-estacionar-proximo-ao-aeroporto-de-viracopos/` | 22,9 | 50,4 | 374 para 63 | queda esperada: slug consolidado |
| `/blog/as-melhores-estrategias-para-economizar-...` | 72,2 | 98,0 | 223 para 1 | queda esperada: slug consolidado |
| `/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos` | 34,4 | 53,4 | 548 para 770 | página viva, impressão subindo: a analisar na próxima rodada |
| `aeropark.movepark.co/aeroporto-guarulhos/vaga-coberta` | 9,1 | 27,1 | 344 para 41 | subdomínio de white-label, fora da superfície de SEO |
| `/blog/guia-completo-sobre-o-aeroporto-de-guarulhos/` | 12,9 | 28,1 | 211 para 109 | **queda real em página viva**, candidata a revisão |

A leitura que importa: **cinco das oito maiores quedas são de URL que a consolidação mandou para
301**, e isso é a promessa se cumprindo, não um problema. O relatório do `seo:gsc-comparar` mostra o
outro lado da mesma moeda: as donas subiram de 12.649 para 19.660 impressões, e os redirecionados
caíram de 8.288 para 3.222.

Nos 12 clusters de cabeça, 10 ganharam posição. Os dois que perderam:

- **GRU proximidade**, de 43,8 para 51,7, com 247 impressões a menos. É o único cluster de cabeça
  com queda de impressão na janela, e tem dono: a âncora foi reescrita em 17/09 com a tabela nova.
- **CWB barato**, de 9,0 para 11,9, mas com 34 impressões a mais.

### Passo 5: consolidação, e por que ela não foi executada

A rotina pede quatro consolidações por mês. Os quatro pares candidatos existem, mas medi os dois
lados antes de mexer, e **em todos eles o post antigo é o que tem tráfego**:

| Praça | Candidato antigo | Impressões | Candidato novo | Impressões |
| --- | --- | ---: | --- | ---: |
| CGH | `top-3-estacionamentos-do-aeroporto-de-congonhas` | 1.463 | `estacionamento-barato-aeroporto-congonhas` | 115 |
| NVT | `top-3-estacionamentos-do-aeroporto-de-navegantes` | 1.325 | `melhores-precos-de-estacionamento-...-navegantes` | 20 |
| CNF | `top-3-estacionamentos-do-aeroporto-de-confins` | 689 | `estacionamento-mais-barato-no-aeroporto-de-confins` | 262 |
| VCP | `estacionamento-aeroporto-viracopos-vcp-guia-completo-...` | 4.775 | `quais-os-melhores-estacionamentos-...-2024` | 307 |

Consolidar "o antigo no novo", que é o reflexo natural, jogaria fora de 689 a 4.775 impressões por
par. É exatamente a inversão que a revisão de 28/08 apontou em CWB, quando uma dona de 891 cliques
tinha sido absorvida por uma de 1 clique.

Por isso a decisão foi **medir e devolver**: as quatro praças acima são de outras pessoas, e a
eleição do vencedor é delas. O que esta rodada entrega é o número que decide, não o redirect.

## O que a rodada de 19/10/2026 encontrou

Rodada fora do calendário, puxada pela virada de fim de ano (Marés 12): Aeropark e Aerovalet
viraram em 19/10/2026, em GRU e CGH, e a Plenty Park em 16/10/2026, em CGH, com vigência até
31/01/2027. As FAQs das duas praças já tinham sido trocadas no mesmo dia (`20261130140000` e
`20261130150000`). Os posts ficaram para cá porque são retrato datado: a virada não os torna
falsos, só velhos. Esta rodada fez só os passos 1 a 3; GSC e consolidação ficam para a mensal de
novembro.

### Passo 1: quem revisou tabela

`destination_price_freshness` em 19/10/2026: Guarulhos às 17h56 e Congonhas às 18h05, as duas
depois do espelho do WL. Os posts citavam três datas de motor velhas: 11/09 e 17/09 (GRU), 05/09,
10/08 e 11/09 (CGH), e um deles ainda trazia preço de agosto.

### Passo 2: 15 posts, 31 corpos, 305 trechos

Uma varredura por regex com os valores antigos em todo `blog_post` publicado achou os 14 posts da
atividade e mais dois. Um entrou na rodada (`aeroporto-de-congonhas-informacoes-completas`, com a
diária de agosto). O outro ficou de fora de propósito (ver "O que ficou aberto").

| Praça | Posts | Com tradução en/es |
| --- | --- | --- |
| GRU | preço, barato, proximidade, segurança, GRU Airport, guia de 5 opções, Aeropark coberta, Terminal 1, 2 e 3 | GRU Airport, guia de 5, Aeropark, T1, T2, T3 |
| CGH | preço, barato, deixar o carro, top 3, informações completas | top 3, informações completas |

**Toda cifra saiu do `simulate_price`.** Uma calculadora consultou o RPC ao vivo para 1 a 31
diárias, nas oito vagas das duas praças, com o balcão (`old_price`). Diferença, percentual e
degrau foram calculados sobre essa saída, e um verificador conferiu que todo R$ novo nos textos é
preço, valor por dia ou balcão do motor, valor do oficial, ou a diferença entre dois deles. O bloco
"Os pátios do ... em números" é a saída de `bun run lint:bloco-fato -- --print GRU`, colada sem
mexer.

**O que mudou de sentido, e não só de número:**

- **GRU: as tabelas deixaram de ser iguais.** De 11/09 a 19/10, Aeropark e Aerovalet cobravam o
  mesmo de sete diárias em diante, e uma dúzia de frases dependia disso ("empata", "a proximidade
  sai de graça", "Aerovalet ou Aeropark: R$ X"). Agora o Aerovalet sai mais barato em todas as
  durações, nos dois tipos de vaga, e a proximidade do Aeropark tem preço: R$ 14,00 a mais em 7
  diárias e R$ 90,00 em 30, na descoberta. As linhas "Aerovalet ou Aeropark" foram separadas.
- **GRU: o degrau mudou de lugar.** "Na véspera do degrau, um dia a mais sai mais barato" vale em
  12→13 e 17→18 na Aerovalet (as duas vagas) e só em 17→18 na coberta do Aeropark. Na descoberta
  do Aeropark não existe mais (13 diárias custam R$ 6,90 a mais que 12). O de 6→7 sumiu. A
  atividade dizia que os degraus de 12/13 e 17/18 continuavam; vale só na Aerovalet.
- **GRU: o oficial voltou a ganhar no mês.** Em 30 diárias, o Standard (R$ 505,00, tabela de
  17/09/2026) fica abaixo de três das quatro vagas dos parceiros. Só a descoberta da Aerovalet
  (R$ 447,00) segue abaixo, por R$ 58,00. Na quinzena a economia caiu de 68% para 50,3% (Aerovalet)
  e 40,9% (Aeropark). Nos posts do T1 e do T2, o caso "estadia de um mês" saiu da seção "quando o
  oficial não compensa" e entrou "viagem de quinze dias" no lugar.
- **GRU: o valet passou do Premium.** Em 15 diárias, o valet (R$ 692,90) custa R$ 82,90 a mais que
  o Premium do T2/T3. O post do T3 dizia que "até o valet do parceiro sai mais barato que o oficial
  daqui"; a frase se inverteu.
- **CGH: os parceiros deixaram de ser os baratos.** Aerovalet de R$ 32,90 para R$ 42,90 a diária e
  Plenty de R$ 29,90 para R$ 39,90. A Plenty fica mais barata de 3 a 12 e de 15 a 17 diárias, e de
  18 em diante os dois cobram o mesmo (R$ 1.077,00 em 30). "O Aerovalet tem o menor custo por dia
  da região" caiu. No post "barato", o Aerovalet saiu do top 5 e nenhum parceiro lidera faixa: o
  número aponta para o pacote do oficial (3 a 10 diárias, com vaga promocional), o The Parking e o
  pacote do Express Parking. O texto diz isso como é. O que o parceiro entrega de fato (vaga
  coberta, 24 horas, distância) continua dito.

**O que não mudou:** a tarifa do oficial (GRU, tabela do operador de 17/09/2026; CGH, Estapar de
05/09/2026) e os preços de lote sem contrato ficaram com a data deles, inclusive onde eram iguais
aos da tabela velha dos parceiros (Bandeira Park e MultiPark em GRU). Comparação de datas
diferentes vem com as duas datas escritas, e as frases "conferido na mesma data" viraram a data do
oficial por extenso.

**Gravação:** migration `20261130160000_blog_frescor_virada_fim_de_ano.sql`, com `replace()` só nos
parágrafos que mudaram. O gerador conferiu que a sequência reproduz o texto revisado byte a byte e
que uma segunda passada não muda nada. A trava do fim aborta se sobrar, em qualquer idioma, valor
ou data que sumiu do texto revisado.

Com 348 KB, a migration não cabe inline no `apply_migration` do MCP. O banco leu o arquivo do
commit fixo por `pg_net` (o repo é público, então `raw.githubusercontent.com/<sha>/...` responde
sem token), e o `apply_migration` só fez `execute` do conteúdo depois de o md5 bater com o do repo.
Conferência depois de aplicar: os 31 corpos e os metadados lidos de volta pela API são idênticos,
byte a byte, ao texto revisado.

### Passo 3: o carimbo

O `blog_post` dispara o rebuild sozinho e `site_rebuild_health()` estava `ok` em 19/10. A linha
`Preços conferidos no motor de reservas em 19/10/2026` passa a sair nos posts com preço no build
seguinte.

### O que ficou aberto

- **O post de preço de Curitiba compara com Guarulhos** ("a semana descoberta custava R$ 118,30
  em Curitiba e R$ 93,17 em Guarulhos", em 17/09/2026). Ficou de fora porque Nation e Abba viram em
  26/10, e refazer o lado de GRU agora deixaria a comparação com duas datas por uma semana. Entra
  na rodada da virada de Curitiba.
- **O preço de terceiros relido em 09/10** (`20261129140000`) não foi levado aos posts. Em CGH a
  MultiPark passou de R$ 40,00 para R$ 39,00, por exemplo. O post segue certo com a data de 05/09,
  mas a página do destino mostra o número de 09/10. É trabalho da mensal de novembro.
- **Fato de ficha divergente no post `aeropark-descubra-...-vagas-cobertas`**, achado na revisão e
  fora do escopo de preço: o FAQ diz "a 2,7 km do terminal" (a ficha mede 1,88 km), e o corpo diz
  van "a cada 10 minutos" e "a 15 minutos do GRU" (a ficha declara 30 e 10). O post não é dona, então
  o `lint:bloco-fato` não o confere.
- **`blog_post_i18n` não tem trigger de rebuild.** Trocar só a tradução não publica sozinho. Aqui
  não fez diferença porque o pt mudou junto, mas a regra do `CLAUDE.md` pede o trigger em toda
  tabela pré-renderizada. **Fechado em 03/11/2026** (`20261201160000`, ver abaixo).

## O que a rodada de outubro encontrou (03/11/2026)

Atividade: [Conteúdo 38, rodada de outubro/2026](https://app.clickup.com/t/86akkpq61). Saiu em 03/11
porque a virada de Curitiba (27/10) e a tabela nova da Aerovalet (28/10) caíram no fim do mês.

### Passo 1: quem revisou tabela

`destination_price_freshness` em 03/11/2026, e o que de fato mudou, lido do histórico do espelho
(`pricing_mirror_run`, `before` e `after` de cada vaga):

| Praça | Mudou em | O que mudou |
| --- | --- | --- |
| GRU | 28/10/2026 | Aerovalet descoberta e coberta, tabela alinhada ao Bandeira Park ([card](https://app.clickup.com/t/17tn9e9ugp1)): faixas 1-6 / 7-16 / 17-29 / 30+, descoberta de R$ 16,90 a R$ 6,90 por dia, coberta de R$ 19,90 a R$ 8,90. A diária avulsa de R$ 18,49 deixou de existir. Aeropark e valet seguem na tabela de 19/10 |
| CGH | 28/10/2026 | Aerovalet coberta, mesmas faixas: de R$ 28,90 a R$ 14,90 por dia (era de R$ 42,90 a R$ 35,90). Plenty Park segue na de 16/10 |
| CWB | 27/10/2026 | Abbapark e Nationpark, as três vagas de cada (virada de fim de ano), alta de R$ 2,00 a R$ 6,00 por dia |
| VCP | 20/10/2026 | Virapark de R$ 28,90/R$ 24,90 para R$ 32,90/R$ 29,90 por dia (dia avulso segue R$ 40,00); Garageinn de R$ 45,90 para R$ 56,90 da segunda diária em diante (primeira segue R$ 59,99) |
| CNF | 06/10/2026 | BePark só estendeu a tabela além de 31 diárias; nada até 31 mudou, e os posts seguem certos |
| Tietê | 12/08/2026 | sem mudança |

`price_updated_at` sai de `mirror_sampled_at`, que o espelho só reescreve quando o fingerprint da
regra muda (ver [indice-precos.md](./indice-precos.md)). Por isso a data é confiável como "mudou de
verdade", e o `before`/`after` do espelho diz exatamente quais valores sumiram.

### Passo 2: 24 FAQs e 45 posts, 255 campos

A varredura comparou todo R$ publicado (pt, en, es; corpo, resumo, `meta_description`, `answer`)
com a curva antiga e a nova de cada vaga, de 1 a 31 diárias, online e balcão. Achou valor vencido
em 24 FAQs e 47 posts, com cerca de 1.900 ocorrências (parte delas falso positivo, como tarifa do
oficial que coincide com um número antigo de parceiro).

A reescrita foi feita em sete pacotes por praça, com a mesma ficha de preço para todos (o
`simulate_price` de 1 a 31 diárias lido em 03/11, com a data de cada tabela) e um verificador que
lista, campo a campo, todo R$ que só existe na tabela antiga. Os resíduos que ficaram foram
conferidos um a um: são tarifa do oficial ou de terceiro, diferença calculada que coincide com um
total antigo, ou número novo de uma praça igual a um antigo de outra.

| Pacote | Campos | O que mudou de sentido |
| --- | ---: | --- |
| FAQs das quatro praças | 84 | Em CGH a menor diária passa a ser a da Aerovalet (R$ 28,90), não a do The Parking, e ela fica abaixo da Plenty em toda duração; em GRU o parceiro ganha do oficial desde o primeiro dia e as duas vagas da Aerovalet ficam abaixo do Standard no mês; em CWB a Abbapark deixa de empatar com a Área C do oficial e com o Hangar Vip; em VCP a queda por duração encolhe (Virapark 25%, Garageinn 5%) |
| GRU, lote 1 (barato, preço, T1, Aeropark coberta, segurança, proximidade) | 19 | Trocar de pátio vira a segunda maior alavanca de economia; ficar mais perto (Aeropark) custa R$ 56,00 na semana e R$ 330,00 no mês; no mês, as duas vagas da Aerovalet ficam abaixo do Standard |
| GRU, lote 2 (T2, T3, GRU Airport, 5 opções, guia do aeroporto, mensal) | 36 | O mensal ainda estava em setembro e foi trazido inteiro para as tabelas vigentes; "os dois parceiros cobram igual de sete diárias em diante" saiu; a pegadinha do degrau passa a ser 6 diárias custarem mais que 7 |
| CGH e posts de várias praças (convênio, quanto custa) | 27 | A Aerovalet volta ao top 5 do post barato, em 2º; "empate de R$ 1.077,00 no mês" e "Plenty mais barata na semana" saíram; em VCP o mês no Virapark passa dos dez dias no oficial |
| CWB | 26 | O parceiro passa a sair R$ 75,00 mais caro que a Área C do oficial em 15 diárias; a comparação Curitiba x Guarulhos (que ficou aberta em 19/10) foi refeita com as duas tabelas vigentes, e a diferença do mês vira cerca de três vezes |
| VCP, dois lotes | 63 | O Virapark cai no ranking de 7 diárias (Yellow e Aeroparking ficam à frente); a tese "reservar online é a maior economia" caiu; a vaga coberta do Virapark só ganha do bolsão F a partir do 7º dia |

Em todos os posts, o bloco "Os pátios do ... em números" foi trocado pela saída de
`bun run lint:bloco-fato -- --print <PRAÇA>`, sem edição. Data de preço de oficial e de terceiro
ficou como estava; frase que compara datas diferentes passou a escrever as duas.

**Dois erros antigos corrigidos de passagem**, porque a frase ficaria falsa de qualquer jeito: os
posts `garageinn-viracopos` e `viracopos-aeroparking` diziam que a diária do Garageinn cai "a partir
da sétima" (o motor mostra a queda na segunda), e `estacionamento-dentro-do-aeroporto-de-viracopos`
dava o preço de balcão do Virapark como se fosse o online.

**Gravação:** `20261201170000_frescor_outubro_quatro_pracas.sql`, 1,7 MB, com cada campo trocado
inteiro e só se o `md5` ainda for o do texto lido em 03/11 (senão a migration aborta e nada é
gravado). Aplicada por `pg_net` a partir do commit `936027ee`, com trava de md5 do arquivo, como na
rodada de 19/10. Conferência depois de aplicar: os 255 campos lidos de volta pela API são
idênticos, byte a byte, ao texto revisado.

### Passo 3: o carimbo e a publicação

`20261201160000_traducoes_disparam_publicacao.sql` deu a `blog_post_i18n` e `faq_i18n` o trigger
`<tabela>_site_rebuild` que faltava, antes da migration de conteúdo. A migration de conteúdo é um
`do` com 255 `update`, e cada um enfileira um pedido: `site_rebuild_health()` acusa `fila_grande`
(255 contra o limite de 250) até o cron despachar, e aí o pg_cron coalesce tudo num build só. Em
03/11 isso levou quatro minutos: aplicada às 11h43, despachada às 11h47 com o Deploy Hook
respondendo 200, e o alarme voltou a `ok`.

### Passo 4: quedas de posição

Coleta nova: `docs/specs/dados/gsc-baseline-2026-10-31` (17 a 31/10/2026), comparada com a de 31/08
a 14/09. O site cresceu: de 205.892 para 236.547 impressões e de 1.971 para 2.926 cliques. Nos 12
clusters de cabeça, 10 ganharam posição; GRU deu o maior salto (preço de 39,9 para 23,1, barato de
38,4 para 17,1, proximidade de 51,7 para 28,1). Perderam CNF barato (9,4 para 13,3, com mais
impressões) e, por menos de uma posição, CWB proximidade.

Das 447 páginas comparáveis (30 impressões ou mais antes), 219 caíram mais de 5 posições ou
perderam metade das impressões. 91 respondem 301 (consolidação, esperado), e boa parte das 128 que
respondem 200 são âncoras `#secao-...` que o Google deixou de listar à parte. As quedas de página
viva que importam, lidas por consulta em `consulta-por-pagina.csv`:

| Página | Antes | Depois | Leitura |
| --- | --- | --- | --- |
| `/blog/estacionamento-aeroporto-viracopos-vcp-guia-completo-...` (dona de preço de VCP) | 10,0 · 4.775 imp. | 21,0 · 366 | perdeu as consultas genéricas ("estacionamento viracopos", "estacionamento aeroporto campinas") para a ficha do Virapark, e as de marca (Estapar, Yellow) para os posts por lote. A praça caiu de 35.787 para 32.430 impressões: é a única perda líquida e merece olhar na próxima rodada |
| `/estacionamentos/aeroporto-curitiba/abbapark` e `/nationpark` | 10,5 · 5.494 e 9,0 · 3.020 | 10,4 · 985 e 12,4 · 557 | a página do destino `/estacionamentos/aeroporto-curitiba` ganhou 8.012 impressões (de 17,6 para 8,3): o sinal migrou para ela, e a praça cresceu |
| `/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/` | 19,5 · 1.514 | 37,1 · 847 | a cauda longa de preço passou para `/estacionamentos/aeroporto-guarulhos`, que ganhou 1.783 impressões |
| `/estacionamentos/aeroporto-curitiba/mais-barato` | 16,3 · 494 | 52,8 · 65 | mesma migração para a página do destino |
| `/estacionamentos/aeroporto-congonhas/aerovalet` | 7,5 · 344 | 18,3 · 236 | a consulta genérica "aerovalet" foi para a ficha de GRU; "aerovalet congonhas" segue em 4,4 |

**As duas pendências de setembro se resolveram sozinhas:** `/blog/guia-completo-sobre-o-aeroporto-de-guarulhos/`
voltou de 28,1 para 14,3, e `/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos` de 53,4 para
28,4.

### Passo 5: consolidação

Os quatro pares medidos de novo na janela de 17 a 31/10:

| Praça | Antigo | Impressões | Novo | Impressões |
| --- | --- | ---: | --- | ---: |
| CGH | `top-3-estacionamentos-do-aeroporto-de-congonhas` | 1.262 (10,8) | `estacionamento-barato-aeroporto-congonhas` | 405 (20,7) |
| NVT | `top-3-estacionamentos-do-aeroporto-de-navegantes` | 743 (8,1) | `melhores-precos-de-estacionamento-...-navegantes` | 79 (15,9) |
| CNF | `top-3-estacionamentos-do-aeroporto-de-confins` | 229 (17,1) | `estacionamento-mais-barato-no-aeroporto-de-confins` | 172 (14,3) |
| VCP | `estacionamento-aeroporto-viracopos-vcp-guia-completo-...` | 366 (21,0) | `quais-os-melhores-...-2024` | 295 (15,2) |

CGH e NVT seguem com o antigo muito à frente, e nada muda. **CNF e VCP chegaram perto do empate**,
com o novo em posição melhor nos dois. Nenhum par foi consolidado: a eleição segue com o dono de
cada praça, e em VCP ela depende de entender a perda do guia (passo 4) antes.

### O que ficou aberto

- **Preço de terceiros relido em 09/10** (`20261129140000`) segue fora dos posts, como em 19/10.
- **Fatos de ficha divergentes que não são preço**, vistos na reescrita e não mexidos:
  - distância da Aerovalet GRU como 4,5 km ou 2,8 km (FAQs `quanto-custa` e `qual-o-mais-barato`
    de GRU, `guia-completo-sobre-o-aeroporto-de-guarulhos`), contra 4,85 km do T1 na ficha;
  - o post `aeropark-descubra-...-vagas-cobertas` (van a cada 10 minutos, 2,7 km, lavagem), que já
    estava aberto em 19/10, e o "AeroParking" do guia GRU Airport;
  - em CGH, 700 m e 900 m num post e 740 m e 860 m nos outros; oficial a R$ 39,90 num e R$ 44,90 nos
    outros, na mesma data;
  - em VCP, o `guia-completo-estacionamento-aeroporto-viracopos` diverge do acervo em nota, número
    de avaliações, tempo de van e "100% coberto"; as traduções de `quais-os-melhores` são de uma
    versão anterior do pt e dizem que o Bandeira Park custa "menos da metade do segundo colocado";
  - em CWB, a FAQ do top 3 responde "dois em agosto de 2026" a "quantos parceiros existem hoje";
  - as traduções do post de convênio divergem do pt na linha de Confins e na FAQ do maior desconto.
- **Tarifa do oficial divergente entre FAQs**: VCP (R$ 28,00/R$ 75,00 numa, R$ 31,00/R$ 83,00 nas
  outras), Hangar Vip em CWB (R$ 15,90 e R$ 36,00), FlyPark em GRU (R$ 40,80 e R$ 21,60).
- **A perda da dona de preço de VCP** (passo 4).

## Rodada extra de 12/11/2026: Garageinn volta ao FLAT

A pedido do cliente, a vaga avulsa do Garageinn (VCP) voltou à tabela de antes de 20/10: R$ 59,99
por um dia só e R$ 45,90 por dia a partir de 2 diárias, com balcão de R$ 59,99 por dia e sem data
de fim ([card](https://app.clickup.com/t/17tn9ea05jg)). O WL virou em 12/11/2026, o espelho copiou
às 13h48 e o build do site saiu às 13h56. O Virapark não mudou.

O que estava escrito à mão e ficou para trás: 6 FAQs e 10 traduções, 12 posts e 4 traduções, 35
campos no total (`20261203120000_frescor_garageinn_flat_novembro.sql`, 388 KB, aplicada por
`pg_net` como as anteriores). A varredura procurou R$ 56,90, todo total de 56,90 × n (2 a 31
diárias) e toda diferença entre esse total e o Virapark na mesma duração. Os resíduos que ficaram
são falso positivo: R$ 270,00 é a condição da Azul na Garageinn, que não mudou, e R$ 120,00 é o
balcão do Virapark e a semana da BePark.

**O que mudou de sentido:**

- **A distância entre os parceiros encolheu.** A semana no Garageinn passou de R$ 189,00 para
  R$ 112,00 acima do Virapark, e o mês de R$ 810,00 para R$ 480,00. A escolha do pátio segue sendo
  a maior alavanca em "como pagar mais barato" (R$ 112,00 contra R$ 70,70 da reserva online no
  Virapark), mas "quem escolhe pela distância paga quase duas vezes" virou "paga 53,5% a mais".
- **A reserva online voltou a render no Garageinn.** A queda contra o balcão passou de 5,2% para
  23,5%, quase a do Virapark (25,3%). "O Garageinn baixa pouco" e "a diferença encolheu nos dois"
  saíram; a menor diferença entre balcão e online na semana passa a ser a do Virapark (R$ 70,70).
- **Contra o oficial.** O Garageinn fica R$ 259,70 abaixo do edifício garagem na semana (era
  R$ 182,70) e 44,7% abaixo na diária (era 31,4%). O convênio da Azul ainda ganha da reserva online,
  mas por R$ 51,30 (era R$ 128,30).
- **No post do Garageinn**, a regra "perde em estadia longa" passou de "acima de 10 dias" para "a
  partir de 19 diárias", que é quando a diferença para o Virapark passa de R$ 300,00.

**Três erros antigos corrigidos de passagem:** a frase "R$ 59,99 na primeira e R$ 56,90 a partir
da segunda" sugeria que duas diárias custam 59,99 + a segunda, quando o motor cobra o valor por dia
em todas (2 diárias = 2 × R$ 45,90); virou "R$ 59,99 por um dia só e R$ 45,90 por dia a partir de
duas diárias". A `meta_description` do post `garageinn-viracopos` dizia "Diária a partir de
R$ 40,00", que é o preço do Virapark. E o post `virapark-viracopos` dizia que a diária avulsa do
Virapark (R$ 40,00) "perde para o Garageinn" (R$ 59,99).

## O procedimento, para a próxima rodada

> Desde 12/11/2026 o método mora na skill `.claude/skills/frescor-de-preco/SKILL.md`, que cobre
> também a virada de um parceiro só (o caso que a motivou foi a Aeropark). Os passos abaixo são o
> resumo; a skill traz as queries, o modelo de migration e as armadilhas.

1. `select d.short_name, f.* from destination d cross join lateral public.destination_price_freshness(d.slug) f ...`
   e liste as praças que revisaram tabela desde a última rodada.
2. Para cada praça que revisou, leia o `before` e o `after` de `pricing_mirror_run` desde a última
   rodada para saber quais valores sumiram, e procure esses valores em todo campo publicado
   (pt, en, es; corpo, resumo, `meta_description`, `answer` da FAQ). Corrija os que ficaram para
   trás e grave trocando o campo inteiro com trava de `md5`, como em `20261201170000`.
3. Confira o carimbo no ar em um post de preço e em um sem preço. Se a linha aparecer com a data da
   tabela, o passo está feito.
4. Rode `bun run seo:gsc-comparar -- --antes <janela> --depois <janela>` e compute as quedas por
   página a partir de `paginas.csv` das duas coletas. Separe queda de slug consolidado, que é
   esperada, de queda em página viva, que é trabalho.
5. Antes de consolidar qualquer par, **meça os dois lados na janela mais recente**. O vencedor é o
   que tem impressão, e não o que foi escrito por último.

## Armadilha de coleta, agora fechada no código

O coletor nomeia a pasta pela data final da janela, então duas coletas que terminam no mesmo dia
disputam o mesmo diretório. Nesta rodada eu rodei `seo:gsc-baseline` sem argumento e sobrescrevi a
coleta de 15 dias que outra sessão havia gravado duas horas antes em
`docs/specs/dados/gsc-baseline-2026-09-14`, para o Conteúdo 21. Restaurei com `git checkout` e nada
se perdeu.

**O buraco foi fechado no mesmo dia, no commit `58129099`.** O coletor compara o `meta.json` que já
está na pasta com a janela da rodada e para **antes de qualquer chamada de rede** quando elas
diferem. Reproduzi o meu próprio erro depois do fix: a rodada sem argumento recusa gravar sobre a
janela de 31/08 a 14/09, sai com código 1 e não toca na pasta. A regra pura é `conflitoDeJanela` em
`scripts/gsc-baseline.logic.mjs`, com teste, e está documentada em
[baseline-search-console.md](./baseline-search-console.md).

Ou seja, a rotina não depende mais de alguém lembrar de olhar o `git status`. Quem quer outra janela
passa `--inicio` e `--fim`; quem quer substituir de propósito passa `--force`.
