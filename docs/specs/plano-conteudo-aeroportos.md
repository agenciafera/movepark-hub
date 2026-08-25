# Plano de conteúdo: dominar a busca de estacionamento de aeroporto

> **Status:** proposto em 25/08/2026 · **Escopo:** blog do `movepark.co` + Instagram
> **Aeroportos da onda 1:** Viracopos (VCP), Guarulhos (GRU), Afonso Pena (CWB), Confins (CNF)
> **Meta:** ser a resposta que o Google mostra e a que a IA cita, para toda consulta de
> estacionamento em aeroporto do Brasil.
>
> Depende de: [`blog.md`](./blog.md), [`agent-readiness-seo.md`](./agent-readiness-seo.md),
> [`seo-indexacao.md`](./seo-indexacao.md), [`destinations.md`](./destinations.md),
> [`indice-precos.md`](./indice-precos.md), [`lote-mapeado-vitrine.md`](./lote-mapeado-vitrine.md).
> Regra de escrita: skill `blogpost-seo-geo`. ADR-009 vale para todo bloco de promessa.

---

## 1. O ponto de partida, medido

Nada aqui é estimativa. São números do banco vivo, do site no ar e de uma coleta de
autocomplete feita em 25/08/2026.

### 1.1 O que já está construído e funcionando

| Ativo | Estado em 25/08/2026 |
|---|---|
| Domínio | O cutover **já aconteceu**: `movepark.co` serve o Hub e responde 200, sem `noindex`. O `hub.movepark.co` faz 301 para o apex |
| Páginas de destino | 22 aeroportos publicados em `/destinos/<slug>`, com gêmeo Markdown por content negotiation |
| Índice de preços | `/precos`, `/precos/<slug>` e `/calculadora-estacionamento-aeroporto` no ar, com preço do motor de reservas |
| FAQ com página própria | 8 perguntas globais + 8 por destino, cada uma em `/faq/<slug>` com `FAQPage` e `BreadcrumbList` no HTML |
| Blog | 95 posts herdados do WordPress, todos com `.md` servido para crawler de IA |
| Robots | Bots de IA liberados, inclusive os de treino, desde 15/08/2026 |

A engrenagem está montada. O que falta é **volume de conteúdo nas intenções certas**.

### 1.2 O acervo do blog está torto

| Aeroporto | Posts | Publicados | Post mais novo |
|---|---|---|---|
| GRU | 36 | 26 | 29/09/2025 |
| VCP | 26 | 18 | 06/04/2026 |
| CWB | 14 | 10 | 01/10/2025 |
| LIS | 9 | 5 | 15/01/2025 |
| CNF | 3 | 3 | 25/02/2025 |
| CGH | 3 | 3 | 25/02/2025 |
| NVT | 3 | 3 | 12/08/2026 |
| REC | 1 | 1 | 11/08/2026 |

Dois problemas saltam. Primeiro, **62 dos 95 posts disputam GRU e VCP**, quase todos com a
mesma intenção ("qual o valor da diária", "onde estacionar", "melhores opções"), o que divide
sinal em vez de somar. Segundo, **Confins tem 3 posts para um aeroporto que move 12 milhões de
passageiros por ano**, e o mais recente é de fevereiro de 2025.

Consequência prática: publicar mais um texto genérico sobre Guarulhos **subtrai** tráfego. A onda 1
não é "escrever mais sobre GRU", é **consolidar GRU e abrir CNF**.

### 1.3 O furo que precisa ser dito antes de tudo

**Confins não tem nenhum parceiro cadastrado.** Zero unidades em `location`, seis lotes mapeados
em `prospect_location`. Guarulhos tem 3 unidades listadas, Viracopos 2, Afonso Pena 2.

Isso não invalida o plano, muda o CTA. Em Confins o conteúdo alimenta a vitrine de lote mapeado
(E0.17, `/destinos/aeroporto-de-confins`) e a captação de parceiro (`/seja-parceiro`), não a
reserva. Ranquear em Confins antes de ter oferta é o caminho certo, porque a página pronta é o
argumento comercial que fecha o parceiro. Mas **não escreva nenhuma promessa de reserva lá**: ADR-009
proíbe, e a IA repetiria a promessa que a página não entrega.

