# A cabeça no Search Console depois da consolidação

**Status:** medido em 17/09/2026, três semanas depois dos 301
**Atividade:** Conteúdo 21 do plano de conteúdo ([86ak6h8uu](https://app.clickup.com/t/86ak6h8uu))
**Código:** [`scripts/gsc-comparar.mjs`](../../scripts/gsc-comparar.mjs) · lógica em [`gsc-comparar.logic.mjs`](../../scripts/gsc-comparar.logic.mjs) · teste em [`gsc-comparar.test.mjs`](../../scripts/gsc-comparar.test.mjs)
**Depende de:** [baseline-search-console.md](./baseline-search-console.md), [canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md), [canonicalizacao-vcp-cnf.md](./canonicalizacao-vcp-cnf.md)

## O que foi medido, e por que nestas janelas

A consolidação mandou 59 slugs para 301 em 27 e 28/08/2026. A pergunta desta medição é uma só:
**o sinal concentrou numa URL, em vez de continuar espalhado por trinta?**

O baseline congelado do Conteúdo 03 cobre 16 meses, e é ele que serve para a leitura de 90 dias.
Para três semanas ele não serve: 15 dias de dado novo dentro de 16 meses de histórico mudam a
média em quase nada. Por isso a comparação usa **duas janelas iguais de 15 dias**, uma de cada
lado do corte:

| Janela | Período | O que ela pega |
| --- | --- | --- |
| Antes | 12/08 a 26/08/2026 | os 15 dias que terminam na véspera do primeiro 301 |
| Depois | 31/08 a 14/09/2026 | 15 dias começando 3 dias depois do último 301, para o Google ter começado a reprocessar |

As duas coletas estão versionadas em [`dados/gsc-baseline-2026-08-26/`](./dados/gsc-baseline-2026-08-26/RESUMO.md)
e [`dados/gsc-baseline-2026-09-14/`](./dados/gsc-baseline-2026-09-14/RESUMO.md), e a comparação
se refaz com um comando:

```bash
bun run seo:gsc-comparar -- --antes 2026-08-26 --depois 2026-09-14
```

## Os 12 clusters de cabeça

Posição menor é melhor, então o delta de posição vem como antes menos depois: **positivo quer
dizer que subiu**.

| Praça | Cluster | Impressões antes | Impressões depois | Δ impressões | Posição antes | Posição depois | Δ posição |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GRU | proximidade | 990 | 743 | -247 | 43,8 | 51,7 | -7,9 |
| GRU | barato | 147 | 196 | +49 | 48,7 | 38,4 | +10,3 |
| GRU | preco | 1.749 | 2.119 | +370 | 44,1 | 39,9 | +4,2 |
| VCP | proximidade | 623 | 1.114 | +491 | 17,8 | 12,8 | +5,0 |
| VCP | barato | 148 | 161 | +13 | 14,3 | 13,1 | +1,3 |
| VCP | preco | 705 | 802 | +97 | 17,4 | 17,1 | +0,3 |
| CNF | proximidade | 133 | 366 | +233 | 21,3 | 12,2 | +9,1 |
| CNF | barato | 40 | 128 | +88 | 11,1 | 9,4 | +1,7 |
| CNF | preco | 209 | 409 | +200 | 20,0 | 14,3 | +5,7 |
| CWB | proximidade | 74 | 327 | +253 | 8,4 | 8,9 | -0,5 |
| CWB | barato | 71 | 105 | +34 | 9,0 | 11,9 | -2,9 |
| CWB | preco | 391 | 580 | +189 | 12,5 | 12,1 | +0,4 |

**Onze das 12 células ganharam impressão**, e o total das 12 vai de 5.280 para 7.050, mais 34%.
Dez das 12 subiram de posição. A atividade previa que consolidação costuma piorar antes de
melhorar; em três semanas o quadro já veio no outro sentido.

## A concentração, que é o sinal que interessa

| Janela | Impressões nas donas | Impressões nos slugs redirecionados | Cliques nas donas |
| --- | ---: | ---: | ---: |
| Antes | 12.649 | 8.288 | 74 |
| Depois | 19.660 | 3.222 | 64 |

As donas ganharam 55% de impressão enquanto os 59 perdedores caíram 61%. É exatamente a troca
que a consolidação promete: o mesmo assunto deixa de ser servido por meia dúzia de URLs irmãs e
passa a ser servido pela dona.

Os perdedores ainda aparecem, e isso é esperado. Um 301 leva semanas para ser reprocessado, e o
que importa na janela curta é a direção, não o zero.

**Os cliques caíram de 74 para 64, e o número não assusta nesta janela.** São 15 dias de um site
com menos de mil cliques no período; a variação cabe no ruído, e a leitura de clique fica para os
90 dias, com o baseline de 16 meses.

## As duas células que perderam posição

A atividade mandou investigar antes de seguir para a Fase 2. As duas foram investigadas, e
**nenhuma das duas é a dona perdendo terreno**.

### GRU · proximidade: a dona subiu, quem caiu foi uma consulta na página de destino

A dona do cluster (`estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes`) foi de 93
para 109 impressões e passou a aparecer para 100 consultas, contra 71 antes. Ela cresceu.

A média da célula piorou por causa de uma consulta só. Em "estacionamento perto do aeroporto de
guarulhos", a página `/estacionamentos/aeroporto-guarulhos` tinha **227 impressões na posição
12,8** e passou a ter **13 impressões na posição 48,9**. Como a média é ponderada por impressão,
essa única linha levava a faixa 11-20 inteira da célula, que foi de 277 impressões para zero.

A causa está no catálogo, não no blog. E a própria página de destino melhorou no agregado, de 1.898
impressões na posição 43,4 para 3.502 na posição 15,8, com os cliques indo de 2 para 10. O que
aconteceu foi a troca de slug das fichas no fim de agosto (`aeropark-guarulhos` virou `aeropark`),
que o Google ainda está reprocessando: as duas formas aparecem no recorte, a antiga com 301.

**Ação:** nenhuma. Reavaliar na leitura de 90 dias, quando a família de URL nova estiver assentada.

### CWB · barato: a intenção mudou de página, como o plano previa

A posição foi de 9,0 para 11,9, com impressão subindo de 71 para 105. Quem responde pelo cluster
mudou: antes eram o post TOP 3, a página de destino e uma FAQ; agora são
`/estacionamentos/aeroporto-curitiba/mais-barato` e as fichas das duas unidades.

Isso é o desenho da Fase 1 acontecendo. A página programática de "mais barato" é a dona do termo
transacional por decisão do mapa de canonicalização, e ela entrou no lugar de páginas que
disputavam a mesma consulta. A posição média piorou porque o conjunto de URLs mudou, não porque
uma página caiu.

**Ação:** nenhuma.

## Os 301 estão sendo seguidos

Os 59 slugs do `BLOG_CONSOLIDATED_SLUGS` foram consultados em produção, um a um:

**59 de 59 respondem 301 num salto só, e o destino responde 200.** Nenhuma cadeia, nenhum
redirect para página morta.

## 404: o que existe, e o que não é novo

Todas as 888 URLs do domínio com impressão na janela de depois foram consultadas em produção:
696 respondem 200, 182 respondem 301 e **10 respondem 404**. Nenhuma delas é dona de cluster,
e nenhuma delas veio da consolidação.

| URL que responde 404 | Impressões | O que é |
| --- | ---: | --- |
| `/estacionamentos/campinas/virapark-estacionamento-viracopos` | 12 | URL legada real, já 404 antes da consolidação (17 impressões na janela de antes) |
| `/estacionamentos/aeroporto-porto/flypark` | 8 | unidade de Portugal que saiu do ar |
| `/estacionamentos/aeroporto-faro/park-and-travel` | 2 | idem |
| `/estacionamentos/aeroporto-faro/park-and-fly` | 1 | idem |
| `/estacionamento-aeroporto-recife/foco-park` | 1 | família de URL anterior à migração |
| 5 slugs de blog inventados | 1 cada | ver abaixo |

**Os cinco slugs de blog não existem e nunca existiram.** São variações de uma letra dos slugs
reais (`preco-do-estacionamento-no-confins` contra o real
`preco-do-estacionamento-no-aeroporto-de-confins`, e assim por diante). Não estão no banco, nem
como post apagado; não estão no sitemap; nenhum post ou FAQ linka para eles; não aparecem em
arquivo nenhum do repositório. Cada um tem **uma impressão na posição 1,00**, que é a assinatura
de alguém procurando a URL exata, não de descoberta orgânica. Não entram em mapa de redirect:
criar 301 para slug que ninguém publicou é engordar o contrato de URL com endereço que só existe
no chute de quem digitou.

**Ficha de unidade que saiu do ar responder 404 é o comportamento decidido** (commit `40b51ac5`),
então Porto, Faro e Recife estão certos.

**Sobra um defeito de verdade, e ele é do worker.** O apelido de destino funciona sozinho
(`/estacionamentos/campinas` responde 200) e o slug legado de unidade funciona sob o destino
canônico (`/estacionamentos/aeroporto-viracopos/virapark-estacionamento-viracopos` responde 301).
A combinação dos dois é que falha: `/estacionamentos/campinas/virapark-estacionamento-viracopos`
e `/estacionamentos/campinas/virapark` respondem 404. É uma URL com histórico, aparecendo há
meses na posição 85, e vale um 301. Não foi corrigido aqui porque é mudança no contrato de URL,
com teste próprio, e a atividade é de medição.

## A decisão

**A Fase 2 está liberada.** A consolidação fez o que prometia: as donas concentraram impressão,
os redirecionados encolheram, o total da cabeça subiu 34% e as duas quedas de posição têm causa
conhecida e fora do blog.

O que fica de dívida, em ordem de tamanho:

1. **O 404 de `/estacionamentos/<apelido>/<slug legado>`**, descrito acima.
2. **A leitura de 90 dias**, que é a que vale para clique e para posição absoluta. Roda o coletor
   com a janela cheia e compara contra `dados/gsc-baseline-2026-08-24/`, que é o marco zero.
3. **A família de URL das fichas** ainda está assentando depois da troca de slug de agosto, e é o
   que explica a única célula que perdeu posição de verdade.
