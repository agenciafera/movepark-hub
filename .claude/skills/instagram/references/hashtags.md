# Hashtags: banco e regra

## Onde mora a regra

A regra (de 3 a 5 por post) e as três camadas estão no
[`SKILL.md`](../SKILL.md), Passo 5. **Aqui mora o banco**: quais hashtags existem
por praça e por tema, quais estão proibidas e como escolher uma praça nova.

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