Ação de negócio associada: fechar pelo menos um parceiro em Confins até o fim da Fase 2, senão a
Fase 3 de CNF entrega tráfego que não converte.

### 1.4 Quem já está na frente

Levantamento de SERP em 25/08/2026 para as consultas-alvo:

| Concorrente | O que faz bem | O que não cobre |
|---|---|---|
| Bandeira Park | Página de comparativo com carimbo mensal ("Comparativo jun/2026"), citada na visão geral de IA do Google | Convênio, tag de pedágio, terminal específico, moto |
| ParkMundo | Blog com página por consulta ("valor estacionamento aeroporto confins") | Preço vivo, prova de método |
| xpark.ai | Índice de preços e calculadora, blog de guia por aeroporto | Cauda longa de benefício e de setor do terminal |
| Zul+ | Autoridade de marca em mobilidade, conteúdo de guia | Especificidade por lote |
| Indigo Neo / GRU Airport | É o oficial, então ganha a consulta "oficial" por definição | Comparação honesta com alternativa mais barata |

A leitura importante: **o comparativo de preço já está disputado**. A cauda longa de benefício,
de setor de terminal e de operação (tag, moto, mensalista) está **vazia**.

---

## 2. As quatro alavancas

A ordem é a que foi pedida, e ela também é a ordem certa de esforço por retorno.

### Alavanca 1: o bloco "As pessoas também perguntam"

**Como o bloco é servido.** O Google monta o bloco com trechos que respondem a pergunta de forma
isolada, curta e literal. Ele prefere página cujo `<h1>` ou `<h2>` é **a pergunta inteira**, com a
resposta em 40 a 60 palavras logo abaixo, e trata `FAQPage` como confirmação da estrutura.

**A arma que a Movepark já tem.** Cada FAQ publicada vira página própria em `/faq/<slug>`, com
`FAQPage` e `BreadcrumbList` no HTML pré-renderizado. Isso já ranqueia: em 25/08/2026 a página
`movepark.co/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos` aparece na busca orgânica.

**O buraco.** Das 4 perguntas do bloco real de Guarulhos, a Movepark responde 2.

| Pergunta do bloco PAA (GRU) | Página hoje |
|---|---|
| Qual o valor do estacionamento no aeroporto de Guarulhos? | ✅ coberta por "Quanto custa estacionar no Aeroporto de Guarulhos?" |
| Qual o melhor estacionamento para deixar o carro no aeroporto de Guarulhos? | ❌ existe só "o mais barato", que é outra intenção |
| Quanto custa o estacionamento no Terminal 3 do Aeroporto de Guarulhos? | ❌ nenhuma página fala de terminal |
| Como pagar mais barato no estacionamento do aeroporto de Guarulhos? | ❌ |

**A ação.** Subir o catálogo de FAQ por destino de 8 para 24 perguntas nos 4 aeroportos da onda 1,
usando as perguntas reais coletadas. Cada uma nasce como página `/faq/<slug>`, e as mesmas
perguntas viram os `##` do blogpost do aeroporto. Uma pergunta, duas superfícies, zero duplicação
de resposta (a FAQ em camadas do ADR-002 já garante isso).

**As perguntas reais coletadas**, por aeroporto, prontas para virar FAQ (amostra do conjunto
completo em `docs/specs/dados/cauda-longa-aeroportos.json`):

| Aeroporto | Perguntas com demanda confirmada |
|---|---|
| GRU | quanto custa estacionar / qual o valor da diária / qual o melhor / qual o mais barato / qual o mais próximo / como pagar mais barato / precisa reservar / como funciona / é seguro deixar o carro / vale a pena deixar o carro / tem estacionamento coberto / tem estacionamento de moto / tem estacionamento gratuito |
| VCP | quanto custa estacionar / quanto custa estacionar dentro do aeroporto / qual o melhor / qual o mais barato / qual o mais próximo / como funciona / como reservar / tem estacionamento gratuito |
| CNF | quanto custa estacionar / quanto custa por hora / qual o valor da diária / qual o melhor / qual o mais barato / qual o mais barato dentro do aeroporto / qual o mais próximo / como funciona / tem estacionamento de moto |
| CWB | quanto custa a diária / quanto custa a hora / qual o valor / qual o mais barato / como funciona / como reservar / onde deixar o carro / tem estacionamento gratuito |

