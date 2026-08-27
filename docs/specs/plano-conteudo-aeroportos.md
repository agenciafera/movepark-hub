# Plano de conteúdo: dominar a busca de estacionamento de aeroporto

> **Status:** proposto em 25/08/2026, revisado em 26/08/2026 (cabeça primeiro, praças divididas, Be Park em Confins)
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

**Confins tem parceiro fechado, o Be Park, e ele não está no sistema.** Em 26/08/2026 não existe
empresa, unidade nem lote mapeado com esse nome no Hub: zero registros em `company`, `location` e
`prospect_location`. Os seis lotes mapeados de Confins são Park Confins, IPO Park, Estacionamento
Pátio, AeroPark Confins, Auto Park Brasil e Space Park.

Pior: o Be Park **tinha página no site antigo**, em
`/estacionamentos/aeroporto-confins/be-park-estacionamento-aeroporto-confins/`. Hoje essa URL
responde 301 para `/destinos/aeroporto-de-confins`, uma página que não menciona o Be Park. Quem
chega procurando por ele cai num lugar que não fala dele, o que perde busca de marca e perde
conversão ao mesmo tempo.

Enquanto o cadastro não acontece, Confins é a única praça sem tarifa, sem distância medida e sem
reserva. **É o primeiro entregável da Fase 0**, e sem ele metade da praça do Leonardo fica parada.

Comparativo das quatro praças em 26/08/2026:

| Praça | Parceiros no Hub | Menor semana publicada | Posts no acervo |
|---|---|---|---|
| Guarulhos | 3 | R$ 111,30 na descoberta | 36 |
| Viracopos | 2 | R$ 174,30 na coberta | 26 |
| Afonso Pena | 2 | R$ 118,30 na descoberta | 14 |
| Confins | **0, com o Be Park pendente de cadastro** | sem número | 3 |

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

