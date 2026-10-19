# Rotina mensal de frescor das páginas de cabeça

**Status:** primeira rodada executada em 17/09/2026; rodada extra em 19/10/2026, puxada pela virada de fim de ano de GRU e CGH
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
  tabela pré-renderizada.

## O procedimento, para a próxima rodada

1. `select d.short_name, f.* from destination d cross join lateral public.destination_price_freshness(d.slug) f ...`
   e liste as praças que revisaram tabela desde a última rodada.
2. Para cada praça que revisou, liste os posts que citam R$ e as datas que eles citam
   (`regexp_matches` sobre `body_md` resolve), e corrija os que ficaram para trás.
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