### Alavanca 2: aparecer na lista de opções do Modo IA

**Como a visão geral de IA escolhe quem citar.** Ela não cita a página mais bonita, cita o
**bloco de fato mais fácil de extrair**. No print de referência, Bandeira Park e Airport Park
entraram na lista porque suas páginas trazem a mesma estrutura: nome do lote, preço com moeda e
condição ("R$ 18,49 descoberta online"), distância ou tempo até o terminal, e a existência do
traslado com horário ("transfer 24h").

Ou seja, o formato citável é uma frase com **entidade + número + unidade + condição**. Adjetivo
não sobrevive à extração.

**A ação, em três frentes:**

1. **Bloco de fato citável por unidade parceira.** Toda menção a lote parceiro em blog e em
   página de destino sai no padrão: `<Nome do lote>` fica a `<N>` km do terminal, com traslado a
   cada `<N>` minutos, e a diária online sai por `R$ <valor>` em `<mês/ano>`. Isso é fato da
   unidade, não promessa de transação, então passa no ADR-009.
2. **Tabela em toda página de preço.** Tabela é a estrutura que o modelo lê inteira e reproduz sem
   reescrever. O `/precos/<slug>` já entrega isso; o blog precisa repetir o mesmo recorte.
3. **Nomear a entidade por extenso pelo menos uma vez por página.** "Aeroporto Internacional
   Tancredo Neves, em Confins e Lagoa Santa, região metropolitana de Belo Horizonte, código CNF".
   Sigla solta é ambígua e o modelo desambigua por entidade.

**Números vivos disponíveis hoje** (motor de reservas, 25/08/2026), que já servem de matéria-prima:

| Aeroporto | Menor diária online | 7 diárias | Distância do menor | Traslado |
|---|---|---|---|---|
| GRU | R$ 18,90 (Aerovalet, descoberta) | R$ 111,30, ou R$ 15,90 por dia | 4,5 km | conforme a unidade |
| VCP | R$ 40,00 (Virapark, coberta) | R$ 174,30, ou R$ 24,90 por dia | 3,7 km | sim |
| CWB | entrada a partir de 3 diárias (Abbapark, descoberta) | R$ 118,30, ou R$ 16,90 por dia | 2,6 km | 5 min |
| CNF | sem parceiro | sem parceiro | 6 lotes mapeados | a confirmar |

Todo valor publicado carrega data de referência e link para o preço vivo. É regra da skill e é o
que separa a Movepark de um índice coletado à mão: aqui o valor publicado é o valor cobrado.

### Alavanca 3: volume de palavra-chave

**Sobre o método, com honestidade.** Não existe ferramenta de volume conectada a este projeto, e
volume absoluto sem fonte é chute. O que foi feito no lugar é uma medida de **amplitude de
demanda**: quantos termos distintos o autocomplete do Google devolve para cada raiz. O Google só
sugere consulta que tem volume real, então a contagem de variações é um proxy defensável de
tamanho e de maturidade do cluster.

Foram coletados **1.282 termos únicos** em 25/08/2026, a partir de 13 raízes e 20 modificadores.

| Cluster de intenção | GRU | VCP | CNF | CWB | Total | Leitura |
|---|---|---|---|---|---|---|
| preço, valor, diária | 70 | 29 | 27 | 37 | **163** | maior demanda, já disputado |
| proximidade (perto, próximo, dentro) | 38 | 33 | 21 | 17 | **109** | alta demanda, casa com a vitrine |
| barato, economia, desconto | 33 | 15 | 23 | 17 | **88** | disputado por comparador |
| terminal e setor (T1/T2/T3, P1/P3, edifício garagem) | 61 | 3 | 11 | 4 | **79** | **quase ninguém cobre** |
| convênio e benefício (Itaú, Porto Seguro, OAB, Azul, Latam) | 40 | 8 | 14 | 6 | **68** | **ninguém cobre** |
| reserva e como funciona | 15 | 3 | 10 | 8 | **36** | fundo de funil |
| melhor, comparativo | 13 | 3 | 5 | 7 | **28** | é a pergunta do PAA |
| segurança e prova social | 13 | 4 | 5 | 3 | **25** | quebra de objeção |
| coberto e descoberto | 13 | 7 | 2 | 2 | **24** | casa com tipo de vaga |
| tag de pedágio (Sem Parar, ConectCar, Veloe) | 6 | 1 | 5 | 4 | **16** | **ninguém cobre** |
| mensal e longa estadia | 10 | 1 | 3 | 1 | **15** | ticket alto |
| moto | 4 | 1 | 3 | 3 | **11** | **ninguém cobre**, e a Movepark tem tipo `motorcycle` |
| 24 horas e horário | 4 | 3 | 2 | 2 | **11** | |
| traslado e transfer | 5 | 3 | 1 | 1 | **10** | |
| gratuito | 1 | 2 | 1 | 3 | **7** | tráfego que não converte, responder e redirecionar |
| serviço extra (lava jato, valet, elétrico) | 2 | 0 | 1 | 1 | **4** | |

