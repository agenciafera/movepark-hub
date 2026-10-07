# Monitoramento de posição: 59 termos no Google Brasil

> **Status:** ativo desde 07/10/2026 (Conteúdo 62).
> **Relacionadas:**
> - [plano-autoridade-backlinks.md](./plano-autoridade-backlinks.md): seção 5.1 (a tarefa) e seção 6 (a meta "termos monitorados no top 10").
> - [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md): as 12 consultas do placar de citação em IA e os clusters de cabeça.
> - [ataque-cnf-bepark.md](./ataque-cnf-bepark.md): as cabeças de Confins.
> - [baseline-search-console.md](./baseline-search-console.md): o coletor de onde este saiu, com a mesma credencial.

## 1. Por que no Search Console e não no Semrush

A tarefa pedia cerca de 60 termos no Position Tracking do Semrush. A conta é do plano gratuito
(decisão de 05/10/2026, seção 2.6 da spec de backlinks), e o Position Tracking gratuito acompanha
**no máximo 10 termos**. Os 60 não cabem lá.

A posição vem então do Search Console, pelo `bun run seo:posicao`
([`scripts/gsc-posicao.mjs`](../../scripts/gsc-posicao.mjs)). É dado real de quem buscou, filtrado
para o Brasil e separado em celular e computador, e custa zero.

A diferença para um rastreador de SERP precisa ficar clara na leitura:

- **É média, não retrato.** O GSC dá a posição média nas buscas em que o site apareceu na janela,
  e não a posição numa busca feita num dia. Personalização e localização entram na média.
- **Sem impressão, sem posição.** Se ninguém viu o site para aquele termo, o GSC não diz em que
  posição ele está; na prática, está fora das primeiras páginas.
- **Termo raro some.** O GSC esconde consulta de volume muito baixo. Ver a seção 4.

## 2. Os termos

A lista vive em `TERMOS`, em [`scripts/gsc-posicao.logic.mjs`](../../scripts/gsc-posicao.logic.mjs).
Trocar termo é mudar a lista e anotar aqui o motivo; o teste reprova termo repetido.

| Grupo | Termos | Conta na meta | De onde vieram |
| --- | ---: | --- | --- |
| Guarulhos (GRU) | 15 | sim | 3 do placar + cabeça e os clusters proximidade, barato e preço |
| Viracopos (VCP) | 14 | sim | 3 do placar + cabeça e os três clusters |
| Confins (CNF) | 16 | sim | 3 do placar + 8 cabeças do Ataque CNF (preço, melhor, desconto Azul, as consultas da seção 2.1) + cabeça e clusters |
| Afonso Pena (CWB) | 14 | sim | 3 do placar + cabeça e os três clusters |
| Congonhas (CGH) | 3 | não | controle: fica fora da compra de link (seção 7 da spec de backlinks) |
| Marca de parceiro | 9 | não | virapark, ponce park, urban park e bepark, com variações |

**Meta: 59 termos.** As 12 consultas do placar estão com o texto exato da planilha. Os termos de
cluster são os de maior impressão de cada aeroporto no baseline de 14/09/2026, um ou dois por
variação de escrita.

Marca de parceiro mede a ficha do parceiro, não o plano: fica medida e fora da conta. Congonhas
é medida para a revisão separar o que o link comprado fez do que conteúdo e sazonalidade fazem
sozinhos.

## 3. As regras de cálculo

- **Janela:** 28 dias de dado final, terminando 3 dias antes da rodada. Uma semana deixaria metade
  da lista sem impressão.
- **Casamento:** igualdade depois de tirar acento e caixa. "próximo" e "proximo" somam no mesmo
  termo; "estacionamento próximo aeroporto guarulhos 24 horas" **não** soma, porque a cauda longa
  puxaria a posição para longe da do termo de cabeça.
- **Posição:** média ponderada por impressão, por dispositivo e no total.
- **Top 10:** posição geral até 10 **e** pelo menos 10 impressões na janela. Termo abaixo disso
  sai como "menos de 10 impressões": na primeira rodada, uma busca de Confins com 1 impressão na
  posição 10 entraria na meta sem que ninguém tivesse visto o site ali.

## 4. O que o Search Console não enxerga, e onde entram as 10 vagas do Semrush

Na primeira rodada, **9 das 12 consultas do placar não tiveram impressão nenhuma**. São perguntas
longas e conversacionais ("quanto custa estacionar em viracopos"), o jeito de perguntar a uma IA,
com volume baixo demais para o GSC mostrar. A elas soma-se "estacionamento aeroporto confins
desconto azul", que ainda não tem página. São exatamente 10 termos.

Um rastreador de SERP mede a posição mesmo sem impressão, então **as 10 vagas do Semrush
gratuito devem ir para esses 10**, no lugar dos 9 de hoje (que eram em boa parte marca de
parceiro, agora medida pelo GSC):

1. qual o estacionamento mais barato no aeroporto de guarulhos
2. quanto custa estacionar em viracopos
3. qual o estacionamento mais barato em viracopos
4. estacionamento mais próximo de viracopos
5. quanto custa estacionar em confins
6. qual o estacionamento mais barato em confins
7. estacionamento aeroporto confins desconto azul
8. quanto custa estacionar no aeroporto afonso pena
9. qual o estacionamento mais barato no afonso pena
10. estacionamento mais próximo do afonso pena

A troca é manual, no projeto `movepark.co` do Semrush (Position Tracking, Google, Brasil). Quando
um desses passar a ter impressão no GSC, ele já está medido aqui e a vaga pode ir para outro.

## 5. Rodada e leitura

```bash
bun run seo:posicao
```

Grava `docs/specs/dados/gsc-posicao-<fim>/` com `termos.csv`, `meta.json` e `RESUMO.md`, que é o
que se abre na revisão: o placar "X de 59 no top 10", a tabela por aeroporto (Guarulhos ao lado
de Viracopos) e o delta de posição contra a rodada anterior. Comite a pasta.

**Quando rodar:** junto das revisões da spec de backlinks, de 30 dias (Conteúdo 73) e de 90 dias
(Conteúdo 74), e do Ataque CNF (Conteúdo 58 e 59). Entre elas, uma rodada por mês basta: a janela
já é de 28 dias.

## 6. Marco zero: 04/10/2026

Janela de 07/09 a 04/10/2026, em
[`dados/gsc-posicao-2026-10-04/`](./dados/gsc-posicao-2026-10-04/RESUMO.md).

**Termos da meta no top 10: 9 de 59** (12 com menos de 10 impressões).

| Grupo | No top 10 | Leitura |
| --- | --- | --- |
| Guarulhos | 0 de 15 | Tudo entre 18 e 51 na média. No celular, os termos de "barato" ficam em 8 a 10; o computador puxa para baixo (32 a 49) |
| Viracopos | 4 de 14 | "estacionamento viracopos" na posição 9,7 com 3,6 mil impressões; preço e proximidade entre 17 e 29 |
| Confins | 3 de 16 | Quase tudo entre 9 e 12: a fronteira da primeira página, onde o Ataque CNF atua |
| Afonso Pena | 2 de 14 | As cabeças ficam em 10,8 e 11,9, a um passo do top 10 |
| Congonhas (controle) | 0 de 3 | 11,6 na cabeça |
| Marca de parceiro | 9 de 9 | Todas entre 3,9 e 8,5 |

O padrão que mais pesa: **no celular a Movepark já está perto da primeira página em quase todos
os aeroportos; no computador, cai 15 a 35 posições** em preço e proximidade de Guarulhos e
Viracopos.
