# Análise de conteúdo dos concorrentes: Xpark e Bandeira Park (novembro de 2026)

> **Coletado em:** 03/11/2026
> **Atividade:** Conteúdo 88 no ClickUp (lista Backlog), com uma subtarefa por blogpost
> **Depende de:** [`plano-conteudo-aeroportos.md`](../plano-conteudo-aeroportos.md) (seções 1.4 e 3.3),
> [`blog.md`](../blog.md) e a skill `blogpost-seo-geo`, que manda em toda pauta abaixo.

## 1. Como foi medido

Não há ferramenta paga com o tráfego dos concorrentes (o Semrush da conta é gratuito), então o
substituto foi a **posição no Google** em 13 consultas-alvo, coletada pelo Firecrawl com localização
Brasil em 03/11/2026, mais os sitemaps dos dois sites e o acervo publicado da Movepark no banco
(87 posts em `blog_post` com `is_published`).

Posição de SERP é retrato de um dia e de um local. Serve para ver quem disputa cada intenção, não
para estimar volume.

## 2. O que cada concorrente publica

### Xpark (`xpark.ai`)

| Superfície | Volume no sitemap | O que é |
|---|---:|---|
| Guias | 37 | Posts de 4 a 7 minutos, um autor ("João G.") |
| Wanderlust | 39 páginas + 4 hubs | Micro-FAQ por aeroporto: cancelar reserva, estorno de PIX, onde pegar a van no desembarque, posso levar a chave |
| FAQ | 176 | Inclui perguntas escritas para resposta de IA ("melhor plataforma para comparar e reservar em Guarulhos", "como escolher plataforma de reserva") |
| Ferramentas | 25 | Calculadora, "Uber ou estacionamento", índice de preços, uma página de preço e uma "mais barato" por aeroporto |
| Aeroportos | 23 | Página por aeroporto |

Padrões dos guias:

- **Gancho de calendário e de perfil.** Dia das Crianças, Natal e Réveillon, viagem em família,
  trabalho de 1 a 3 dias, 15 dias internacional, "vai voar de Azul por Viracopos?". Cerca de 20
  guias entre 27/09 e 27/10/2026.
- **Bloco "Índice xpark".** Menor, mediano e maior preço de 1 e de 7 diárias, número de
  estacionamentos e datas de coleta. É o formato de fato que motor generativo cita. A fraqueza é
  que o mesmo parágrafo se repete quase igual em todos os guias.
- **Metodologia, avaliações e selo** como páginas próprias, para sustentar a imagem de comparador
  independente.

### Bandeira Park (`bandeirapark.com.br`)

| Superfície | Volume no sitemap | O que é |
|---|---:|---|
| Blog | 33 posts (+ páginas de unidade e autor) | Posts de 3 a 5 minutos, publicados em lote em 20 e 21/08 e 06/09/2026 |
| FAQ | 53 | Por tema e por aeroporto ("vaga coberta ou descoberta em Confins") |
| Páginas comerciais | 4 "mais barato" + 5 unidades | `/estacionamento-mais-barato-<aeroporto>` com preço datado |
| Idiomas | PT, EN e ES | Site inteiro traduzido |

Padrões: perfil de viajante (voo de madrugada em GRU, VCP e CGH, viagem com crianças, viagem a
trabalho com nota fiscal, 15 dias), serviço próprio (valet, traslado, Clube Bandeira) e prova forte
de confiança (seguro de R$ 1 milhão, "zero roubos em 20 anos", página de autor).

### Indício de ligação entre os dois

O rodapé da Bandeira Park exibe o selo "Parceiro Xpark". A "menor diária no xpark" anunciada no topo
do site (R$ 7,98 por dia em 31+ dias) é o preço de 30 dias da Bandeira Park. O botão de WhatsApp da
Xpark tem o título "Fale com a Bandy". A página "Quem somos" da Xpark não diz quem é o dono. Se
forem do mesmo grupo, ocupam duas posições na mesma consulta com o mesmo interesse comercial.
**É indício, não fato verificado**, e não deve aparecer em texto publicado.