**Como calibrar o volume absoluto depois**, e isso entra na Fase 0 como tarefa:

1. **Search Console.** `movepark.co` já é propriedade de domínio. Exportar 16 meses por consulta
   dá volume real de impressão, que é melhor que estimativa de terceiro, porque é a demanda que já
   chega no site.
2. **Keyword Planner.** Conta de Google Ads, mesmo sem campanha ativa, devolve faixa de volume por
   termo. Faixa larga, mas ancora a ordem de grandeza.
3. **A regra de decisão.** Cluster entra na pauta quando aparece no autocomplete **e** tem
   impressão no Search Console **e** a SERP atual não tem uma resposta específica. Dois de três já
   justifica teste.

### Alavanca 4: a cauda longa que o concorrente não enxerga

Seis clusters órfãos, todos com demanda confirmada no autocomplete e nenhum conteúdo dedicado na
SERP brasileira. É aqui que o plano ganha em vez de empatar.

**4.1 Convênio e benefício de cartão (68 termos).** Os termos reais incluem "convênio Itaú
Personnalité", "desconto Porto Seguro", "convênio OAB", "convênio Latam", "cliente Personnalité",
"Livelo", "Mastercard Black", "Visa Infinite", "Azul Diamante", "TudoAzul". A pessoa que busca isso
tem cartão premium, viaja mais e compra sem olhar centavo. **Ninguém escreveu essa página.**

Cuidado obrigatório: só publique benefício que a Movepark ou o parceiro realmente pratica. O ângulo
seguro e útil é o **guia comparativo honesto**: quais convênios existem no estacionamento oficial,
quanto valem na prática, e em que faixa de diárias o desconto do convênio ainda perde para a reserva
online em lote parceiro. Isso é comparação de fato, não promessa.

**4.2 Tag de pedágio (16 termos).** "aceita Sem Parar", "aceita ConectCar", "Veloe", "Velox". É uma
pergunta de operação, com resposta binária, que resolve uma dúvida real de quem já está dirigindo
para o aeroporto. Custo de produção baixíssimo, e vira FAQ, post e reels.

**4.3 Terminal e setor (79 termos, 61 só em GRU).** "Terminal 3 preço", "Terminal 2 edifício
garagem", "portão 2", "P1 e P3 em Confins", "área C em Curitiba", "bolsão F em Viracopos". O
buscador está pensando em geografia interna do aeroporto, e nenhum comparador fala essa língua.
Uma página por terminal em GRU é a maior oportunidade isolada do plano.

**4.4 Moto (11 termos).** O motor já tem `parking_type_code = motorcycle`, e o índice de preços já
separa moto de carro. É conteúdo com produto pronto atrás.

**4.5 Mensalista e longa estadia (15 termos).** "estacionamento mensal aeroporto Guarulhos",
"30 dias", "20 dias". Ticket alto e recorrente. Conecta com a spec `mensalista-recorrencia.md`.

**4.6 Prova social e segurança (25 termos).** "é seguro", "confiável", "avaliação", "reviews",
"reddit". A busca por "reddit" é o sinal mais claro de que a pessoa não confia no conteúdo
comercial que encontrou. Conteúdo que mostra critério de seleção, avaliação real e o que acontece
quando dá problema ganha essa consulta.

