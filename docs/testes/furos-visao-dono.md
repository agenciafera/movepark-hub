# Furos e insights da visão do dono de estacionamento

Achados da varredura da jornada do dono (parceiro) no painel `/operator`, feita em
24/07/2026 com o dono real `peu+operador@fera.ag` (owner da company **Abbapark**,
unidade Aeroporto Afonso Pena). O roteiro automatizado que cobre essa jornada é
`e2e/owner/O01-dono-jornada.spec.ts` (project `e2e-owner-tx`).

O foco é a experiência do dono, além do passou/falhou: o que está fácil, o que falta,
onde tem furo. Cada furo aponta o arquivo que comprova.

## Resumo

| # | Furo | Gravidade | Onde |
|---|---|---|---|
| F1 | O dono não vê as próprias reservas canceladas (**CORRIGIDO**) | Alta | `src/features/bookings/api.ts` (lista deixou de filtrar `deleted_at`) |
| F2 | Reservas de teste de segurança poluem a lista real do dono | Média | dados em produção (3 bookings "Test Pentest", valor R$ 0,00) |
| F3 | "Preço base · R$ 0,00" aparece em todo card de preço | Baixa | `src/routes/operator/pricing.tsx:59` |

Lacunas de administração (o que a vitrine/detalhe mostram e o dono não gerencia):
ver a seção "Lacunas de administração".

## F1 · O dono não consegue ver as reservas canceladas (Alta)

**Sintoma.** Em `/operator/bookings`, com o filtro Status em "Cancelada", a tela mostra
"Nenhuma reserva encontrada". O Abbapark tem 18 reservas canceladas no banco. Com o
filtro em "Todos", também não aparecem: só saem as concluídas.

**Causa.** Cancelar uma reserva faz soft-delete: o registro recebe `status = 'cancelled'`
**e** `deleted_at = now()` ao mesmo tempo. Isso acontece em três lugares:

- `supabase/migrations/20260624000000_public_api.sql:669` (RPC de cancelamento)
- `supabase/migrations/20260614000000_capacity_real.sql:352` (expiração/cancelamento)
- `supabase/migrations/20260630000000_payment_refund.sql:47` (estorno)

E a lista do painel filtra `deleted_at is null` (`src/features/bookings/api.ts:31`). Como
toda reserva cancelada tem `deleted_at` preenchido, o filtro "Cancelada" nunca retorna
nada. Ele é natimorto.

**Impacto.** O dono perde a visão de cancelamentos, que é operação e é dinheiro
(entender por que cancelam, conferir estorno, medir taxa de cancelamento). O funil de
Relatórios conta canceladas pelo status, mas a lista de reservas não deixa abrir uma
sequer.

**Direção de correção (a decidir).** "Cancelada" é um status terminal legítimo, não uma
exclusão. O caminho limpo é parar de setar `deleted_at` no cancelamento e liberar
capacidade pelo status. Cuidado: as consultas de capacidade hoje contam ocupação
filtrando `deleted_at is null`; tirar o soft-delete exige que elas passem a excluir
canceladas pelo status. É decisão de modelagem, não troca de uma linha só. Alternativa
paliativa: a lista do dono mostrar canceladas mesmo com `deleted_at` setado.

**Correção aplicada.** A RLS de `booking` (`booking_select`) já restringe as reservas às da
empresa e **não** filtra `deleted_at`, então quem escondia as canceladas era só o filtro
client-side. A lista do painel (`fetchBookings` em `src/features/bookings/api.ts`, usada pelo
operador e pelo manager) deixou de filtrar `deleted_at`. O `deleted_at` continua sendo o
"cancelada em" mostrado no detalhe, e a capacidade segue liberada por `release_booking_capacity`
(independe do `deleted_at`), então nada de capacidade muda. Não precisou de migration nem backfill.

**Cobertura.** `O-02` em `e2e/owner/O01-dono-jornada.spec.ts` (agora passa de verdade) e o teste
de regressão de CI `src/features/bookings/useBookings.test.tsx`, que falha se a lista voltar a
mandar `deleted_at` na query.

## F2 · Dados de teste de segurança na lista real do dono (Média)

