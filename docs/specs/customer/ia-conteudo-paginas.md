# Conteúdo por página — o que mostrar ao cliente

> Decisões editoriais para as páginas do Consumer App. Para cada página: o que manter, o que
> remover e o que adicionar. Critério: relevância > volume — menos seções bem preenchidas valem
> mais do que muitas seções vazias ou redundantes.

---

## Home (`/`)

### Objetivo em 3 segundos
O usuário entende que pode reservar vaga em aeroporto, sabe como começar (a busca) e percebe que
a marca é confiável.

### Manter

| Seção | Motivo |
|---|---|
| Hero + barra de busca | É a ação principal da página — não há negociação aqui. |
| Quick chips de aeroportos (abaixo da busca) | Atalho direto para os destinos mais comuns. Remove fricção pra quem já sabe onde vai. |
| Category strip | Permite filtrar por tipo de vaga antes de ver resultados. Útil para quem viaja com moto ou quer valet. |
| Aeroportos populares (grid) | Discovery para quem ainda não escolheu o destino, ou quer explorar. |
| Trust Band (4 selos) | Cancelamento grátis, preço travado, verificados, atendimento 24h — são os principais gatilhos de confiança antes de reservar. |
| Como funciona (3 passos) | Para novos usuários que nunca reservaram vaga assim. Deveria ser curto e direto. |
| CTA Seja parceiro | Fica no rodapé da página, sem competir com a busca. Necessário para aquisição B2B. |

### Remover

| Seção | Motivo |
|---|---|
| Testimonials / depoimentos | Já removido. Sem avaliações reais, o bloco seria placeholder e prejudicaria credibilidade. |
| Seção "Estacionamentos populares" (PopularParkingLots) | Redundante com os cards de aeroportos. Duas seções de discovery na mesma página dividem atenção sem agregar. Avaliar remoção permanente ou fusão com a grid de aeroportos. |

### Adicionar

| Seção | Contexto |
|---|---|
| Foto real no hero | Ainda placeholder. Sem foto, o hero perde impacto visual e a promessa do produto fica vaga. |
| Banner "reserva em uso hoje" (logado) | Se o usuário tem check-in hoje, mostrar no topo com link direto pro voucher. Pequeno esforço, alto valor para o momento de uso. |
| Buscas recentes (logado) | Carousel simples com as últimas 5 buscas do localStorage. Usuário recorrente retoma do ponto onde parou. |

### Ordem recomendada

1. Hero + busca + quick chips
2. Category strip
3. Aeroportos populares
4. Trust Band
5. Como funciona
6. CTA parceiro
7. Footer

---

## Resultados (`/search`)

### Objetivo
O usuário compara vagas de várias operadoras para o mesmo destino e período, e decide qual ver
em detalhe.

### Manter

| Elemento | Motivo |
|---|---|
| Header com contador + "editar busca" | Confirma o contexto da busca e permite ajustar sem sair da página. |
| Category pills | Filtragem rápida por tipo de vaga, sem abrir a sidebar de filtros. |
| Foto 4:3 no card | A principal âncora visual — o usuário precisa ver o que está comprando. |
| Título: tipo · operadora | Identifica de forma imediata o que é e de quem é. |
| Distância + até 3 amenidades chave | A distância é o segundo critério mais decisivo depois do preço. Amenidades chave (coberto, shuttle, valet) reduzem dúvidas. |
| Rating + número de avaliações | Prova social objetiva. **Mostrar só se houver pelo menos 1 avaliação** — estrela sem dado faz o oposto do esperado. |
| Preço total da estadia | Destaque visual à direita, com duração abaixo. Evita comparação de preço diário que confunde. |
| Badges comparativos (mais barato, mais perto, traslado grátis, coberto, valet) | Tiram o foco do "só preço" e ajudam a identificar o melhor custo-benefício. Máximo 2 por card. |
| Botão favoritar (coração) | Salvar para decidir depois. |
| Filtros laterais / bottom sheet mobile | Necessários para refinar a busca. |
| Estado "esgotado" | Card em opacidade reduzida + badge — o usuário não clica em algo que não pode reservar. |
| Empty state com sugestões | Reduz abandono quando não há resultado. |

### Remover / simplificar

| Elemento | Motivo |
|---|---|
| Badge "Vaga favorita" na foto | Dado interno de popularidade que o usuário não consegue verificar. Sem dados reais, é noise. Remover até ter métrica genuína. |
| Rating no card quando não há avaliações | Já coberto pela regra da spec, mas confirmar que o componente some de fato. |