---

## 3. As fases

Cada fase tem entrega fechada, e a seguinte só começa quando a anterior está publicada. O ritmo
proposto é de **2 blogposts por semana** e **4 posts de Instagram por semana**, sustentável por uma
pessoa com apoio de IA.

### Fase 0: fundação e instrumentação (semana 1)

Sem isto, o resto vira publicação às cegas.

| Entrega | Detalhe |
|---|---|
| Baseline do Search Console | Exportar 16 meses por consulta e por página, congelar como marco zero |
| Calibração de volume | Conta de Keyword Planner ligada, faixa de volume anexada aos 16 clusters |
| Auditoria de canibalização | Rodar `grep -ril` no acervo por aeroporto, marcar cada post como manter, atualizar ou consolidar |
| Decisão sobre os 33 posts não publicados | 95 posts existem, 69 estão publicados. Publicar, reescrever ou arquivar, um a um |
| Painel de acompanhamento | Consulta, posição, impressão, clique e citação em IA, por semana |
| Kit de marca do Instagram | Grid, tipografia grande, paleta violeta e navy, molde de carrossel e de reels |

### Fase 1: dominar a pergunta (semanas 2 a 5)

Alvo: bloco PAA e featured snippet nos 4 aeroportos.

| Semana | Blogposts | FAQ novas |
|---|---|---|
| 2 | Guarulhos: qual o melhor estacionamento, com critério aberto · Guarulhos: como pagar mais barato | 8 em GRU |
| 3 | Viracopos: guia de preço 2026 (atualiza o post de abril) · Viracopos: qual o melhor | 8 em VCP |
| 4 | Afonso Pena: quanto custa e como funciona · Afonso Pena: qual o mais barato | 8 em CWB |
| 5 | Confins: guia completo de estacionamento (o post-âncora que falta) · Confins: quanto custa | 8 em CNF |

Regra de ouro da fase: **nenhum post novo sobre intenção já coberta**. Se o acervo já tem, atualiza
o que existe e mantém o slug, porque slug publicado nunca muda.

### Fase 2: dominar o preço e a citação por IA (semanas 6 a 9)

Alvo: entrar na lista de opções da visão geral de IA e do Modo IA.

| Semana | Entrega |
|---|---|
| 6 | Página comparativa por aeroporto com carimbo mensal, no molde que o Bandeira Park usa e o `/precos/<slug>` já sustenta, mais um post por aeroporto que cita cada parceiro no formato entidade mais número |
| 7 | Guarulhos por terminal: T1, T2 e T3, com preço do edifício garagem e alternativa fora do aeroporto |
| 8 | Confins por setor: P1, P3, E1 e E3 · Viracopos: bolsão F e edifício garagem |
| 9 | Curitiba: áreas A, B e C · post transversal "dentro ou fora do aeroporto: a conta que decide" |

Aqui entra também o item de negócio: **fechar parceiro em Confins**. A página pronta é o argumento.

### Fase 3: a cauda longa órfã (semanas 10 a 15)

Alvo: ocupar terreno onde não existe concorrente.

| Semana | Blogposts |
|---|---|
| 10 | Convênio de cartão e estacionamento de aeroporto: o que vale e o que não vale (GRU) · versão CNF |
| 11 | Estacionamento de aeroporto aceita Sem Parar, ConectCar e Veloe? (guia dos 4 aeroportos) |
| 12 | Onde deixar a moto no aeroporto (GRU e CNF) |
| 13 | Estacionamento mensal de aeroporto: quando compensa (GRU e VCP) |
| 14 | É seguro deixar o carro no aeroporto? O que perguntar antes de escolher |
| 15 | Voo de madrugada, chegada de madrugada: como funciona o 24 horas |

### Fase 4: escala nacional (semanas 16 a 28)

Alvo: os 18 aeroportos publicados que hoje têm zero ou um post.

Ordem de ataque por demanda e por presença de lote mapeado: Congonhas, Galeão, Brasília, Recife,
Salvador, Porto Alegre, Fortaleza, Florianópolis, Navegantes, Vitória, Cuiabá, Goiânia, Santos
Dumont, Campo Grande, Maceió, João Pessoa, Londrina, Teresina.

