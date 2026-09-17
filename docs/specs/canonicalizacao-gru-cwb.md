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
| preço, valor, diária | `/blog/preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui/` (invertida em 28/08/2026) | `/precos/aeroporto-afonso-pena` |
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
| melhor, comparativo | `top-3-estacionamentos-do-aeroporto-de-curitiba` (invertida em 28/08/2026) | CWB |
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
| `5-vantagens-de-estacionar-no-aeroporto-de-curitiba` | `top-3-estacionamentos-do-aeroporto-de-curitiba` | comparativo |
| `facilidade-e-conforto-estacionamento-aeroporto-curitiba-cwb` | `top-3-estacionamentos-do-aeroporto-de-curitiba` | comparativo |

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

## A expansão das donas ao padrão de 3.000 palavras

Depois da revisão, as seis donas ficaram entre 925 e 1.109 palavras, e o analisador da skill
`blogpost-seo-geo` bloqueia por contagem. A decisão foi **expandir as donas em vez de escrever
post novo**, porque post novo na mesma intenção reabriria a canibalização que esta consolidação
acabou de fechar, e as donas carregam o histórico de URL mais os 22 redirects.

A regra que guia a expansão: **3.000 palavras é proxy, não meta.** Cada parágrafo novo precisa
responder uma pergunta que a página ainda não responde. O material vem de dado que já existe no
Hub e nunca foi escrito, principalmente distância por terminal, amenidades declaradas, permanência
mínima e a comparação com o estacionamento oficial.

### Estado por âncora

| Âncora | Palavras | Analisador |
| --- | --- | --- |
| `preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui` | 3.794 (tabela de 11/09/2026) | ✅ verde, 0 bloqueio, conferida em 17/09/2026 |
| `como-estacionar-barato-no-aeroporto-de-guarulhos` | 4.216 (tabela de 17/09/2026) | ✅ verde, 0 bloqueio, reescrita em 17/09/2026 |
| `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | 3.040 | ✅ verde, 0 bloqueio |
| `preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui` (conteúdo portado do slug anterior em 28/08) | 3.645 (tabela de 17/09/2026) | ✅ verde, 0 bloqueio, revista em 17/09/2026 |
| `estacionamento-barato-aeroporto-curitiba` | 4.170 (tabela de 27/08/2026) | ✅ verde, 0 bloqueio, conferida e ampliada em 17/09/2026 |
| `conheca-o-estacionamento-mais-proximo-do-aeroporto-afonso-pena-em-2024` | 3.025 | ✅ verde, 0 bloqueio |

**As seis âncoras estão no padrão desde 27/08/2026.** Todas em verde no analisador da skill, com
zero bloqueio, e a única atenção remanescente em cada uma é a densidade da frase-chave. A
justificativa é a mesma nas seis: as frases-chave têm de quatro a seis palavras de conteúdo, e
chegar a 0,5% exigiria repeti-las de 15 a 17 vezes em pouco mais de 3.000 palavras, o que a
própria skill manda não forçar.

### Conteúdo 07: a canônica de preço de GRU fecha nesta âncora

A atividade [Conteúdo 07, página canônica de preço de Guarulhos](https://app.clickup.com/t/86ak6h5f3)
pedia uma página nova. Ela não foi escrita, de propósito: a dona de preço já existia, carregava o
histórico de URL e os 17 redirects desta consolidação, e post novo na mesma intenção reabriria a
canibalização. O que a atividade pedia foi conferido item a item na âncora, em 17/09/2026:

| O que a atividade exigia | Onde está na âncora |
| --- | --- |
| Tabela por faixa de permanência, parceiros lado a lado | Aerovalet e Aeropark nas três vagas, em 1, 7, 15 e 30 diárias |
| Balcão contra online, com a economia em reais | Tabela própria, em 7 diárias, mais a leitura em 30 |
| Data da tabela visível e método aberto | Toda cifra com a data ao lado; bloco "Como estes preços foram apurados?" separa motor de coleta manual |
| Bloco de fato citável por unidade | Ficha por pátio com endereço, km por terminal, traslado, tolerância, mínimo e serviços |
| FAQ que emite `FAQPage` | 8 perguntas em `###` terminadas em "?", próprias do post |
| Zero promessa de transação | Analisador sem bloqueio; serviços entram como declaração da unidade |