### Adicionar

| Elemento | Contexto |
|---|---|
| Vista mapa | Em desenvolvimento. Para estacionamentos de aeroporto, distância e localização são decisivos — o mapa é diferencial claro. Prioridade alta. |
| Preço por duração no hover do card | Um tooltip rápido com "a partir de R$ X/dia" já contextualiza antes de abrir o detalhe. Evita clique e volta desnecessários. |

### Prioridade no card (de cima pra baixo)

1. Foto com badge comparativo sobreposto
2. Tipo de vaga · Operadora
3. Distância · amenidades chave
4. Rating (condicional)
5. Preço total + duração

---

## Listing / Detalhe (`/p/:operatorSlug/:locationSlug/:parkingTypeCode`)

### Objetivo
O usuário decide se reserva aqui. Tudo na página trabalha para responder: "vale a pena? é
confiável? eu sei chegar?". O reservation card é o destino final — o restante da página só
existe para justificar o clique em "Reservar agora".

### Manter

| Seção | Motivo |
|---|---|
| Cabeçalho: h1 + meta (rating, distância, IATA) | Orientação imediata — onde estou, o que é, quão bem avaliado. |
| Photo grid (5 fotos desktop, carrossel mobile) | A foto é o primeiro juízo de confiança. Grid de 5 mostra o lugar, não só uma câmera de segurança. |
| Sobre essa vaga (texto curto da operadora) | 1–3 frases do parceiro personalizam o que seria genérico. Limite de 200 chars mantém conciso. Texto padrão por tipo de vaga como fallback. |
| O que essa vaga oferece (amenidades, 2 colunas) | Checklist claro de comodidades. Modal "ver todas" só quando há mais de 8. |
| Avaliações (com critérios + lista) | Prova social detalhada — rating agregado + quebra por critério + cards de clientes reais. |
| Como chegar (aviso crítico + passo a passo + traslado + mini-mapa) | A maior ansiedade do usuário antes de confirmar é "eu sei chegar lá?". Esta seção mata esse medo. Prioridade alta. |
| Distâncias por terminal | Específico para aeroportos com múltiplos terminais (GRU T1/T2/T3). Elimina uma pergunta de suporte. |
| Política de cancelamento | O usuário precisa saber antes de inserir o cartão. Regra única da plataforma (grátis até 24h). |
| Conheça a operadora (card) | Humaniza a marca por trás da vaga. Logo + "N anos na Movepark" + badge verificado são suficientes. |
| Reservation card sticky | O destino de tudo. Preço, datas, passageiros, "Reservar agora". |

### Remover / simplificar

| Elemento | Motivo |
|---|---|
| Sub-cabeçalho compacto logo abaixo das fotos | "Coberta · 100 vagas · Operada por Aerovalet · GRU" duplica o h1. Avaliar fusão com o texto "Sobre essa vaga" ou remoção. |
| Outras localizações da operadora no card da operadora | Útil só se a operadora tiver mais de 1 localização no sistema. Esconder quando não houver para não mostrar seção vazia. |
| Critérios de avaliação sem dados | Se não há avaliações, a seção "Avaliações" some inteira — não mostrar rating zerado nem placeholder. |

### Adicionar

| Seção | Contexto |
|---|---|
| FAQ contextual da vaga | A edge `get-faq` já resolve `global + destination + location`. Falta renderizar no listing como accordion colapsado no rodapé do conteúdo, antes da operadora. Perguntas frequentes sobre aquele lote específico (cancelamento, traslado, como funciona o check-in) reduzem suporte. |
| Fotos reais (migration `location_photo`) | Ainda sem tabela de fotos por localização. Sem foto, o photo grid cai no placeholder — o que mina confiança na hora certa. Prioridade crítica antes do go-live das primeiras vagas. |

### Ordem recomendada da coluna esquerda

1. Sub-cabeçalho (avaliar remoção)
2. Sobre essa vaga
3. O que essa vaga oferece
4. Avaliações
5. Como chegar
6. Distâncias por terminal
7. Sobre a garantia
8. Política de cancelamento
9. FAQ contextual
10. Conheça a operadora

---

## FAQ (`/faq`)

### Objetivo
Central de ajuda para dúvidas antes e depois da reserva. O usuário chega com uma pergunta
específica — a busca é o elemento principal.

### Manter