Molde fixo por aeroporto, três peças: **guia âncora**, **página de preço** e **8 FAQ**. Fase 4 é
produção industrial, não invenção: o formato já foi validado nas fases 1 a 3.

### Fase 5: defesa e manutenção (contínua, a partir da semana 16)

O conteúdo de preço apodrece rápido e o Google percebe.

| Rotina | Frequência |
|---|---|
| Atualizar carimbo de mês e valores das páginas comparativas | mensal |
| Revisar as 10 páginas com maior queda de posição | quinzenal |
| Testar a citação em ChatGPT, Gemini, Perplexity e visão geral do Google | mensal, com registro |
| Consolidar posts canibais restantes do acervo | mensal, 4 por mês |
| Coletar autocomplete de novo e comparar com o baseline | trimestral |

---

## 4. Estrutura obrigatória do blogpost

Isto é contrato, não sugestão. O analisador da skill `blogpost-seo-geo` mede a maior parte e
bloqueia o que quebra o site.

### 4.1 Antes de escrever, três portões

1. **Uma frase-chave por post**, do jeito que a pessoa digita, mais 2 a 4 sinônimos reais.
2. **Checagem de canibalização** com `grep -ril "<aeroporto>" public/blog/`. Se a intenção já
   existe no acervo, atualiza o post existente e mantém o slug.
3. **Intenção em uma frase.** Se a resposta cabe num parágrafo, o assunto não sustenta o post.

### 4.2 O esqueleto, bloco a bloco

| # | Bloco | Regra dura | Serve a |
|---|---|---|---|
| 1 | **Título (H1)** | Frase-chave inteira, até 60 caracteres, sem promessa de transação | SEO |
| 2 | **Meta description** | Frase-chave, até 155 caracteres, com o benefício concreto | SEO |
| 3 | **Abertura autossuficiente** | Até 90 palavras, frase-chave na **primeira frase**, responde a pergunta antes de detalhar. Sem "neste artigo você vai descobrir" | GEO e snippet |
| 4 | **Entidade por extenso** | Nome completo do aeroporto, cidade, região e código IATA, pelo menos uma vez | GEO |
| 5 | **Resposta rápida em tabela** | Logo depois da abertura: opções, preço, distância, traslado | GEO e rich result |
| 6 | **H2 em forma de pergunta** | Do jeito que a pessoa pergunta. Abaixo de cada um, um parágrafo que responde sozinho, sem depender do resto do texto | PAA e GEO |
| 7 | **Tabela sempre que houver dado comparável** | Preço por faixa de diárias, comparativo de opções, distância e tempo | GEO |
| 8 | **Número com unidade e data** | "12 minutos de traslado", "R$ 18,90 a diária em agosto de 2026". Adjetivo não é citável | GEO |
| 9 | **Lista com item autoexplicativo** | "Cobertura: protege do sol e do granizo, e custa de 10% a 20% a mais". Nunca só a palavra | GEO |
| 10 | **Bloco de método** | Como o preço foi apurado e quando. É o que separa fonte confiável de folheto | E-E-A-T |
| 11 | **FAQ no fim** | 5 a 8 perguntas reais, pergunta em `###`, resposta de 40 a 60 palavras | PAA e GEO |
| 12 | **Links** | 1 para `/destinos/<slug>`, 2 ou 3 para outros posts, 1 externo de fonte reconhecida com rótulo. **Nunca** link para quem vende vaga | SEO |
| 13 | **Autoria e data visíveis** | Quem escreveu e quando | E-E-A-T e GEO |
| 14 | **CTA final** | Para `/destinos/<slug>`. Sem prometer nada que a unidade não declare | conversão |

### 4.3 Os limites que bloqueiam a publicação

