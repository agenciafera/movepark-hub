# Mapa de canonicalização: Guarulhos e Afonso Pena

**Status:** aplicado em 27/08/2026
**Atividade:** [Revisar e consolidar blog posts, Guarulhos e Afonso Pena](https://app.clickup.com/t/86ak6q0fh)
**Código:** `BLOG_CONSOLIDATED_SLUGS` em [`src/worker.ts`](../../src/worker.ts) · contrato em [`src/blog-urls.contract.test.ts`](../../src/blog-urls.contract.test.ts)
**Depende de:** [blog.md](./blog.md), [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md)

## Por que existe

A reunião de pauta de 26/08/2026 fechou a regra de estrutura do acervo: **uma página canônica
por termo e três páginas canônicas por aeroporto**, com os posts duplicados redirecionados para
a dona da intenção. Guarulhos e Afonso Pena são as praças do Diego, e eram as mais tortas do
acervo: 26 posts publicados disputando as mesmas consultas em GRU, 10 em CWB.

A consolidação de 15/08/2026 já tinha fundido dois clusters por aeroporto (melhor e preço) e
tirado 26 posts do ar. Esta rodada fecha as duas praças inteiras. O motivo é o mesmo de sempre:
o Google não elege vencedor entre páginas irmãs, então o sinal se divide e nenhuma ranqueia.

## Como o vencedor foi escolhido

Sem inventar critério novo, porque não há dado novo. O Search Console ainda não tem baseline
coletado (o coletor existe, falta credencial, ver [baseline-search-console.md](./baseline-search-console.md)),
então **as eleições de 15/08/2026, que foram feitas por cliques, foram preservadas**: nenhum
vencedor daquela rodada foi rebaixado. Para os clusters sem vencedor eleito, a ordem de critério
foi:

1. **Rastro de tráfego herdado.** Post que é alvo de redirect legado da tabela `ko1_redirects`
   com volume alto ganha. Foi o que elegeu `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes`,
   destino de 1.152 mais 359 acessos registrados na migração.
2. **Slug que casa com o termo de cabeça.** `como-estacionar-barato-no-aeroporto-de-guarulhos` e
   `estacionamento-barato-aeroporto-curitiba` ganharam por isso.
3. **Profundidade e frescor**, como desempate.

Post mais novo não ganha por ser mais novo. Dois dos posts de 2025 foram redirecionados
justamente porque eram peça promocional com preço inventado, e o histórico de URL vale mais que
a data de publicação.

## O trio de cabeça por aeroporto

A dona de cada cluster de cabeça, na ordem do plano de conteúdo.

### Guarulhos (GRU)

| Cluster de cabeça | Página dona | Complemento |
| --- | --- | --- |
| preço, valor, diária | `/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/` | `/precos/aeroporto-internacional-de-sao-paulo-guarulhos` |
| barato, economia, desconto | `/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/` | `/estacionamento-mais-barato/aeroporto-internacional-de-sao-paulo-guarulhos` |
| proximidade, perto, onde deixar | `/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/` | `/destinos/aeroporto-internacional-de-sao-paulo-guarulhos` |

### Afonso Pena (CWB)

| Cluster de cabeça | Página dona | Complemento |
| --- | --- | --- |
| preço, valor, diária | `/blog/quanto-custa-um-estacionamento-do-aeroporto-afonso-pena/` | `/precos/aeroporto-afonso-pena` |
| barato, economia, desconto | `/blog/estacionamento-barato-aeroporto-curitiba/` | `/estacionamento-mais-barato/aeroporto-afonso-pena` |
| proximidade, perto, mais próximo | `/blog/conheca-o-estacionamento-mais-proximo-do-aeroporto-afonso-pena-em-2024/` | `/destinos/aeroporto-afonso-pena` |

**Por que o cluster "barato" tem post dono e não só a página programática.** O plano previa
`/estacionamento-mais-barato/<slug>` como dona única. Ela continua sendo a dona do termo
"estacionamento mais barato", que é o termo transacional, e é para ela que o post âncora aponta.
O post ficou com a intenção informacional vizinha ("como economizar", "desconto", "vale a pena"),
que é onde o histórico de URL mora. Mandar um post com cliques direto para uma página
programática jogaria fora relevância contextual sem ganhar nada: as duas páginas se apoiam.

## As demais donas por intenção

Não são cabeça, mas cada uma é dona de um termo, e por isso sobreviveram.

| Intenção | Página dona | Aeroporto |
| --- | --- | --- |
| melhor, comparativo | `guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024` | GRU |
| melhor, comparativo | `aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024` | CWB |
| marca do aeroporto, oficial, terminal | `estacionamento-gru-airport-guia-completo-para-parar-seu-carro-com-tranquilidade` | GRU |
| guia do aeroporto, não é consulta de estacionamento | `guia-completo-sobre-o-aeroporto-de-guarulhos` | GRU |
| guia do aeroporto | `aeroporto-afonso-pena-confira-o-guia-completo-para-sua-viagem` | CWB |
| segurança e prova social | `estacionamento-aeroporto-guarulhos-seguranca-do-seu-veiculo-e-prioridade` | GRU |
| vaga coberta | `aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas` | GRU |
| institucional, case de parceiro | `case-de-sucesso-aeroparking-movepark` | GRU |

O post do GRU Airport é o candidato natural a hospedar o cluster de terminal e setor da Fase 4:
são 61 termos só em Guarulhos, e é ele que já fala a língua de terminal e de estacionamento
oficial.

## O que foi redirecionado

22 posts saíram de publicação e respondem 301 direto na dona, num salto só, nas duas formas de
URL. Todos os 22 são slugs do fixture congelado de 93 URLs do WordPress, ou seja, todos carregam
histórico.

### Guarulhos, 17 posts

| Perdedor | Vencedor | Cluster |
| --- | --- | --- |
| `qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-guarulhos` | `preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui` | preço |
| `qual-e-o-valor-da-diaria-estacionamento-aeroporto-guarulhos` | `preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui` | preço |
| `as-melhores-estrategias-para-economizar-no-estacionamento-do-aeroporto-de-guarulhos` | `como-estacionar-barato-no-aeroporto-de-guarulhos` | barato |
| `estacionamento-com-desconto-perto-aeroporto-guarulhos` | `como-estacionar-barato-no-aeroporto-de-guarulhos` | barato |
| `estacionamento-aeroporto-guarulhos-gru-economia-recorde-seguranca-e-translado-gratuito-com-a-move-park` | `como-estacionar-barato-no-aeroporto-de-guarulhos` | barato |
| `conheca-o-estacionamento-mais-proximo-do-aeroporto-guarulhos-em-2024-2` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `dicas-de-viagem-encontre-o-estacionamento-perfeito-perto-do-aeroporto-de-guarulhos-com-o-movepark` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `onde-deixar-meu-carro-em-aeroporto-guarulhos` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `onde-estacionar-o-carro-no-aeroporto-de-guarulhos` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos` | `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | proximidade |
| `conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023` | `guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024` | comparativo |
| `vantagens-de-reservar-seu-estacionamento-proximo-ao-gru-airport-com-a-movepark` | `guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024` | comparativo |
| `como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos` | `estacionamento-aeroporto-guarulhos-seguranca-do-seu-veiculo-e-prioridade` | segurança |
| `5-dicas-para-transformar-sua-escala-no-aeroporto-guarulhos-em-uma-aventura-inesquecivel` | `guia-completo-sobre-o-aeroporto-de-guarulhos` | guia do aeroporto |
| `seu-guia-definitivo-para-uma-partida-descomplicada-dicas-valiosas-do-aeroporto-de-guarulhos` | `guia-completo-sobre-o-aeroporto-de-guarulhos` | guia do aeroporto |
| `os-beneficios-de-ir-de-carro-para-o-aeroporto-de-guarulhos-em-2024` | `guia-completo-sobre-o-aeroporto-de-guarulhos` | guia do aeroporto |

### Afonso Pena, 5 posts

| Perdedor | Vencedor | Cluster |
| --- | --- | --- |
| `estacionamento-aeroporto-curitiba-cwb-a-solucao-economica-e-segura-com-a-move-park` | `estacionamento-barato-aeroporto-curitiba` | barato |
| `5-maneiras-inteligentes-de-economizar-no-aeroporto-afonso-pena` | `estacionamento-barato-aeroporto-curitiba` | barato |
| `estacionamento-aeroporto-curitiba-alternativas-economicas-e-servicos-de-transporte` | `estacionamento-barato-aeroporto-curitiba` | barato |
| `5-vantagens-de-estacionar-no-aeroporto-de-curitiba` | `aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024` | comparativo |
| `facilidade-e-conforto-estacionamento-aeroporto-curitiba-cwb` | `aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024` | comparativo |

### O resultado em número

| Praça | Publicados antes | Publicados depois | Redirecionados |
| --- | --- | --- | --- |
| Guarulhos | 26 | 9 | 17 |
| Afonso Pena | 10 | 5 | 5 |

## A cadeia de redirect que foi fechada junto

URL legada da raiz do domínio que aponta para post depois consolidado gastava dois 301: um para
o post, outro para o vencedor. Eram oito casos, quatro deles anteriores a esta rodada. O
`resolveConsolidado` em [`src/worker.ts`](../../src/worker.ts) resolve o destino final antes de
responder, então o salto é único. Travado por teste no contrato de URL.

## O que a revisão de conteúdo corrigiu

Consolidar sem revisar teria concentrado tráfego em página errada. As donas carregavam defeito
de fato, não de estilo:

| Defeito | Onde estava | O que foi feito |
| --- | --- | --- |
| Tabela de preço inventada, com lote que não existe no sistema | 5 posts, incluindo Ponce Park a R$ 15,29 e Nation Park a R$ 9,90 | Substituída pela tabela do motor de reservas, com a data da consulta |
| Preço do corpo contradizendo a FAQ do próprio post | 4 posts | Corpo alinhado ao mesmo dado da FAQ |
| Concorrente recomendado por nome | 6 posts, com Indigo, Estapar, Urban Park, Best Park e outros | Removido. A comparação passou a ser entre os parceiros e o estacionamento oficial |
| Link externo para quem vende vaga | `aeroparking.com.br`, `nationpark.com.br` e a página de estacionamento do operador de Curitiba | Removidos. Fonte externa passou a ser a ANAC |
| Promessa de transação, contra o ADR-009 | "garanta sua vaga", "traslado gratuito", "reserve já" | Reescritas como fato da unidade, com número e data |
| Marca escrita errada | "Move Park" em dois títulos | Os dois posts foram redirecionados, o erro saiu do índice |
| Travessão, proibido no projeto | 6 posts | Zerado nos 14 sobreviventes |

Todo valor em R$ nas donas agora carrega a data de referência (27/08/2026), vem do motor de
reservas e aponta para o preço vivo em `/precos/<slug>` e `/destinos/<slug>`.

## O que ficou fora, e por quê

**As donas ainda não têm 3.000 palavras.** Depois da revisão elas estão entre 925 e 1.109
palavras, e o analisador da skill `blogpost-seo-geo` bloqueia por contagem. Isso é de propósito:
levar cada âncora ao padrão de 3.000 palavras é a atividade de escrita ("Criar blogpost"), não
a de consolidação. O que esta entrega garante é que a base sobre a qual essa escrita vai
acontecer é verdadeira: nenhum número inventado, nenhum lote inexistente, nenhuma promessa.

Rodando o analisador nas seis donas, o único bloqueio restante em cada uma é a contagem de
palavras. Frase-chave no título, na primeira frase, no slug, na meta description, nos H2 e no
alt já passam.

## Como reverter

Republicar o post no banco (`is_published = true`) **e** tirar a entrada de
`BLOG_CONSOLIDATED_SLUGS`. Só um dos dois não resolve: enquanto a entrada viver no mapa, o
worker responde 301 antes de servir a página, e a URL fica inalcançável mesmo com o post
publicado.
