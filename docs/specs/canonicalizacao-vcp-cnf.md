# Mapa de canonicalização: Viracopos e Confins

**Status:** definido, revisado com o Diego e **aplicado em 28/08/2026**: os 11 redirects estão em
`BLOG_CONSOLIDATED_SLUGS`, os perdedores saíram de publicação e as sete donas passaram pela
revisão de conteúdo (as três de cabeça na atividade de consolidação; melhor, reserva, guia do
aeroporto e o genérico de reserva nesta rodada, com preço do motor de 28/08/2026).
**Atividade:** [Conteúdo 02, mapa de canonicalização](https://app.clickup.com/t/86ak6h4tz)
**Planilha:** uma linha por post do acervo inteiro, as quatro praças mais os aeroportos fora da
onda, em [`dados/mapa-canonicalizacao-blog.csv`](./dados/mapa-canonicalizacao-blog.csv)
**Depende de:** [canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md) (o molde e os
critérios), [baseline-search-console.md](./baseline-search-console.md),
[plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md)

## Como o vencedor foi escolhido

Mesmos critérios do mapa de GRU e CWB, com uma diferença a favor: este mapa já nasceu com o
baseline do Search Console congelado (27/08/2026), então a eleição usou clique, impressão e
posição reais de 16 meses, não só o rastro da migração.

1. **Rastro de tráfego.** Quem já recebe a consulta ganha.
2. **Slug que casa com o termo de cabeça**, como desempate.
3. **Profundidade e frescor**, por último.

Nenhuma vencedora de 15/08/2026 foi rebaixada. A única mudança sobre aquela rodada é de
classificação, explicada abaixo no cluster de preço.

## O trio de cabeça por aeroporto

### Viracopos (VCP)

| Cluster de cabeça | Página dona | Complemento |
| --- | --- | --- |
| preço, valor, diária | `/blog/estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica/` | `/precos/aeroporto-de-viracopos` |
| barato, economia, desconto | `/blog/como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024/` | `/estacionamento-mais-barato/aeroporto-de-viracopos` |
| proximidade, perto, onde deixar | `/blog/onde-deixar-o-carro-estacionado-em-viracopos/` | `/destinos/aeroporto-de-viracopos` |

**Por que a dona de preço é o guia, e não um post com "preço" no slug.** O Google já elegeu. No
baseline, quem recebe "estacionamento viracopos preço" (posição 6,0), "estacionamento aeroporto
viracopos preço" (9,4) e "valor estacionamento aeroporto viracopos" (6,3) é o guia, que soma 451
cliques em 16 meses, a página mais forte do blog em VCP. Os posts dedicados de preço aparecem
nessas mesmas consultas na posição 80 ou pior. Slug no critério 2 não vence rastro no critério 1.

**A reclassificação de `como-pagar-mais-barato-...-em-2024`.** Em 15/08 ela venceu o cluster que
na época se chamava "preço", e três slugs de preço apontam para ela. Com a régua de 26/08, que
separa preço de barato, o lugar dela é a dona de BARATO: as consultas que ela recebe de verdade
são "cupom de desconto virapark" e variações. Ela segue vencedora, só muda de cluster. Os três
slugs de preço que apontam para ela precisam ser **reapontados** para a dona de preço na execução
(estão marcados na planilha).

**O quase gêmeo que o acervo escondia.** `guia-completo-estacionamento-aeroporto-viracopos-2026-precos-seguranca-e-economia`
é o mesmo título da dona de preço com "2026" no meio, e só captura a variante "preço 2026" (15
consultas, 6 cliques). É absorvido pela dona, que herda o dado de 2026 na atualização da Fase 1.

### Confins (CNF)

| Cluster de cabeça | Página dona | Complemento |
| --- | --- | --- |
| preço, valor, diária | `/blog/preco-do-estacionamento-no-aeroporto-de-confins/` | `/estacionamentos/aeroporto-confins/precos` |
| barato, economia, desconto | `/blog/estacionamento-mais-barato-no-aeroporto-de-confins/` | `/estacionamentos/aeroporto-confins/mais-barato` |
| proximidade, perto, onde deixar | `/blog/guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins/` | `/destinos/aeroporto-de-confins` |

Os 3 posts herdados ficam. Não havia o que consolidar: o problema da praça era ausência, não
duplicata. As duas donas que faltavam foram escritas e publicadas em 05/09/2026, depois que o
cadastro do BePark (Conteúdo 01) destravou a tarifa da praça. O
`top-3-estacionamentos-do-aeroporto-de-confins` (209 cliques) deixa de acumular preço e barato e
volta a ser só a dona do **melhor**, que é a intenção do slug dele.

**Confins deixou de ser praça sem parceiro em 01/09/2026.** O BePark entrou como unidade listada,
com `checkout_mode = external`. A regra da praça muda junto: onde antes valia "nenhuma promessa de
reserva por falta de parceiro", agora vale o corte normal do ADR-009, que é o da unidade externa.
O post segue sem promessa de transação, porque post não declara capacidade, e o CTA aponta para
`/estacionamentos/aeroporto-confins`, onde `getLocationCapabilities` manda.

**A dona de proximidade foi reescrita em 08/09/2026** (Conteúdo 18). Ela abria pelo preço e tinha
"Quanto custa" como primeiro H2, ou seja, disputava a intenção da dona de preço recém-publicada. A
reescrita devolveu a página ao cluster dela: a frase-chave passou a ser "estacionamento perto do
aeroporto de Confins", os nove pátios saem ordenados por distância medida no PostGIS (ADR-001), e a
comparação de valores saiu do corpo, com link para a dona de preço. Dois fatos errados caíram
junto: o Central Park era chamado de vizinho mais próximo, quando o Park Confins está a 2,87 km
contra 2,96 km dele, e o Multipark aparecia a "poucas quadras", quando está a 9,13 km e é o mais
distante da lista.

**O analisador trava nessa página com um bloqueio que não tem conserto.** Ele exige a frase-chave
dentro do slug, e o slug carrega o typo abaixo. Nenhuma frase-chave de proximidade casa, porque
todas contêm "aeroporto". Ficou o termo de cabeça real, com a exceção registrada aqui, em vez de
uma frase-chave enfraquecida para agradar a métrica.

O slug da dona de proximidade carrega o typo "aeoroporto" desde o WordPress. Fica: slug publicado
nunca muda, e o histórico mora nele.

## As demais donas por intenção (VCP)

| Intenção | Página dona |
| --- | --- |
| melhor, comparativo | `quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024` (desde 15/08) |
| reserva, como funciona | `estacionamento-aeroporto-viracopos-como-reservar-antecipadamente-e-garantir-sua-vaga` |
| guia do aeroporto | `guia-completo-descubra-o-melhor-do-aeroporto-viracopos` |
| reserva genérica, sem praça | `como-reservar-um-estacionamento-com-pagamento-antecipado` |

O título da dona de reserva promete "garantir sua vaga", que o ADR-009 proíbe. O título muda na
revisão de conteúdo; o slug fica.

A dona de proximidade já recebe as consultas de setor ("bolsão f viracopos", "estacionamento f
viracopos"), o embrião do cluster de terminal e setor da Fase 4 em VCP, como o post do GRU
Airport é em Guarulhos.

## O que será redirecionado

11 posts novos saem de publicação e respondem 301 na dona, mais 3 reapontes sobre redirects que
já existem. Nada disso está aplicado: o mapa é a decisão, a execução é a atividade de consolidação
de VCP e CNF.

### Viracopos, 11 posts novos

| Perdedor | Vencedor | Cluster |
| --- | --- | --- |
| `guia-completo-estacionamento-aeroporto-viracopos-2026-precos-seguranca-e-economia` | guia VCP (dona de preço) | preço |
| `qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-viracopos-2024` | guia VCP (dona de preço) | preço |
| `qual-e-o-valor-da-diaria-estacionamento-aeroporto-viracopos` | guia VCP (dona de preço) | preço |
| `onde-estacionar-proximo-ao-aeroporto-de-viracopos` | `onde-deixar-o-carro-estacionado-em-viracopos` | proximidade |
| `estacionamento-vcp-onde-deixar-o-carro-em-viracopos-sem-dor-de-cabeca` | `onde-deixar-o-carro-estacionado-em-viracopos` | proximidade |
| `onde-estacionar-meu-carro-em-aeroporto-viracopos-em-2024` | `onde-deixar-o-carro-estacionado-em-viracopos` | proximidade |
| `garanta-desconto-no-estacionamento-do-aeroporto-viracopos-com-a-movepark` | `como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024` | barato |
| `como-pagar-menos-no-estacionamento-do-aeroporto-campinas` | `como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024` | barato |
| `por-que-o-virapark-se-destaca-como-melhor-estacionamento-do-aeroporto-campinas` | `quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024` | comparativo |
| `como-reservar-vaga-no-estacionamento-do-aeroporto-de-viracopos` | `estacionamento-aeroporto-viracopos-como-reservar-antecipadamente-e-garantir-sua-vaga` | reserva |
| `viracopos-para-iniciantes-guia-para-uma-viagem-tranquila-e-sem-estresse` | `guia-completo-descubra-o-melhor-do-aeroporto-viracopos` | guia do aeroporto |

### Viracopos, 3 reapontes

Os três estavam em `BLOG_CONSOLIDATED_SLUGS` desde 15/08 apontando para a vencedora da época, que
agora é a dona de barato. A intenção deles é preço, então o alvo mudou para a dona de preço
(**executado em 28/08/2026**, junto com as inversões de CWB da revisão cruzada):

`preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui` ·
`quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias` ·
`quanto-custa-para-estacionar-no-aeroporto-viracopos`

### Ajustes feitos na aplicação

Duas donas trocaram de título na revisão de conteúdo, com o slug intacto: a de melhor virou
"Melhores estacionamentos do Aeroporto Viracopos em 2026" (reescrita answer-first, sem concorrente
citado e sem link pra quem vende vaga) e a de reserva virou "Como reservar estacionamento no
Aeroporto Viracopos", tirando a promessa "garantir sua vaga" do título, como o ADR-009 manda. O
guia do aeroporto e o post genérico de reserva perderam travessão, promessa e link de parceiro.

### O resultado em número

| Praça | Publicados antes | Publicados depois | Redirecionados |
| --- | --- | --- | --- |
| Viracopos | 18 | 7 | 11 novos, 8 desde 15/08 |
| Confins | 3 | 3 | 0 |

## O que a execução precisa cobrir além do 301

Herdado do molde de GRU e CWB, para a atividade de consolidação:

1. **Revisão de conteúdo das donas** antes de concentrar tráfego nelas: preço com data e fonte do
   motor, concorrente e link de quem vende vaga removidos, promessa de transação reescrita como
   fato da unidade, travessão zerado.
2. **Expansão das donas ao padrão**, com parágrafo que responde pergunta nova, não enchimento. O
   molde por bloco está no mapa de GRU e CWB.
3. **Cadeia de redirect num salto só**: URL legada da raiz que apontava para post absorvido
   resolve direto na dona final via `resolveConsolidado`.
4. **Reverter** = republicar no banco e tirar a entrada do mapa, sempre os dois juntos.