| Regra | Limite |
|---|---|
| Extensão | mínimo de 3.000 palavras |
| Densidade da frase-chave | entre 0,5% e 2,5%, distribuída, nunca forçada |
| Frase-chave obrigatória em | título, primeira frase, ao menos 2 H2, slug, meta description e ao menos um `alt` |
| Corpo | Markdown puro, zero HTML. O render imprime a tag na tela |
| Blocos permitidos | `##`, `###`, `####`, parágrafo, lista com um nível, citação `>`, imagem, `---`, tabela |
| Travessão e traço | zero. Nem `—` nem `–` |
| Promessa de transação | zero (ADR-009). Nada de "vaga garantida", "cancelamento grátis", "preço fixo" |
| Valor em R$ | sempre com data de referência e link para o preço vivo |
| Slug publicado | nunca muda |
| Gêmeo Markdown | `public/blog/<slug>.md` commitado junto. Sem ele o post não existe para IA nenhuma |
| Imagens | WebP no Storage em `assets-public/blog/<slug>/`, máximo 1600px, `alt` com a frase-chave |

### 4.4 Schema

`BlogPosting` e `BreadcrumbList` já saem automáticos na rota. `FAQPage` no post ainda não existe e
é mudança de código, não de conteúdo. Escreva a FAQ no formato certo mesmo assim (pergunta em
`###`, resposta no parágrafo seguinte), porque é o formato que o Google entende sem JSON-LD.

**Item de backlog que vale a pena:** emitir `FAQPage` no post. É o que fecha o ciclo do PAA.

### 4.5 A checagem final de GEO

Leia o post inteiro e pergunte: **se eu tivesse que responder "qual o melhor estacionamento em X"
usando só este texto, qual parágrafo eu copiaria inteiro?** Se a resposta for "nenhum, eu juntaria
pedaços de três", o post ainda não está citável.

---

## 5. Estrutura obrigatória do Instagram

### 5.1 O que o Instagram faz e o que ele não faz

Vale ser direto para não construir expectativa errada. O Instagram **não** transfere autoridade
para o Google, e link em legenda não conta como backlink. O que ele entrega, e que importa para
esta estratégia, é outra coisa:

1. **Busca de marca.** Quem vê "Movepark" no feed depois pesquisa "Movepark Guarulhos" no Google.
   Busca de marca é sinal forte de entidade e ajuda o site a ser reconhecido como fonte.
2. **Superfície própria de busca.** O Instagram indexa legenda e texto na imagem na busca interna,
   e desde 2026 permite que o conteúdo público apareça em buscadores externos. Legenda com a
   palavra-chave inteira é indexável.
3. **Prova social.** O cluster "é seguro, avaliação, reddit" existe porque as pessoas desconfiam.
   Vídeo real do lote, do traslado e da van resolve objeção que texto nenhum resolve.
4. **Reaproveitamento.** Cada blogpost vira 3 peças de Instagram sem escrever conteúdo novo.

### 5.2 Os quatro formatos, com molde fechado

**Formato A: carrossel de resposta (2 por semana).** É o cavalo de batalha e nasce direto do
blogpost.

| Card | Conteúdo | Regra |
|---|---|---|
| 1 | **A pergunta inteira**, em título grande, ocupando metade do card | Mesma pergunta do H2 do post e do bloco PAA |
| 2 | **A resposta em uma frase**, com o número em destaque | Resolve já, não segura para o fim |
| 3 a 6 | Um argumento por card, com número, unidade e data | Nunca mais de 20 palavras por card |
| 7 | **Tabela simplificada** de preço ou de comparação | Máximo 4 linhas |
| 8 | CTA: "link na bio" para o post ou para `/destinos/<slug>` | Sem promessa de transação |

**Formato B: reels de prova (1 por semana).** 15 a 30 segundos, gravado no lote.

| Segundo | O que acontece |
|---|---|
| 0 a 2 | Gancho falado: a pergunta, sem introdução |
| 2 a 8 | A resposta, com número na tela |
| 8 a 22 | A prova: o carro entrando, a van saindo, o cronômetro do traslado |
| 22 a 30 | O fechamento e o convite |

Legenda com a palavra-chave inteira na primeira linha. Áudio em alta e legenda queimada, porque a
maioria assiste sem som.