A tabela do post é a de 11/09/2026, quando Aeropark e Aerovalet baixaram a tarifa, e em 17/09
todo valor, inclusive o de balcão (`old_total` do motor), as seis distâncias por terminal e as duas
listas de serviços batiam com o banco. O único número que não sai do motor segue sendo a tarifa do
oficial, coletada em 27/08/2026 e marcada como tal; ela entra na revisão mensal da Fase 3.

As duas atenções do analisador são as mesmas das outras âncoras: densidade da frase-chave em 0,3%
e frase-chave em 7 dos 25 títulos. Forçar qualquer uma pioraria o texto, e a justificativa é a que
já está registrada acima.

### Conteúdo 09: a canônica de preço de CWB também fecha na âncora

A atividade [Conteúdo 09, página canônica de preço do Afonso Pena](https://app.clickup.com/t/86ak6h5t5)
seguiu o mesmo caminho da de Guarulhos: a dona já existia, e post novo reabriria a canibalização.
Aqui, porém, a âncora não passava como estava. Em 17/09/2026 ela tinha três defeitos:

| Defeito | O que foi feito |
| --- | --- |
| Bloqueio no analisador: a imagem do corpo e a capa apontavam para o arquivo do slug morto (`quanto-custa-um-...`), sem variação própria | Capa trazida para `public/images/blog/<slug>/`, duas imagens novas do Higgsfield (`vaga-coberta` e `traslado-van`), cada uma com alt fiel ao que mostra |
| Comparação com Guarulhos errada desde 11/09, quando GRU baixou a tabela: o post dizia R$ 7,00 de diferença na semana e R$ 30,00 no mês | Refeita com a tabela nova: R$ 25,13 na semana e R$ 237,60 no mês, com a data da revisão de GRU |
| O piso de três diárias, que é o ângulo da atividade, aparecia sem o valor dele | Seção própria com a estadia mínima dos seis tipos de vaga (de R$ 56,70 a R$ 83,70), coluna de 3 diárias nas duas tabelas e a explicação do porquê do piso |

Os preços dos dois parceiros não mudaram entre 27/08 e 17/09; todo valor foi conferido de novo
contra o motor, inclusive o de balcão (`old_total`), e as datas do corpo passaram para 17/09. A
tarifa do oficial segue com a data da coleta, 27/08/2026, e está marcada como tal em cada lugar
onde aparece. A diferença de preço por dia entre as faixas, que o post chamava de R$ 1,00, agora
mostra os três degraus (R$ 18,90, R$ 16,90 e R$ 15,90 na descoberta do Abbapark).

Analisador em verde, 0 bloqueio. As três atenções são densidade da frase-chave (0,3%), frase-chave
em 8 de 29 títulos e palavras de transição a 29,5% contra o piso de 30%; as duas primeiras têm a
justificativa das outras âncoras e a terceira está a meia frase do piso.

### Conteúdo 13: a canônica de economia de CWB fecha nesta âncora

A atividade [Conteúdo 13, página canônica de economia do Afonso Pena](https://app.clickup.com/t/86ak6h702)
pedia a dona do cluster barato, economia e desconto em Curitiba. Pelo mesmo motivo do Conteúdo 07,
nenhuma página nova foi escrita: a âncora já era a dona, com histórico de URL e os 3 redirects desta
consolidação. Em 17/09/2026 todo preço de parceiro do post, inclusive o de balcão (`old_total`),
batia com o motor, e o que faltava da atividade entrou no próprio post:

| O que a atividade exigia | Onde está na âncora |
| --- | --- |
| As três alavancas medidas na semana (pátio R$ 21,00, cobertura R$ 35,00, online R$ 13,14) | Seção nova "Quanto cada alavanca devolve numa viagem de uma semana?", com a coluna de 30 diárias (pátio R$ 90,00) |
| Menor total por duração, com quem pratica | Tabela de 1 dia a 30 diárias, com o pátio e o segundo lugar; 1, 2 e 3 dias custam os mesmos R$ 56,70 |
| O piso de três diárias derruba a viagem curta | Resposta rápida, tabela de duração e armadilha própria |
| A conta honesta de quando o carro perde para o aplicativo | Seção nova com o limite por duração. **Nenhuma corrida foi estimada**: o post publica o lado do estacionamento e o leitor coloca o valor do aplicativo |
| FAQ que emite `FAQPage`, zero promessa | 10 perguntas; a do mínimo de diárias, redundante, deu lugar à do aplicativo. Analisador sem bloqueio |

A tarifa do oficial segue sendo a coleta manual de 27/08/2026, marcada como tal, e entra na revisão
mensal da Fase 3. A única atenção do analisador é a densidade da frase-chave (0,2%), com a mesma
justificativa das outras âncoras.

### Conteúdo 11: a canônica de economia de GRU fecha nesta âncora

A atividade [Conteúdo 11, página canônica de economia de Guarulhos](https://app.clickup.com/t/86ak6h6eu)
também pedia página nova, e pelo mesmo motivo do Conteúdo 07 ela não foi escrita: a dona do
cluster barato, economia e desconto já existia, com o histórico de URL e três redirects. O que
mudou foi o conteúdo da dona, que **estava errado desde 11/09/2026**. Ela ainda trazia a tabela de
27/08, e a revisão de preço de setembro inverteu três conclusões do texto.

| O que a versão de agosto dizia | O que o motor diz em 17/09/2026 |
| --- | --- |
| Trocar de pátio devolve R$ 45,00 em 15 diárias | Devolve zero: de 7 diárias em diante os dois cobram igual em cada tipo de vaga |
| Esticar a reserva além de 15 diárias não devolve nada | A tabela tem degraus aos 7, 13 e 18 dias, e 12 diárias custam mais que 18 |
| Em 30 diárias o valet sai mais barato que a coberta | Não sai em nenhuma faixa |
| Menor quinzena R$ 223,50, economia contra o oficial de 56% | R$ 152,70, economia de 70% |

A atividade trazia as quatro alavancas medidas em agosto; elas foram remedidas na mesma faixa de 15
diárias, e entrou uma quinta, que é a maior novidade da página: **reservar mais dias na véspera de
um degrau**. Viagem de 6 dias paga menos reservando 7, de 11 ou 12 reservando 13, de 15 a 17
reservando 18. Na vaga coberta, numa viagem de 17 dias, acertar o degrau devolve R$ 35,30.

| O que a atividade exigia | Onde está na âncora |
| --- | --- |
| O menor total por duração, com quem pratica | Tabela de 1 a 30 diárias, com o pátio e o tipo de vaga de cada linha |
| Quanto se economiza contra o balcão, em reais | Tabela por duração nas vagas descoberta e coberta, de R$ 3,70 a R$ 57,48 |
| O que se abre mão para chegar no mais barato | Seção própria, degrau a degrau, mais a consequência de que o pátio mais perto custa o mesmo de 7 diárias em diante |
| Alerta sobre piso de permanência em viagem curta | Seção própria: mínimo de 2 diárias do Aeropark, faixa mais cara da tabela e o oficial por hora |
| FAQ que emite `FAQPage`, zero promessa | 8 perguntas em `###` terminadas em "?", de 44 a 53 palavras; analisador sem bloqueio |

A regra de retirada antecipada não entrou no texto como fato, porque nenhuma ficha a declara: o
post manda conferir na unidade e linka a FAQ da praça. A tarifa do oficial segue a de 27/08/2026,
marcada como coleta manual, igual à âncora de preço.

As três atenções do analisador são as de sempre: densidade da frase-chave em 0,2%, frase-chave em
7 dos 31 títulos e palavras de transição em 24%. As duas primeiras têm a justificativa já
registrada; a terceira ficou abaixo do piso porque as frases que faltam são linhas de tabela e
itens curtos de lista, e enfiar conectivo nelas pioraria a leitura.

**Pendência operacional encontrada na entrega:** `site_rebuild_health()` respondeu
`sem_deploy_hook` em 17/09/2026, com 767 pedidos na fila desde 19/08. O segredo
`cloudflare_deploy_hook_url` não está no Vault, então edição de conteúdo só vai ao ar com build de
código. Ver [deploy-automatico.md](./deploy-automatico.md).

### O molde, definido pela âncora de preço de GRU

A primeira expansão fixou o formato que as outras cinco seguem:

1. Abertura autossuficiente com a frase-chave na primeira frase, até 90 palavras, seguida de uma
   tabela de resposta rápida.
2. Tabela completa por faixa de permanência, com a data da consulta.
3. Valor por dia em cada faixa, que é a leitura que o total esconde.
4. Balcão contra online, com a diferença em reais e em percentual.
5. **Distância por terminal**, onde o dado existe. Em GRU os três terminais estão cadastrados e a
   diferença entre eles é material num pátio (1,18 km) e irrelevante no outro (0,15 km).
6. **Comparação com o estacionamento oficial**, com a economia em reais e em percentual, e com as
   linhas em que o oficial ganha mantidas na tabela.
7. Ficha por pátio: endereço, distância por terminal, horário, traslado, tolerância, permanência
   mínima e serviços declarados.
8. Bloco de método, separando o que sai do motor do que foi coletado à mão.
9. FAQ com pergunta própria do post, sem repetir o que já responde em `/faq/<slug>`.

### O que a expansão de Curitiba mostrou, e que muda a leitura de mercado

A comparação com o estacionamento oficial não dá o mesmo resultado nas duas praças, e isso tem
consequência comercial, não só editorial.

| Praça | Parceiro mais barato, 15 diárias | Área mais barata do oficial | Leitura |
| --- | --- | --- | --- |
| Guarulhos | R$ 223,50, ou R$ 14,90 por dia | R$ 504,00, ou R$ 33,60 por dia | parceiro 56% abaixo |
| Afonso Pena | R$ 238,50, ou R$ 15,90 por dia | R$ 238,50, ou R$ 15,90 por dia | **empate** |

Em Curitiba, a Área C do oficial (pátio com sombreador) cobrava exatamente a mesma diária que a
vaga descoberta do Abbapark em 27/08/2026. A vantagem do parceiro em Curitiba só aparece contra a
vaga coberta do oficial, onde chega a 52%.

Três desdobramentos, que não são deste épico mas precisam de dono:

1. **O argumento de preço não vende Curitiba sozinho.** O que sustenta a praça é vaga coberta,
   traslado de cinco minutos e tabela publicada com data, contra tarifa que se ajusta por demanda.
2. **O piso de três diárias fecha a faixa curta.** Viagem de uma ou duas noites paga três diárias,
   então o oficial ganha essa faixa por definição. Vale medir quanto de busca cai aí.
3. **Vale reavaliar a tabela dos parceiros de Curitiba** contra a Área C do oficial. É uma conversa
   de precificação, e a skill `propor-preco-movepark` é o caminho.

### O que a âncora de proximidade acrescentou ao molde

A página de proximidade não é a de preço com outra capa. Ela precisa responder à pergunta que a de
preço não responde: **quanto tempo isso me custa.** Três blocos entraram no molde por causa dela.

1. **A conta de tempo porta a porta**, em tabela de melhor e pior caso. Para o Aeropark dá 15 a 50
   minutos entre entrar no pátio e chegar ao balcão, somando espera pela van, traslado e caminhada.
   É a informação que decide o horário de sair de casa, e nenhum concorrente publica.
2. **Distância não é tempo.** A espera pela van pode custar três vezes o tempo do traslado, então
   pátio mais perto com van rara perde para pátio mais longe com van frequente. É por isso que
   `shuttle_frequency_minutes` vale tanto quanto a distância, e por isso a ausência dele numa ficha
   é uma lacuna real, não um detalhe.
3. **A conta contra o carro de aplicativo.** Publicamos o lado do estacionamento com número e
   deixamos o leitor plugar o preço da corrida dele. Nenhuma corrida foi estimada.

Quando um campo não está declarado na ficha, o texto diz que não está, em vez de preencher com
estimativa. É o caso do traslado do Aerovalet, que trava a conta de tempo daquele pátio.

### O que a âncora de barato acrescentou ao molde

O risco desta era virar a de preço com outro título, já que os clusters são vizinhos. A saída foi
mudar a unidade de análise: a de preço responde **quanto custa**, a de barato responde **qual
decisão devolve mais dinheiro**.

Dois blocos entraram no molde por causa dela e servem a qualquer praça:

1. **O ranking de alavancas**, todas medidas na mesma faixa de permanência para a comparação ser
   justa. Em Guarulhos, em 27/08/2026: sair do oficial devolve R$ 280,50, escolher vaga descoberta
   devolve R$ 105,00, trocar de pátio devolve R$ 45,00 e reservar online devolve R$ 44,70.
   O resultado contraria o senso comum duas vezes: o desconto de reserva antecipada, que é a dica
   mais repetida do mercado, é a que menos devolve, e o tipo de vaga pesa mais que a escolha do lote.
2. **A escada acumulada**, que mostra o total descendo degrau a degrau do oficial até o piso. Ela
   revela que mesmo o pátio mais caro, na vaga mais cara e na tabela de balcão, ainda sai abaixo do
   oficial de Guarulhos.

A regra de comparação justa que saiu daqui: **alavancas só podem ser ranqueadas dentro da mesma
faixa de permanência.** Comparar uma economia medida em 7 diárias com outra medida em 30 infla a
maior e some com a menor.

### O ranking de alavancas muda por praça, e isso é o conteúdo

A mesma análise de alavancas, aplicada às duas praças, deu ordens diferentes. Não é ruído: é o
retrato de dois mercados distintos, e é o que dá valor à página.

| Alavanca, 15 diárias | Guarulhos | Afonso Pena |
| --- | --- | --- |
| Sair do estacionamento oficial | R$ 280,50 | de R$ 408,75 a **zero**, conforme o setor |
| Escolher vaga descoberta | R$ 105,00 | R$ 75,00 |
| Escolher o pátio mais barato | R$ 45,00 | R$ 45,00 |
| Reservar pela tabela online | R$ 44,70 | R$ 26,50 |
| **Escada completa** | **56%** | **39%** |

Três conclusões que valem para a estratégia, não só para o texto:

1. **Em Guarulhos a alavanca 1 domina.** Sair do oficial devolve mais que as outras três somadas, e
   mesmo o pior arranjo entre parceiros ainda fica abaixo do oficial.
2. **Em Curitiba a alavanca 1 não é uma alavanca, é uma escolha de setor.** Contra o edifício
   garagem devolve R$ 408,75; contra a Área C do oficial devolve zero, porque as duas cobravam
   R$ 15,90 por dia em 27/08/2026.
3. **Escolher o pátio mais barato custa serviço em Guarulhos e não custa em Curitiba.** Lá o mais
   barato fica 3 km mais longe e não declara traslado; aqui os dois declaram a mesma lista de dez
   serviços e o mesmo traslado de cinco minutos, então a troca custa só 1,2 km.

### A regra de origem do número

O bloco de método distingue duas fontes, e essa distinção é obrigatória:

- **Preço de parceiro** sai do motor de reservas. É o mesmo número que fecha a reserva.
- **Tarifa do estacionamento oficial** não passa pelo motor. É coleta manual na página do
  operador, com a data ao lado, e tem que estar marcada como tal no texto.

Chutar a tarifa do oficial é proibido, mesmo quando a comparação é desejável. O diferencial da
Movepark é que o valor publicado é o valor cobrado, e um número inventado sobre terceiro destrói
isso de uma vez. Quando a fonte primária não estiver disponível, a saída é publicar a comparação
sem o número, e não com um número plausível.

## Como reverter

Republicar o post no banco (`is_published = true`) **e** tirar a entrada de
`BLOG_CONSOLIDATED_SLUGS`. Só um dos dois não resolve: enquanto a entrada viver no mapa, o
worker responde 301 antes de servir a página, e a URL fica inalcançável mesmo com o post
publicado.


## Pendências de cadastro encontradas na expansão

Duas inconsistências apareceram ao escrever a âncora de preço de GRU. Nenhuma foi corrigida aqui,
porque são dados de unidade e afetam mais superfícies que o blog.

1. **Aerovalet, Guarulhos: traslado contraditório.** A ficha tem `has_shuttle = false`, sem
   `shuttle_to_terminal_minutes` nem `shuttle_frequency_minutes`, mas a amenidade `shuttle_free`
   ("Transfer gratuito") está marcada. As duas fontes discordam, e isso aparece na página da
   unidade, na busca e no bloco de fato. O post trata dizendo que a ficha lista transfer entre os
   serviços mas não declara o tempo, que é literalmente o que o banco diz.
2. **Lisboa Park listada no destino de Guarulhos.** A unidade tem `is_listed = true` e
   `destination_id` de GRU, mas não aparece no índice de preços. Parece erro de vínculo de destino.

## Revisão cruzada (Léo, 28/08/2026)

O mapa está aprovado no desenho: clusters certos, donas com dono claro, cadeia de redirect num
salto só e a revisão de conteúdo feita antes de concentrar o tráfego. Três pontos voltam para o
Diego, todos nascidos do baseline do Search Console, que foi congelado depois que este mapa foi
aplicado (a eleição de 15/08 usou a planilha de migração, este baseline é mais completo).

1. **A dona de preço de CWB parece invertida.** `preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui`
   fez 891 cliques em 16 meses na posição média 9,2, segunda página mais clicada do blog inteiro,
   e foi absorvida por `quanto-custa-um-estacionamento-do-aeroporto-afonso-pena`, que fez 1 clique
   na posição 36. A expansão de 3.120 palavras é portável: dá para republicar o slug de 891
   cliques com o conteúdo novo e inverter o 301. O histórico mora no slug, não no texto.
2. **A dona de melhor de CWB, mesmo caso em menor escala.** O `top-3-estacionamentos-do-aeroporto-de-curitiba`
   fez 359 cliques na posição 8,9 e foi absorvido pela dona de 28 cliques na posição 17,5.
3. **Um slug de preço de GRU aponta para a dona de melhor.** `valor-de-diaria-estacionamento-aeroporto-guarulhos`
   redireciona para o guia de melhores desde 15/08 (na época o título do post era um "TOP 3", o
   slug diz outra coisa). Candidato a reapontar para a dona de preço, junto com os reapontes de
   VCP do Conteúdo 19.

A decisão é da praça. Se a escolha atual ficar, vale registrar o motivo aqui, porque os números
sozinhos apontam para o outro lado.

### O que a revisão mudou, aplicado em 28/08/2026

Os três pontos foram acatados e aplicados no mesmo dia, com o baseline como critério:

1. **Preço de CWB invertido.** O slug de 891 cliques voltou a publicar, recebeu o conteúdo
   expandido de 3.120 palavras (com o título e a frase-chave adaptados) e virou a dona. O
   `quanto-custa-um-...` saiu de publicação e responde 301 nela.
2. **Melhor de CWB invertido.** O `top-3-...-curitiba` voltou com o conteúdo revisado da dona
   anterior, reescrito no formato answer-first, e os quatro perdedores do cluster apontam pra ele.
   A expansão ao padrão de 3.000 palavras fica pra Fase 1 da praça, como já estava planejado.
3. **`valor-de-diaria-...-guarulhos` reapontado** pra dona de preço de GRU.

Os links internos das outras âncoras de CWB foram atualizados pras donas novas, no banco e nos
gêmeos Markdown. Os 301 antigos trocaram de alvo no mesmo commit, então não há cadeia nova.