## 3. Quem ranqueia (03/11/2026)

| Consulta | Bandeira Park | Xpark | Movepark |
|---|---|---|---|
| quanto custa estacionar aeroporto guarulhos | 3º (página "mais barato") | fora do top 10 | 10º (`/estacionamentos/aeroporto-guarulhos`) |
| estacionamento aeroporto confins preço | 7º (unidade) | fora | fora |
| vale a pena deixar o carro no aeroporto ou ir de uber | fora | **2º** | fora |
| estacionamento viracopos mais barato | 1º e 7º | fora | 6º (Virapark) |
| é seguro deixar o carro no estacionamento do aeroporto | **2º** (blog) | fora | 9º (post de Curitiba) |
| estacionamento terminal 3 guarulhos | fora | fora | fora |
| voo atrasou estacionamento aeroporto | fora | fora | **2º** (FAQ do Recife) |
| vaga coberta ou descoberta aeroporto | **1º** (FAQ) e 4º (blog) | fora | **2º** (FAQ de Guarulhos) |
| estacionamento guarulhos 15 dias internacional | 4º (página "mais barato") | fora | fora |
| voo de madrugada guarulhos sem uber | 8º (blog) | fora | fora |
| estacionamento aeroporto congonhas preço | 3º (unidade) | fora | fora |
| estacionamento aeroporto natal réveillon | fora | fora | fora (a SERP entende "Natal" como o aeroporto de Natal) |
| carro danificado estacionamento aeroporto | fora | fora | fora (só tribunal, Jusbrasil e Reclame Aqui) |

Leituras:

1. A Bandeira Park ganha mais com **página comercial e FAQ** do que com blog.
2. A Xpark ganha a **consulta de decisão** (Uber ou estacionamento) com fórmula e ferramenta.
3. As **FAQs da Movepark já ranqueiam** em consulta de dúvida. Pergunta binária continua indo para
   `/faq/<slug>`, não para post.
4. "Natal" na frase-chave colide com o aeroporto de Natal: use "fim de ano" e "Réveillon".
5. "Carro danificado no estacionamento do aeroporto" não tem nenhum player do setor na primeira
   página.

## 4. Onde a Movepark ganha deles

- **Preço vivo de parceiro**, o mesmo do checkout, com data. O deles é coleta ou preço próprio.
- **Profundidade.** Eles escrevem de 1.000 a 1.500 palavras. A skill pede 3.000 ou mais, com
  tabela, bloco de fato do PostGIS e `FAQPage`.
- **Abrangência.** São 26 destinos publicados. Eles aprofundam em 4 ou 5.
- **Assunto que o vendedor não toca:** o que fazer quando dá problema, direito do consumidor e como
  escolher plataforma.

## 5. A pauta

Cada linha é uma subtarefa da Conteúdo 88, na ordem: a pauta 1 é a Conteúdo 89 e a pauta 16 é a
Conteúdo 104, todas com o Diego e com data entre 10/11/2026 e 29/01/2027. Toda pauta passa pelos quatro portões da skill
`blogpost-seo-geo` antes de escrever (frase-chave na cauda longa, canibalização no banco, intenção e
origem dos números).