Com o filtro em "Todos", as três reservas que aparecem são "Test Pentest", "Test Pentest 2"
e uma sem cliente, todas com **Valor R$ 0,00** e status Concluída. São artefatos de teste
de segurança que vazaram para produção e agora moram na visão de reservas de um parceiro
real. O código está certo; o problema é higiene de dados: convém limpar (cancelar ou
arquivar) para o dono não ver reserva de R$ 0,00 no painel dele.

## F3 · "Preço base · R$ 0,00" em todo card de preço (Baixa)

Na tela de Preços, cada card mostra "Preço base · R$ 0,00" (`src/routes/operator/pricing.tsx:59`),
porque `company_parking_type.base_price` está em 0 (placeholder). O próprio editor diz que
o preço base "não entra no cálculo" e serve de referência. Mostrar R$ 0,00 com destaque
confunde: parece que a vaga é de graça. Ou some quando é 0, ou vira o valor de referência
de verdade. É a pendência já conhecida de "seed de capacidade/base_price" (ver
`docs/specs/README.md`).

## Insights da jornada (não são furos)

- **Reserva pendente não conta como receita.** A aba Receita de Relatórios soma só
  `confirmed/checked_in/completed` (`src/features/reports/api.ts`). Uma reserva nova em
  `pending` aparece no funil de Reservas, mas não na Receita até ser paga. É o esperado,
  mas o dono precisa saber ler isso.
- **Mudar o preço propaga na hora.** Confirmado de ponta a ponta no `O-03`: o dono edita
  a diária em Preços, e o valor novo já sai na RPC `simulate_price` (a mesma da busca e do
  detalhe) e entra no snapshot da reserva que o consumidor cria em seguida. Não há defasagem
  de cache no caminho do consumidor (query fria a cada navegação).
- **A tela de Preços é clara.** Estratégia por tipo de vaga, faixas de diária editáveis,
  "Ver tabela" para simular, aviso de curva invertida. O caminho "editar e ver refletir" é
  direto.

## Lacunas de administração (vitrine e detalhe)

Levantamento do que a vitrine (card de busca) e a página de detalhe da unidade mostram ao
consumidor, cruzado com o que o dono consegue administrar hoje no `/operator`.

**A maior parte já é do dono.** Em `/operator/locations/:id/editar` e telas vizinhas ele
edita: foto de capa e galeria, endereço e mapa, amenidades, horário de funcionamento,
transfer (frequência e tempo ao terminal), aviso e passo a passo de "como chegar", política
de reserva da unidade, contato, capacidade, preço base e regras de preço, promoções,
serviços (add-ons) e FAQ da unidade. Ele também responde avaliações em `/operator/reviews`.
Isso cobre a vitrine inteira e quase todo o detalhe. As RPCs de escrita são gateadas por
escopo (`locations:write`, `parking-types:write`, `pricing:write`), em
`supabase/migrations/20260714000000_regate_operator_rpcs.sql`.

**O que o dono NÃO administra hoje (e quase tudo é de propósito):**

| Informação que o cliente vê | Onde aparece | Quem controla hoje | Onde comprova |
|---|---|---|---|
| Nome do tipo de vaga e a **descrição** do tipo | Card e corpo do detalhe | Catálogo global (hub_admin); o dono só seleciona o tipo | `src/routes/listing.tsx:322` (descrição) · `src/features/.../ParkingTypeForm.tsx:186` |
| Nome comercial da empresa (título do card e header) | Card e header do detalhe | Só hub_admin (sem rota nem policy de UPDATE de `company` para operator) | `src/features/search/ResultCard.tsx:212` · `src/routes/listing.tsx:253` |
| Linhas principais da política de cancelamento | Detalhe, bloco de cancelamento | Fixo em código; o dono só acrescenta 1 linha via política de reserva | `src/features/bookings/cancellation.logic.ts` (usado em `listing.tsx:506`) |
| FAQ global (dentro do "Ver todas") | Detalhe, FAQ | Só hub_admin; o dono vê como referência | `src/routes/operator/faq.tsx:55` (`showGlobal` read-only) |
| Distâncias a terminais | Card e detalhe | Derivado de PostGIS sobre `destination_point` (hub_admin) | `src/routes/listing.tsx:356` |
| Garantia Movepark | Detalhe | Copy de plataforma (código) | `src/features/guarantee/copy.ts` |