| Elemento | Motivo |
|---|---|
| Busca por texto (com debounce) | A forma mais rápida de achar a resposta. |
| Categorias como filtro | Organiza por contexto (reserva, pagamento, check-in, cancelamento). |
| Accordion de perguntas e respostas | Padrão universal de FAQ — não quebrar. |
| Schema.org `FAQPage` no JSON-LD | SEO — perguntas e respostas aparecem no Google como rich result. |

### Remover

| Elemento | Motivo |
|---|---|
| FAQs que duplicam info do listing | Perguntas como "como funciona o traslado" ou "o que é vaga coberta" são específicas de cada lote — pertencem ao FAQ contextual do listing (via `destination` ou `location` scope), não à central geral. A FAQ global deve cobrir só o que vale para qualquer reserva Movepark. |

### Adicionar

| Elemento | Contexto |
|---|---|
| Destaque para as perguntas mais acessadas | Bloco fixo no topo com 4–5 perguntas de maior `sort_order` antes da busca. Reduz busca desnecessária para os casos mais comuns. |
| Link de retorno contextual | Se o usuário chegou via link do listing, mostrar "← Voltar para [nome da vaga]" no topo. |

---

## Destinos (`/destinos`, `/destinos/:slug`)

### Objetivo
Páginas de destino SEO: aparecem quando alguém busca "estacionamento aeroporto GRU" no
Google e chegam sem contexto de busca. O trabalho da página é converter essa intenção em
uma busca concreta.

### Manter

| Elemento | Motivo |
|---|---|
| Grid de destinos no índice | Overview de onde a Movepark opera. |
| Hero do destino com foto | Âncora visual. |
| Botão / CTA de busca para aquele destino | A conversão da página — leva direto pra `/search?dest=GRU`. |
| JSON-LD `TouristDestination` + `FAQPage` | SEO estruturado — diferencial nos rich results para queries de aeroporto. |

### Remover / adiar

| Elemento | Motivo |
|---|---|
| Seções genéricas sem conteúdo real | Um bloco "Sobre o Aeroporto de Guarulhos" copiado da Wikipedia não agrega valor e prejudica a percepção da marca. Só incluir conteúdo que a equipe Movepark rediga de fato. |
| Número de vagas se for zero ou placeholder | "0 vagas disponíveis" ou "em breve" prejudica mais do que ajuda. Esconder o contador enquanto não há operadores cadastrados naquele destino. |

### Adicionar

| Elemento | Contexto |
|---|---|
| FAQ específico do destino | A edge `get-faq` já suporta scope `destination`. Conteúdo de destino = perguntas sobre traslado ao terminal, cobertura vs descoberta, segurança, horários. É conteúdo único que o Google valoriza. Prioridade alta para SEO. |
| Número de operadoras e vagas disponíveis | "5 operadoras, 240 vagas disponíveis em GRU" — dado real, se existir. Não mostrar se não houver. |
| Dicas de chegada ao aeroporto | 2–3 frases sobre acesso ao aeroporto (não à vaga). Conteúdo editorial curto que diferencia a página de um simples agregador. |

---

## Navegação global e estados

### Topbar

**Manter:** wordmark + pill de busca (sticky após scroll na home) + entrar/conta + PT-BR.

**Avaliar remover:** "Seja parceiro" no topbar. Compete por atenção com o CTA principal
(reservar). O link já está no footer e na seção da home — uma terceira exposição no topbar
pode ser removida sem prejuízo.

### Footer

**Manter:** as 3 colunas (Suporte, Operadoras, Movepark) + legal band. Estrutura certa.

**Preencher antes do go-live:**
- `/sobre`, `/termos`, `/privacidade` precisam existir como páginas reais.
- `/ajuda` como alias ou redirect para `/faq`.
- "Carreiras" e "Imprensa" só incluir no footer quando as páginas existirem.

### Bottom nav mobile

**Manter:** Buscar · Favoritos · Reservas · Conta (logado). Não logado: Buscar · Ajuda · Entrar.

---

## Lacunas transversais

| Item | Impacto | Urgência |
|---|---|---|
| Fotos reais das vagas (`location_photo`) | Sem foto, listing e cards perdem o principal argumento visual | Crítica — resolver antes de captar primeiros parceiros |
| FAQ global com conteúdo real | `/faq` vazia ou com placeholders prejudica confiança | Alta |
| Textos "sobre a vaga" preenchidos pelas operadoras | Listing cai no fallback genérico sem o texto do parceiro | Alta — parte do onboarding do operador |
| Foto real no hero da home | Ainda placeholder | Média |
| Avaliações reais | Sem reviews, os blocos de rating somem em todo o Consumer App | Média — chegará com os primeiros clientes |