| # | Tema | Frase-chave inicial | Tipo | O que faz ser melhor que o concorrente |
|---|---|---|---|---|
| 1 | Fim de ano e férias de janeiro: quanto custa deixar o carro no aeroporto | estacionamento aeroporto fim de ano | novo | Preço do motor na janela exata (23/12 a 04/01 e janeiro), nas praças com parceiro. A Xpark mostra preço genérico de outubro |
| 2 | Voo atrasou ou foi cancelado: quem paga a diária extra do estacionamento | voo atrasou estacionamento aeroporto | novo | Resolução 400 da ANAC, regra de excedente de cada pátio, como pedir reembolso. A FAQ já está em 2º |
| 3 | Uber ou estacionamento no aeroporto: a conta por bairro | vale a pena deixar o carro no aeroporto ou ir de uber | novo | Tabela bairro × aeroporto com corrida estimada no app (com data e horário, inclusive madrugada) contra o motor, e o ponto de equilíbrio em dias |
| 4 | Voo de madrugada em Guarulhos: como ir e voltar sem depender de app | voo de madrugada guarulhos | novo | Último trem e ônibus, van 24h de cada parceiro pela ficha. Depois VCP e CGH se render |
| 5 | Carro danificado ou furtado no estacionamento do aeroporto: o que fazer | carro danificado estacionamento aeroporto | novo | Súmula 130 do STJ, CDC, passo a passo (fotos, BO, imagens, Procon, juizado). Ninguém do setor ocupa |
| 6 | Vaga coberta ou descoberta no aeroporto: o guia nacional | vaga coberta ou descoberta aeroporto | novo | Diferença de preço por aeroporto pelo motor e clima por cidade (INMET). O post de VCP vira link interno |
| 7 | Carnaval 2027: quanto custa deixar o carro no aeroporto | estacionamento aeroporto carnaval | novo | Ninguém tem. Preço do motor na janela de 05 a 10/02/2027 |
| 8 | Onde pegar a van do estacionamento no desembarque de Guarulhos | van estacionamento desembarque guarulhos | novo | Ponto de encontro por terminal (T1, T2, T3). Intenção diferente dos posts de terminal |
| 9 | Viajar com crianças: carro, cadeirinha e malas no embarque | viajar com criança aeroporto carro | novo | Regra da cadeirinha em carro de app conferida no CONTRAN, custo de duas corridas contra a diária |
| 10 | Como escolher um site de reserva de estacionamento: o checklist | como escolher site reserva estacionamento aeroporto | novo | Disputa as FAQs de "melhor plataforma" da Xpark sem citar concorrente |
| 11 | Viagem a trabalho: nota fiscal e reembolso do estacionamento | nota fiscal estacionamento aeroporto | novo | Só o processo. A Movepark não promete nota (o Operator mostra NF como "em breve"), ADR-009 |
| 12 | Viagem internacional de 15 dias: quanto custa o carro parado em cada aeroporto | estacionamento 15 dias aeroporto | novo, com portão | Tabela cruzando aeroportos. Antes, checar canibalização com "quanto-custa-deixar-o-carro-no-aeroporto" e com os posts de longa permanência |
| 13 | Valet no aeroporto: como funciona e quando compensa | valet aeroporto | novo, com portão | Só se algum parceiro declarar valet na ficha. Sem isso vira FAQ |
| 14 | "Como reservar com pagamento antecipado" vira "vale a pena reservar online?" | vale a pena reservar estacionamento online | atualizar | Post de 2023 com 4.790 caracteres. Slug não muda |
| 15 | Guias antigos dos aeroportos viram "primeira vez no aeroporto" | primeira vez no aeroporto de <cidade> | atualizar | GRU, CGH, VCP, CWB e CNF, todos de 2024 com 6 mil a 12 mil caracteres. Slugs não mudam |
| 16 | Consolidar os Top 3 antigos de Curitiba e Congonhas | (a do vencedor) | consolidar | 7,6 mil e 7,4 mil caracteres disputando com o Top 5 da praça. 301 pelo `BLOG_CONSOLIDATED_SLUGS` |

**Fora das subtarefas, de propósito:**

- **Ranking nacional de preço por aeroporto** (oficial × particular, 22+ aeroportos). Já é a
  Conteúdo 71 (página-fonte do índice para a imprensa, prazo 21/11/2026). A pauta 1 usa o mesmo
  dado e linka para ela.
- **Micro-FAQs por aeroporto** (cancelar reserva, estorno de PIX, levar a chave, onde esperar a
  van). São perguntas binárias e vão para `/faq/<slug>`, pelo raciocínio de "O que foi publicado da
  cauda longa" no plano de conteúdo.
- **Estudo com dados de reserva** no molde do da Xpark. Em 03/11/2026 havia 54 reservas (17/09 a
  30/10), pouco para estudo. Volta quando a base sustentar.