São os quatro mecanismos que fazem a Movepark ser encontrada e citada. Eles não mudaram na revisão
de 26/08/2026; o que mudou foi **a ordem de ataque**, que passou a começar pela cabeça da busca.
A ordem de execução está em [3.2](#32-a-inversão-de-prioridade-e-o-que-ela-cobra).

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
   chega no site. O coletor está pronto e roda com `bun run seo:gsc-baseline`, que grava
   a pasta datada com os CSVs e o recorte dos três clusters de cabeça. Ver
   [baseline-search-console.md](./baseline-search-console.md).
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

## 3. As praças e as fases

### 3.1 Quem responde por quê

A execução é dividida por praça, e cada pessoa responde pela cabeça, pela consolidação e pela FAQ
do próprio aeroporto. O que é comum aos quatro, como schema e índice de preços, sai uma vez.

| Responsável | Praças | O que pesa nelas |
|---|---|---|
| **Leonardo** | Viracopos (VCP) e Confins (CNF) | VCP tem a maior diferença de preço entre parceiros da rede, R$ 147,00 na semana. CNF depende do cadastro do Be Park e é o primeiro entregável dele |
| **Diego** | Guarulhos (GRU) e Afonso Pena (CWB) | GRU concentra 141 dos 360 termos de cabeça e tem a maior consolidação a fazer, com 36 posts disputando as mesmas consultas. CWB tem o piso de três diárias nos dois parceiros |

### 3.2 A inversão de prioridade e o que ela cobra

A primeira versão deste plano atacava a cauda longa primeiro, porque ela está vazia e é barata. A
decisão do time em 26/08/2026 inverteu isso: **a cabeça vem primeiro**, nos clusters de preço,
valor, diária, proximidade, barato, economia e desconto. São 360 dos 1.282 termos coletados, e é
onde Bandeira Park e xpark já respondem.

A inversão está adotada, e vale registrar o que ela cobra em troca. A cauda longa tolerava o acervo
como está, porque cada post pegava uma intenção diferente. A cabeça não tolera: 36 posts sobre
Guarulhos disputando a mesma consulta dividem sinal e nenhum chega ao topo. **A consolidação deixa
de ser higiene e vira pré-requisito da Fase 1.**

Ritmo proposto: **2 páginas por semana por pessoa** e **4 peças de Instagram por semana por praça**.

### Fase 0: munição e medição (semana 1)

| Entrega | Por quê | Quem |
|---|---|---|
| **Cadastrar o Be Park no Hub** | Sem ele Confins não tem tarifa, distância nem reserva | Leonardo |
| **Mapa de canonicalização** | Definir, por aeroporto, qual URL ganha cada termo de cabeça e o que é redirecionado para ela | os dois. ✅ GRU e CWB em 27/08/2026, em [canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md) |
| Baseline do Search Console | 16 meses por consulta e por página, congelados como marco zero | os dois. ✅ congelado em 27/08/2026: 9.744 consultas, 709 páginas, 1,35 milhão de impressões, em [baseline-search-console.md](./baseline-search-console.md) |
| **Placar de citação em IA** | 12 consultas por mês em ChatGPT, Gemini, Perplexity e visão geral do Google, com print | os dois |
| Bing Webmaster Tools | A busca do ChatGPT se apoia no índice da Microsoft, e ninguém checou se estamos lá | Diego |
| Kit de marca do Instagram | Grid, tipografia grande, molde de carrossel e de reels | Diego |

### Fase 1: uma URL por termo de cabeça (semanas 2 a 6)

Três páginas canônicas por aeroporto, doze ao todo. Cada uma é dona de um cluster, e os posts que
disputam a mesma consulta são redirecionados para ela.

| Cluster | A página dona | O que ela precisa ter |
|---|---|---|
| preço, valor, diária | `/precos/<aeroporto>` reforçada, mais o post âncora de preço | Tabela por faixa de permanência, parceiros lado a lado, balcão contra online, data da tabela e método aberto |
| barato, economia, desconto | `/estacionamento-mais-barato/<aeroporto>` | O menor total por duração, quanto se economiza contra o balcão, e o que se abre mão para chegar nele |
| proximidade, perto, mais próximo | Post âncora de proximidade por aeroporto | Distância em km do motor, minutos de traslado, frequência da van e a conta do que a proximidade custa a mais |

Regra da fase: **cada dona absorve de dois a seis posts existentes**, por 301. Slug publicado que
vira redirect não é slug apagado, é slug que passou a apontar para quem responde melhor.

### Fase 2: a camada de máquina (semanas 7 a 10)

O que faz a IA preferir a Movepark quando duas fontes dizem a mesma coisa.

| Entrega | Estado |
|---|---|
| Bloco de fato padronizado por unidade: nome, km, minutos de traslado e diária com mês | a fazer |
| `Product` e `Offer` nas páginas de preço | a fazer |
| Endpoint público do índice de preços em JSON, datado, para agente ler sem raspar HTML | a fazer |
| `llms.txt` apontando o endpoint e a frequência de mudança | ajuste no arquivo existente |
| Carimbo automático de frescor em toda página de preço | a fazer |
| `FAQPage` no post | ✅ entregue em 25/08/2026, nos 95 posts do acervo |

### Fase 3: prova social e frescor (semanas 11 a 14)

| Frente | Entrega | Contra quem joga |
|---|---|---|
| Prova social | Post por aeroporto sobre "é seguro deixar o carro", com o que verificar e o que acontece quando dá problema | A busca por "reddit", sinal de quem não confia no conteúdo comercial |
| Frescor mensal | Carimbo e valores revistos por mês nas doze páginas de cabeça | O carimbo mensal do Bandeira Park |
| Avaliação real | Publicar avaliação com data e volume, em vez de adjetivo | O comparador que fala de qualidade sem dado |
| Metodologia aberta | Página explicando de onde vem cada número e com que frequência muda | A coleta à mão do xpark |

### Fase 4: a cauda longa órfã (semanas 15 a 20)

O terreno continua vazio e fica barato de ocupar depois que a cabeça estiver de pé. São 189 termos
sem dono: terminal e setor (79), convênio e cartão (68), tag de pedágio (16), mensalista (15) e
moto (11).

Regra da fase: **cada peça sai de um dado que já existe no sistema.** Cluster sem dado por trás não
entra na pauta.

### Fase 5: escala nacional (semanas 21 a 34)

Os 18 aeroportos publicados com zero ou um post, na ordem de demanda e de lote mapeado: Congonhas,
Galeão, Brasília, Recife, Salvador, Porto Alegre, Fortaleza, Florianópolis, Navegantes, Vitória,
Cuiabá, Goiânia, Santos Dumont, Campo Grande, Maceió, João Pessoa, Londrina, Teresina. Molde fixo
de guia âncora, página de preço e FAQ.

### Defesa: contínua, a partir da semana 7

| Rotina | Frequência |
|---|---|
| **Placar de citação em IA** | mensal, com print |
| Carimbo e valores das páginas de cabeça | mensal |
| Revisão das dez páginas em maior queda | quinzenal |
| Consolidação dos posts canibais restantes | 4 por mês |
| Nova coleta de autocomplete contra o baseline | trimestral |

### 3.3 O placar contra Bandeira Park e xpark

Não existe ferramenta que meça citação em IA, então o método é manual e é o único confiável: **doze
consultas, quatro motores, uma vez por mês, com print e data em planilha**. As consultas cobrem os
três clusters de cabeça nos quatro aeroportos, e o que se registra é quem foi citado: Movepark,
Bandeira Park, xpark ou nenhum dos três.

A meta é enunciável em uma frase: **em 180 dias a Movepark aparece em mais respostas que Bandeira
Park e xpark somados, nas doze consultas.**

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

`BlogPosting`, `BreadcrumbList` e `FAQPage` saem automáticos na rota. O `FAQPage` foi ligado em
25/08/2026 e fecha o ciclo do bloco de perguntas: ele lê a FAQ que o próprio post escreveu
(`###` terminado em `?`, com o parágrafo logo abaixo como resposta) e emite a partir de duas
perguntas. Sem campo novo no banco: escrever a FAQ no formato certo é o que liga o schema.

**As perguntas da tabela `faq` não entram no post.** Elas já respondem em `/faq/<slug>`, em
`/destinos/<slug>` e na single da unidade (ADR-002), e trazê-las para cá colocaria a mesma
pergunta com a mesma resposta numa quarta URL. A regra editorial: a FAQ do post pergunta o que
só aquele post responde, e a pergunta genérica do aeroporto vira link para `/faq/<slug>`.
Detalhe em [blog.md](./blog.md).

**O acervo inteiro já está coberto.** Em 25/08/2026 os 84 posts que ainda não tinham FAQ receberam
uma, com 422 perguntas ao todo, escritas a partir do preço do motor, das distâncias medidas e das
regras de permanência de cada unidade. Somados aos 11 que já emitiam, **os 95 posts do acervo
emitem `FAQPage`**. Isso adianta parte da Fase 1: o trabalho que resta ali é a FAQ dos posts novos
e as páginas de `/faq/<slug>` que faltam para fechar o bloco de perguntas.

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

| Métrica | Hoje | 90 dias | 180 dias |
|---|---|---|---|
| **Citações em IA nas 12 consultas** | 0 medidas | 6 de 12 | 10 de 12 |
| **Movepark acima de Bandeira Park e xpark** | não medido | empate | vantagem nas 12 |
| Termos de cabeça em posição 1 a 3 | a medir na Fase 0 | 12 | 30 |
| Páginas canônicas de cabeça no ar | 0 de 12 | 12 de 12 | 36 (com a Fase 5) |
| Posts canibais absorvidos por redirect | 22 de cerca de 40 (GRU e CWB, 27/08/2026) | 24 | 40 |
| Cliques orgânicos do blog por mês | a medir | +40% | +120% |
| Blocos de perguntas ocupados nos 4 aeroportos | 2 de 16 | 10 de 16 | 14 de 16 |
| Posts do acervo emitindo `FAQPage` | ✅ 95 de 95 | manter | manter |
| Aeroportos com trio completo | 0 | 4 | 12 |

**Como medir citação em IA**, já que não existe painel: rodar mensalmente as doze consultas
principais em ChatGPT com busca, Gemini, Perplexity e no Google com visão geral de IA, e registrar
em planilha se a Movepark, o Bandeira Park ou o xpark foi citado, com print. É trabalho manual e é
o único método confiável hoje.

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