### Decisões sobre as lacunas (24/07/2026)

Revisadas com o produto. Quase todas as lacunas são intencionais:

- **Política de cancelamento e de reserva ficam com a Movepark.** A plataforma monetiza a
  política de cancelamento, então ela é da Movepark, não do estacionamento. O dono não
  administra isso, de propósito. **A verificar:** hoje o dono ainda consegue editar um campo
  `reservation_policy` da unidade (`src/features/locations/LocationSections.tsx:327`), o que
  contradiz a regra. Confirmar se esse campo deve sair da mão do dono.
- **Descrição do tipo de vaga fica global, com curadoria da Movepark.** O dono faz a gestão
  do tipo (marca coberta ou descoberta), mas não escreve a descrição. Na prática ele tende a
  não preencher, ou preenche mal ("essa é uma vaga coberta"), então é melhor a Movepark curar
  esse texto. Decisão: manter só a seleção do tipo no operator, sem campo de descrição.
- **FAQ global fica como visualização.** Interessa o dono ver que a Movepark já responde
  muita pergunta. Segue read-only por enquanto (`src/routes/operator/faq.tsx:55`).
- **Garantia e nome comercial são da plataforma.** Copy de garantia e nome comercial da
  empresa seguem com a Movepark.

### A construir (requisito que saiu desta varredura)

- **Área do dono para ver o acordo aceito.** A garantia da Movepark faz parte de um acordo
  que o dono aceita no onboarding. Ele precisa de uma tela para consultar esse acordo aceito,
  com o compromisso dele explícito: quantas vagas ele garante disponibilizar e vender pela
  plataforma.
- **Capacidade é compromisso de venda, não só disponibilidade declarada.** O número de vagas
  que o dono coloca na plataforma é uma garantia de que ele reserva e vende aquilo para a
  Movepark, separado do que ele monetiza no balcão. Exemplo: um estacionamento de 1000 vagas
  que já vende no balcão não coloca as 1000 aqui; ele separa, digamos, 100 (50 cobertas, 50
  descobertas) dedicadas à plataforma. Hoje a capacidade em
  `/operator/locations/:id/parking-types` é tratada como disponibilidade declarada. O produto
  e o discurso precisam amarrar que ela é uma alocação dedicada e um compromisso de venda. É
  decisão de negócio (candidata a épico), para o time avaliar.

**A verificar (a análise não fechou 100%):**
- Editar `base_price` depois de criado: no card do tipo em `/operator/locations/:id/parking-types`
  o preço base aparece read-only; o dono muda o efetivo pelas regras em `/operator/pricing`,
  mas não achei editor do `base_price` pós-criação. Confirmar se é lacuna ou decisão.

## Dashboard do dono (proposta com base em pesquisa)

Hoje o dashboard é pobre: quatro números do dia (Reservas Hoje, Check-ins, Check-outs, Receita
do Mês) e uma "Linha do tempo de hoje" (`src/features/dashboard/OperatorDashboard.tsx`). Não usa
nenhum RPC, não tem tendência e não olha pra frente. Quando a operação está zerada, o dono abre
o painel e vê tudo em R$ 0,00, sem leitura de negócio.

A pesquisa (dores de donos de estacionamento e o que os sistemas lá fora entregam) aponta o
caminho. As duas dores centrais: **demanda variável e difícil de prever**, e **falta de
visibilidade** ("sei que está cheio, mas não sei quando, por quê, nem quem"). Os bons sistemas
abrem com dinheiro primeiro, depois demanda, depois utilização. Adaptando ao modelo pré-pago do
Movepark (sem catraca, sem cobrança no balcão, com comissão), a proposta de dashboard fica assim.

Cada item traz a viabilidade: **[pronto]** sai de hook/RPC que já existe, **[corte novo]** é
agregação client-side nova sobre dados que já temos, **[backend novo]** precisa de RPC/endpoint.

