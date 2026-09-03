# Hashtags: banco e regra

## A regra em uma linha

**De 3 a 5 por post, uma de cada camada, marca por último, sempre na legenda.**

O limite duro do Instagram é 30, mas o próprio Instagram recomenda de 3 a 5
desde que a busca por texto passou a valer mais que a etiqueta. Bloco de 30 lê
como spam e derruba a entrega. O limite de 30 conta hashtags da legenda **e** do
primeiro comentário somadas, então esconder no comentário não contorna nada, só
tira o texto do trecho que o Google indexa.

## As três camadas

| Camada | Função | Quantas |
|---|---|---|
| **Praça** | Amarra o post ao aeroporto ou à cidade. É onde mora a intenção de viagem | 1 a 2 |
| **Intenção** | O problema que a pessoa está resolvendo | 1 a 2 |
| **Marca** | Acervo próprio, sempre a última da lista | 1 (`#movepark`) |

Combinação típica: `#aeroportodeguarulhos #estacionamentoaeroporto #movepark`

## Banco por praça

O JSON legível por máquina fica em
[`../scripts/hashtags.json`](../scripts/hashtags.json), e é ele que o analisador
consulta.

| Aeroporto | Hashtags de praça |
|---|---|
| Guarulhos (GRU) | `#aeroportodeguarulhos` `#gru` `#aeroportogru` `#guarulhos` |
| Viracopos (VCP) | `#viracopos` `#aeroportodeviracopos` `#campinas` `#vcp` |
| Confins (CNF) | `#confins` `#aeroportodeconfins` `#belohorizonte` `#cnf` |
| Congonhas (CGH) | `#congonhas` `#aeroportodecongonhas` `#saopaulo` |
| Afonso Pena (CWB) | `#afonsopena` `#aeroportodecuritiba` `#curitiba` |
| Navegantes (NVT) | `#navegantes` `#aeroportodenavegantes` `#balneariocamboriu` |
| Humberto Delgado (LIS) | `#aeroportodelisboa` `#lisboa` `#portugal` |

## Banco por intenção

| Tema | Hashtags |
|---|---|
| Estacionamento | `#estacionamentoaeroporto` `#estacionamento` `#vagacoberta` |
| Viagem | `#dicasdeviagem` `#viagemdecarro` `#viajarbarato` `#planejandoaviagem` |
| Economia | `#economianaviagem` `#dicadeeconomia` |
| Serviço | `#traslado` `#valet` `#reservaonline` |

## Proibidas

| Hashtag | Motivo |
|---|---|
| `#estacionamentobarato` e variações de preço absoluto | Vira promessa de preço que o post não sustenta, e o preço varia por lote e por data |
| `#vagagarantida`, `#cancelamentogratis` | Promessa de transação. **ADR-009**: a capacidade mora na unidade |
| Qualquer `#` com nome de concorrente | Entrega audiência e associa a marca ao rival na busca |
| `#follow4follow`, `#likeforlike` e similares | Sinal de engajamento artificial, penaliza a conta |
| Hashtags genéricas de altíssimo volume (`#viagem`, `#brasil`) sozinhas | Volume sem intenção. Só entram acompanhando uma de praça |

## Como escolher quando a praça é nova

1. Busque o termo dentro do Instagram e veja o volume de publicações.
2. Prefira a de volume médio: a gigante enterra o post em minutos, a de 200
   publicações não tem público.
3. Confira as três primeiras telas de resultado. Se o conteúdo de lá não tem
   nada a ver com viagem, a hashtag está sequestrada por outro assunto.
4. Registre a decisão no `hashtags.json` para o próximo post não refazer a
   pesquisa.