**Formato C: story de bastidor e enquete (2 por semana).** Enquete direta ("você deixaria o carro
15 dias no aeroporto?"), caixa de pergunta, e a resposta virando o carrossel da semana seguinte.
Story é onde a pauta é descoberta, não onde ela é entregue.

**Formato D: post estático de dado (1 a cada 15 dias).** Um número grande, uma frase de contexto,
a data. É o formato mais compartilhado e o que mais gera salvamento.

### 5.3 As regras duras do Instagram

| Regra | Por quê |
|---|---|
| Título grande ocupando ao menos 40% do primeiro card | O feed é visto a 15 cm do rosto, com uma mão, em 4G |
| Palavra-chave inteira na **primeira linha** da legenda | É o trecho indexado e o que aparece antes do "mais" |
| Máximo 20 palavras por card | Card cheio não é lido |
| Paleta travada: violeta `#5D5FEF`, navy `#29263F`, branco | Uma marca, três superfícies |
| Tipografia Inter, peso 700 nos títulos | Mesmo sistema do site |
| Sem travessão, sem emoji na prosa, sem exclamação em série | Regra de marca do projeto |
| Nenhuma promessa de transação | ADR-009 vale para o Instagram também |
| Todo valor em R$ com o mês na arte | Preço sem data envelhece e vira reclamação |
| De 3 a 5 hashtags, específicas | `#estacionamentoguarulhos` funciona, `#viagem` não |
| Alt text preenchido em toda imagem | Acessibilidade e indexação interna |

### 5.4 O pipeline: um blogpost vira uma semana de Instagram

```
Blogpost publicado
  ├── H2 principal          → carrossel A (8 cards)
  ├── Tabela de preço       → post estático D (1 número grande)
  ├── FAQ mais buscada      → reels B (30 segundos no lote)
  └── Objeção do post       → story C (enquete + caixa de pergunta)
```

Nada é escrito duas vezes. O post é a fonte, o Instagram é a distribuição.

---

## 6. Métricas e metas

| Métrica | Baseline (a medir na Fase 0) | Meta em 90 dias | Meta em 180 dias |
|---|---|---|---|
| Consultas em posição 1 a 3 | a medir | 25 | 80 |
| Blocos PAA ocupados nos 4 aeroportos | 2 de 16 | 10 de 16 | 14 de 16 |
| Citações em visão geral de IA e Modo IA | 0 conhecidas | 4 | 12 |
| Cliques orgânicos do blog por mês | a medir | +40% | +120% |
| Páginas de FAQ indexadas | a medir | 96 | 200 |
| Posts canibais consolidados | 0 de ~30 | 12 | 30 |
| Aeroportos com trio completo (guia, preço, FAQ) | 0 | 4 | 12 |
| Seguidores e salvamentos no Instagram | a medir | definir na Fase 0 | definir na Fase 0 |

**Como medir citação em IA**, já que não existe painel para isso: rodar mensalmente as 12 consultas
principais em ChatGPT com busca, Gemini, Perplexity e no Google com visão geral de IA, e registrar
em planilha se a Movepark ou um parceiro foi citado, com print. É trabalho manual e é o único
método confiável hoje.

---

## 7. Riscos

| Risco | Probabilidade | O que fazer |
|---|---|---|
| Canibalização piora antes de melhorar | alta | A Fase 0 audita antes de a Fase 1 escrever. Atualizar vence criar |
| Confins ranqueia sem ter oferta | alta | Fechar parceiro até a semana 9. Enquanto não fecha, CTA vai para vitrine e para captação |
| Conteúdo de preço envelhece | certa | Fase 5 é obrigatória, não opcional. Carimbo mensal visível |
| Concorrente copia o formato | média | O fosso não é o formato, é o preço vivo do motor. Comparador copia layout, não copia dado |
| Volume de produção não se sustenta | média | 2 posts por semana é o teto de uma pessoa. Fase 4 pode precisar de reforço |
| Promessa vazando para o conteúdo | média | ADR-009 vale para post e para Instagram. Revisão obrigatória antes de publicar |
| Google penalizar conteúdo em escala | baixa | Cada peça responde intenção distinta, com dado próprio e método aberto. Isso é o oposto de conteúdo em escala |

---

## 8. Dados de apoio

A coleta bruta de 1.282 termos de cauda longa, por raiz e por aeroporto, está em
`docs/specs/dados/cauda-longa-aeroportos.json`. Método: API de autocomplete do Google
(`suggestqueries.google.com`, `hl=pt-BR`, `gl=br`), 13 raízes cruzadas com 20 modificadores,
coletada em 25/08/2026. Reproduzir a coleta a cada trimestre e comparar com o baseline.