**Bloco 1 · Dinheiro (topo)**
- Receita líquida do período (depois da comissão) e variação vs período anterior. [líquida:
  RPC `payout_statement` **pronto**; o Δ por unidade não existe hoje, é **corte novo** leve]
- Saldo a repassar e próximo repasse. [RPC `payout_balance` **pronto**]
- Diária média (ADR) e ticket médio. [ticket: **corte novo** simples; ADR por diária: **corte
  novo** sobre `price_breakdown`/dias]

**Bloco 2 · Demanda e futuro (a dor nº 1: prever)**
- Reservas do período e o ritmo (pace) vs período anterior: o olhar pra frente que orienta preço.
  [contagem: **pronto** via `useStatusFunnel`; pace: **corte novo**, viável sobre `check_in_at` futuro]
- Ocupação vs capacidade dedicada, por tipo de vaga, hoje e próximos dias. [RPC
  `operator_location_occupancy` **pronto** (uma unidade por chamada); visão multi-unidade pede
  **backend novo** (agregador)]
- Sinal "unidade em alta demanda hoje". [RPC `locations_high_demand_today` **pronto**, falta só o hook]

**Bloco 3 · Saúde da operação**
- Funil (criadas → confirmadas → concluídas) com taxa de cancelamento e no-show, contra a
  referência de mercado (os bons seguram cancelamento em 15% a 20%). [funil: `useStatusFunnel`
  **pronto**; **atenção:** a taxa de cancelamento depende do **F1**, porque as canceladas somem
  pelo soft-delete. O número só fecha depois de resolver o F1]
- Antecedência média das reservas (lead time), de `created_at` até o check-in. [**corte novo**]
- Mix de tarifa (Básica/Flex/Superflex) e canal (site vs API/bot). [**corte novo** sobre
  `fare_tier`/`origin`/`created_via_api_key_id`]
- Nota média e avaliações a responder. [colunas `review_avg`/`review_count` + `useOperatorReviews`, **pronto**]

**Bloco 4 · Operação do dia (o que a "linha do tempo" tenta ser)**
- Próximos check-ins e check-outs, hoje e nos próximos 7 dias, com placa e cliente. [extensão do
  `useTodayTimeline` atual, **corte novo** leve]

**O que pede backend novo** (o resto já sai de hook/RPC existente): comparativo período-anterior
por unidade, ocupação agregada de várias unidades numa chamada, RevPAR/RevPAS (receita por vaga
disponível), take-rate exposto como número e atribuição por origem escopada ao dono (o RPC de
atribuição hoje é só hub_admin).

**Ligações com o resto do doc:** a taxa de cancelamento (Bloco 3) só funciona depois do **F1**;
e a ocupação vs capacidade dedicada (Bloco 2) é a leitura visual do requisito "capacidade é
compromisso de venda".

## Referências

Pesquisa de julho/2026 sobre dores e KPIs de gestão de estacionamento:

- Gestão de lote e dores operacionais: [JustPark](https://www.justpark.com/business/blog/ultimate-guide-to-parking-lot-management/),
  [Trakaid](https://www.trakaid.com/5-parking-lot-management-problems-solutions/).
- Os 7 KPIs de dashboard, com financeiro primeiro: [AirGarage](https://www.airgarage.com/blog/parking-management-metrics).
- Aeroporto e yield (RevPAS, precificação dinâmica, no-show):
  [Parking Revenue Insider](https://parkingrevenueinsider.com/revenue-strategy/parking-yield-management-guide/),
  [Rezcomm](https://rezcomm.com/resources/blog/business/dynamic-pricing-revenue-stream-parking).
- Reserva pré-paga, o modelo mais próximo (ADR, RevPAR, cancelamento, no-show, lead time, booking
  pace): [Lighthouse](https://www.mylighthouse.com/resources/blog/hotel-performance-metrics-guide),
  [BEONx (lead time)](https://beonx.com/knowledge/articles/lead-time-what-it-is-how-to-calculate-it-and-why-it-matters-for-your-hotel/),
  [Hostaway (booking pace)](https://www.hostaway.com/glossary/booking-pace/).
