# Pipeline da FAQ retrofitada (25/08/2026)

O que gerou e validou a FAQ dos 84 posts do acervo que ainda não emitiam `FAQPage`.
Fica aqui como referência do método, e para refazer a checagem se alguém editar os blocos.

| Arquivo | O que é |
|---|---|
| `faq-*.json` | As 422 perguntas escritas, por post, com o sub-ângulo de cada um |
| `aplicar.mjs` | Escreve o bloco em `public/blog/<slug>.md` e emite o SQL do banco |
| `faq-canonicas.txt` | As perguntas que já têm página em `/faq/<slug>`, usadas na checagem de colisão |

## O que o validador bloqueia

Roda com `node aplicar.mjs <caminho-do-repo> faq-*.json` e sai com código 1 em qualquer destes:

- pergunta que não termina em `?`, que o extrator de produção ignoraria
- travessão ou traço em qualquer lugar do bloco (regra de marca do projeto)
- promessa de transação: vaga garantida, cancelamento grátis, preço fixo e afins (ADR-009)
- valor em R$ sem data de referência na mesma resposta
- pergunta repetida dentro do mesmo aeroporto, que reintroduziria canibalização
- colisão semântica com o catálogo de `/faq/<slug>`, por Jaccard acima de 0,6
- post com menos de 5 perguntas, ou `.md` que já tenha bloco de FAQ

Avisa, sem bloquear, quando a resposta foge da faixa de 35 a 70 palavras.

## A prova que fecha o ciclo

O validador confere o formato; quem confere o resultado é o extrator de produção. O teste que
rodou no lote leu cada `.md` gravado, chamou `faqPairsFrom` e comparou pergunta a pergunta com o
JSON de origem. Resultado em 25/08/2026: **84 posts, 422 perguntas, todas extraídas com a resposta
idêntica**. É esse casamento que garante que o `text` do `Answer` bate com o visível (ADR-002).

## De onde vieram os números

Preço e balcão saíram de `destination_price_index()`, distância de `st_distance` entre a unidade e
o destino, e traslado, horário e piso de permanência das colunas da `location`. Nos aeroportos sem
parceiro (Confins, Navegantes, Recife) nenhuma tarifa foi publicada, porque não existe número
verificável: a FAQ ali trata de lotes mapeados, distâncias e do que perguntar ao pátio.
