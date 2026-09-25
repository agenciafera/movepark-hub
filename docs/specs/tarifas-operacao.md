# Operação das Tarifas: como cada benefício funciona na prática

> **Épico:** E2.8 (Tarifas de flexibilidade) · **Complementa** [fares.md](./fares.md) (catálogo,
> snapshot, receita) e [booking-modifications.md](./booking-modifications.md) (gates de alteração).
> **Status:** documento de operação e plano de adequação, escrito em 17/09/2026 a partir do código
> vivo e do banco de produção (`mgaigbezdalbyuqiofcf`).

As outras duas specs respondem "como está modelado". Esta responde a pergunta que vem depois, e que
ninguém tinha escrito: **quando o cliente compra Flex ou Superflex, o que exatamente acontece, quem
opera, onde se configura e o que ainda não existe.** Vale como contrato: linha de benefício que a
tela mostra sem operação por trás é promessa vazia, e a oferta vincula o fornecedor (CDC art. 30,
mesma razão do ADR-009).

## 0. Legenda de estado

| Símbolo | Significa |
|---|---|
| ✅ | Funciona fim a fim hoje, com gate no servidor e superfície para o cliente usar |
| 🟡 | A mecânica existe no backend, mas falta operação: ninguém consegue acionar, ou falta config, ou falta um pedaço financeiro |
| ❌ | Só existe como texto na tela. Não há nada por trás |

**Contexto que muda a leitura:** a base tem **zero reservas** (`select count(*) from booking` = 0 em
17/09/2026). Nada do que está abaixo precisa de migração de dados nem de compatibilidade com reserva
antiga. Estamos ajustando antes do primeiro cliente, que é a hora barata.

## 1. Quadro geral

Catálogo conferido no banco em 17/09/2026 (tabela `public.fare`, fonte única global):

| Benefício (chave) | Básica | Flex R$ 12,90 | Superflex R$ 24,90 | Estado |
|---|---|---|---|---|
| Cancelamento grátis (`free_cancellation`) | até 24h | até 24h | até **1 min** | ✅ |
| Confirmação por e-mail (`email_confirmation`) | ✅ | ✅ | ✅ | ✅ |
| Vaga garantida (`guaranteed_spot`) | ✅ | ✅ | ✅ | 🟡 |
| Avisos por WhatsApp (`notifications_sms`) | ❌ | ✅ | ✅ | 🟡 |
| Troca de placa/veículo (`plate_change`) | ❌ | ✅ | ✅ | ✅ |
| Alteração de data/horário (`date_change`) | ❌ | ✅ | ✅ | ✅ |
| Proteção contra atraso de voo (`flight_delay_protection`) | ❌ | ❌ | ✅ | 🟡 |
| Suporte prioritário (`priority_support`) | ❌ | ❌ | ✅ | ❌ |

Duas leituras incômodas saem do quadro:

1. **A Básica e a Flex se diferenciam por três linhas, e duas delas não operam sozinhas.** Tirando a
   troca de placa e a alteração de data, o que a Flex entrega a mais é "avisos por WhatsApp", que
   hoje são dois eventos e dependem de template aprovado na Meta.
2. **A Superflex cobra o dobro por três linhas: cancelar até 1 min, proteção de voo e suporte
   prioritário.** A primeira funciona. A segunda existe no banco e ninguém consegue acionar pela
   interface. A terceira não existe em lugar nenhum do código além do rótulo.

## 2. Benefício a benefício

### 2.1 Vaga garantida (todas as tarifas) 🟡

**O que o cliente entende:** se eu chegar e não tiver vaga, a Movepark resolve.

**Como funciona hoje:** é promessa de plataforma, não de tarifa. A regra operacional é realocar em
parceiro próximo cobrindo a diferença, ou devolver 100% mais crédito. A implementação é só de front
(`src/features/guarantee/`), o selo some quando `check_availability` devolve `sold_out`, e o
acionamento é humano: o botão "Acionar garantia" no detalhe da reserva abre o WhatsApp da unidade
(`location.phone`) ou cai no suporte central. Ver [spot-guarantee.md](./spot-guarantee.md).

**Onde se configura:** em lugar nenhum. A copy vive em `src/features/guarantee/copy.ts` e muda por PR.

**O que falta:**
- `MOVEPARK_SUPPORT.whatsapp` está **vazio** hoje, então o caminho de suporte central cai em e-mail.
  Para uma promessa de socorro em pé de balcão de aeroporto, e-mail não serve.
- Não existe registro de acionamento. Sem uma tabela de ocorrência, ninguém sabe quantas vezes a
  garantia foi usada, quanto custou nem qual parceiro a gerou.
- A linha aparece nas três colunas da tabela comparativa, então ocupa espaço sem diferenciar. Ela
  pertence ao rodapé "incluso em qualquer tarifa", não ao grid.

### 2.2 Confirmação por e-mail (todas as tarifas) ✅

**Como funciona hoje:** ao confirmar o pagamento, o `pagarme-webhook` (e o `mock-payment` no MVP)
chama `sendBookingConfirmationEmail` (`supabase/functions/_shared/booking-confirmation.ts`). O envio
é **exatamente uma vez** por reserva, reivindicado por UPDATE condicional em
`booking.confirmation_email_sent_at`; se o SMTP falhar, o campo é limpo e a próxima reentrega tenta
de novo. O destinatário é o snapshot do pedido (`booking.customer_email`) e só cai no `auth.users`
se faltar. O e-mail leva o resumo e o link `/bookings/<code>`, de onde sai o voucher.

**Onde se configura:** remetente em `app_setting.partner_email_from` (hoje `contato@movepark.co`),
editável no Manager. Credenciais SMTP do SES nos Edge Secrets (`SES_SMTP_*`). O **conteúdo** do
template é código (`_shared/email.ts`, `tplBookingConfirmation`), por ADR-007: muda por PR, nunca
por banco.

**O que falta:**
- **É o único e-mail transacional do cliente**, junto do pedido de avaliação (cron
  `review-request-hourly`). Não existe e-mail de cancelamento, de estorno, de alteração de data, de
  troca de veículo nem de lembrete de check-in. Quem cancela hoje não recebe nada por escrito, o que
  é ruim de atendimento e pior de prova.
- O remetente do cliente reusa a chave `partner_email_from`, que nasceu para o funil de parceiro.
  Merece chave própria (`customer_email_from`) antes que alguém troque uma e quebre a outra.
- Não há log de envio. `confirmation_email_sent_at` responde por uma mensagem só.
- Não há "reenviar confirmação" no Manager nem no Operator, e essa é a primeira coisa que o
  atendimento vai pedir.

### 2.3 Cancelamento grátis (24h / 24h / 1 min) ✅

**Como funciona hoje:** na criação, a reserva grava `fare_cancel_until = check_in − cancel_window_minutes`.
Dentro da janela, o cliente cancela e recebe **estorno integral**. Fora da janela, o cliente **não
cancela**: a Edge devolve 403 `cancel_window_closed` e o front esconde o botão, mostrando a nota de
que o prazo encerrou. Staff (hub_admin e operador) cancela como override a qualquer momento antes do
check-in. Reserva `pending` (hold não pago) é sempre cancelável. Matriz completa em
[booking-modifications.md](./booking-modifications.md).

**Onde se configura:** `/manager/tarifas`, campo de janela por tarifa (`cancel_window_minutes`,
gravado por `admin_set_fare`). Mudança no catálogo **não** altera reserva já vendida, porque a
reserva carrega o snapshot.

**O que falta:**
- A página `/cancelamento` (marketing) ainda anuncia três faixas de reembolso (48h = 100%,
  24 a 48h = 50%, menos de 24h = 0%) que **nunca existiram**. A política real é binária por tarifa.
  Isso é exposição direta de CDC e precisa ser alinhado, não adiado.
- Superflex cancela até 1 minuto antes com estorno integral. A vaga foi tirada do mercado até esse
  instante e o parceiro não recebe nada por ela. Enquanto o volume é pequeno é custo de aquisição
  aceitável; é o tipo de linha que merece medição desde a primeira reserva.

### 2.4 Avisos por WhatsApp (Flex e Superflex) 🟡

**Como funciona hoje:** o sender é `_shared/whatsapp.ts` (Cloud API da Meta, mensagens de template),
e ele degrada como o e-mail: sem config ou sem template, loga e segue, nunca derruba o chamador. O
gate é o snapshot `booking.fare_benefits.notifications_sms`, conferido em dois pontos:

| Evento | Onde dispara | Template (env) |
|---|---|---|
| Reserva confirmada | `pagarme-webhook` | `WHATSAPP_BOOKING_CONFIRMED_TEMPLATE` |
| Reserva estendida por atraso de voo | Edge `extend-booking` | `WHATSAPP_BOOKING_EXTENDED_TEMPLATE` |

O telefone vem do snapshot do pedido (`booking.customer_phone`), que é **obrigatório** no passo 1 do
checkout (`validateStep1Identity`), então não há reserva Flex sem número para entregar. O número
digitado ali é dica, nunca credencial (ADR-006).

**Onde se configura:** Edge Secrets `WHATSAPP_OFFICIAL_PHONE_NUMBER_ID`, `WHATSAPP_OFFICIAL_TOKEN`,
`WHATSAPP_OFFICIAL_API_VERSION`, `WHATSAPP_OFFICIAL_TEMPLATE_LANGUAGE` (os mesmos do OTP de login,
que já roda em produção) mais os dois nomes de template acima. O texto de cada template é aprovado
**na Meta**, não no nosso banco.

**O que falta:**
- **Os dois templates de reserva precisam existir e estar aprovados na Meta**, e os secrets setados.
  Enquanto não estiverem, o cliente Flex paga R$ 12,90 e não recebe **nenhum** aviso, em silêncio,
  porque o sender degrada de propósito. Esse silêncio é o pior modo de falha de todo o conjunto.
- "Avisos" no plural, hoje, são dois eventos, e o segundo só a Superflex alcança. Na prática a Flex
  compra **um** aviso. A régua precisa ser definida e implementada (proposta em §4).
- Não existe log de notificação. Ninguém consegue responder "o aviso foi entregue?" sem abrir log de
  Edge, e não há idempotência para o dia em que um cron reenviar.
- Não há queda para e-mail quando o WhatsApp falha.

### 2.5 Troca de placa/veículo (Flex e Superflex) ✅

**Como funciona hoje:** o cliente abre a reserva, clica em "Trocar veículo" e escolhe outro veículo
da própria conta. A Edge `change-booking-vehicle` confere o benefício `plate_change`, o status
(`pending` ou `confirmed`), que o check-in ainda não aconteceu e que o veículo pertence ao titular;
troca `booking.vehicle_id`, **regenera o voucher** (a placa está no PDF) e grava em
`booking_modification`. Staff faz override e pode digitar a placa direto (`license_plate`), pelo
botão "Trocar placa" na `BookingDrawer` do operador.

**Preço:** não muda. A troca de veículo não re-precifica nada, porque o preço é do tipo de vaga e da
estadia, não do carro.

**O que falta:**
- **A unidade integrada por white-label não fica sabendo.** O outbox `wl_delivery` modela
  `reserve` e `release`, não `update`. Numa unidade WL, a portaria segue com a placa antiga, que é
  exatamente a dor que a troca prometia resolver. Em unidade com checkout do Hub o problema não
  existe, porque o painel do operador lê a placa do banco.
- Não há limite de trocas nem aviso à unidade. Uma troca na véspera não notifica ninguém do lado do
  parceiro.

### 2.6 Alteração de data/horário (Flex e Superflex) ✅ com nuance

Esta é a que mais gera dúvida, então vai em detalhe. **Sim, o cálculo é refeito, sempre, e a preço
de hoje.** Nunca se reaproveita o preço da compra.

**Caso A: reserva ainda não paga (`pending`).** RPC `change_booking_dates`
(`20260722000000_change_booking_dates.sql`), via Edge `change-booking-dates`. Em uma transação:
re-segura a capacidade do novo período, **re-precifica com `simulate_price`** mais o desconto
automático, recalcula `fare_cancel_until` sobre o novo check-in, **dropa o cupom** e reescreve
`total_amount` e o `price_breakdown`. O cliente paga o valor novo.

**Caso B: reserva paga.** Edge `change-booking-dates-paid`, fase B da E2.8-h, já no ar. Primeiro
cota sem tocar em nada (`reprice_booking_dates`, read-only: devolve novo total, delta e
disponibilidade). O delta é `novo_total − booking.total_amount`, contra o total acumulado que a
pessoa já pagou, upgrades inclusos. Daí:

| Delta | O que acontece |
|---|---|
| **> 0** (ficou mais caro) | Cobra a diferença por PIX (`payment.kind = 'date_change'`, 100% Movepark no split). A vaga nova é segurada **já na cobrança**, e as datas antigas continuam valendo até o pagamento. O webhook aplica as datas novas e libera as antigas. Se o PIX expira, o cron `expire-date-change-holds` (a cada 5 min) devolve o hold e a reserva segue nas datas antigas |
| **< 0** (ficou mais barato) | Aplica as datas na hora e estorna a diferença (estorno parcial no gateway) |
| **= 0** | Aplica na hora |

Em ambos os casos o **cupom cai** e a **tarifa é preservada** (o `fare_price_cents` entra no novo
total, e a janela de cancelamento é recalculada sobre o novo check-in). Tudo fica em
`booking_modification`.

**Uma consequência que precisa estar na copy:** estadia do mesmo tamanho pode custar diferente, se o
preço da unidade mudou desde a compra. "Alteração de data/horário" não promete manter o preço, e a
tela precisa dizer isso antes do clique, não depois.

**A conta usa a tolerância da unidade.** `location.tolerance_minutes` está em **60 em todas as 21
unidades**: passar até uma hora do horário não vira diária nova. Isso importa para a próxima seção,
porque atraso pequeno já está coberto de graça, para qualquer tarifa.

**O que falta:**
- Aviso ao parceiro e ao white-label, mesmo problema do §2.5: em unidade WL o sistema do parceiro
  fica com as datas antigas.
- A copy do comparativo não diz que a alteração re-precifica.

### 2.7 Proteção contra atraso de voo (Superflex) 🟡

**O que o cliente entende:** meu voo atrasou, eu não pago diária extra.

**Como funciona hoje:** existe a RPC `extend_booking_flight_delay`
(`20260718000000_fare_flight_extension.sql`), `SECURITY DEFINER`, exposta só ao `service_role`. Ela
exige o benefício no snapshot, status `confirmed` ou `checked_in`, nova saída depois da atual,
**re-segura a capacidade** de cada dia acrescentado (respeitando `blocked` e a capacidade com
reservas externas) e estende `check_out_at` **sem tocar em `total_amount`**. Grava em
`booking_fare_extension`. A Edge `extend-booking` chama a RPC (dono da reserva **ou** staff) e manda
o aviso por WhatsApp.

**O buraco, em quatro partes:**

1. **Ninguém consegue acionar pela interface.** Não existe botão, tela ou fluxo, nem no cliente, nem
   no operador, nem no manager: `grep` por `extend-booking` em `src/` não acha nada além do tipo
   gerado. Hoje só se aciona com uma chamada HTTP manual. A Superflex vende um benefício que a
   interface não oferece.
2. **Não há limite.** A RPC aceita qualquer nova data futura. O dono da reserva pode chamar a Edge
   com o próprio JWT e estender cinco dias de graça, sem comprovar atraso nenhum. Como não há UI, o
   risco é baixo hoje; no dia em que a UI existir, sem limite ela é um buraco de receita.
3. **Ninguém paga a diária extra.** O total não muda, então o repasse ao parceiro também não. Na
   prática o parceiro daria a diária de graça, e nenhum parceiro aceita isso por contrato. A
   proteção é um custo da Movepark e precisa virar lançamento financeiro, não silêncio.
4. **Não chega ao parceiro.** Sem propagação para o white-label (o outbox não modela `extend`) e sem
   aviso à unidade, a portaria acha que o carro virou pernoite não pago.

Somando: o benefício existe como encanamento e não existe como produto.

### 2.8 Suporte prioritário (Superflex): fora do catálogo desde 25/09/2026

Decisão do Kallef: sem demanda fora do horário comercial, o benefício sai da Superflex por ora
(`fare.benefits.priority_support = false` em todo o catálogo, migration `20261125100000`). No lugar,
o atendimento humano ganhou porta única e horário declarado: o **chamado de atendimento** na
reserva (ver [chamado-de-atendimento.md](./chamado-de-atendimento.md)), respondido de segunda a
sexta, das 9h às 18h. Reserva já vendida com o benefício congelado continua com o selo em Conversas.
O texto abaixo é o histórico de como estava antes.

#### Como estava (histórico)

**O que existe no código:** o rótulo em `src/lib/fares.ts`, a coluna no comparativo, a flag no seed
e o teste que confere a flag. Nada mais. `grep -rn "priority_support"` devolve cinco arquivos, todos
de catálogo, rótulo ou teste. **Não há roteamento, fila, SLA nem sinal visível para quem atende.**

**Onde o atendimento acontece hoje:** a caixa `/manager/conversas` (Mia), cujas conversas moram no
banco do beast-bots e chegam pela Edge `mia-inbox`. A lista ordena por recência e marca lida ou não
lida. Não existe prioridade, dono, fila nem tempo de primeira resposta.

**Consequência:** "suporte prioritário" é, hoje, a linha mais frágil do comparativo. É a única que o
cliente percebe **quando já está com problema**, e a única que não tem absolutamente nada por trás.

## 3. Onde cada coisa se configura (mapa único)

| O que | Onde | Quem muda | Vale a partir de |
|---|---|---|---|
| Preço, janela, benefícios, "Mais popular", ativo | `/manager/tarifas` → RPC `admin_set_fare` → `public.fare` | hub_admin | Reservas **novas** (as vendidas guardam snapshot) |
| Rótulo dos benefícios (copy do comparativo) | `src/lib/fares.ts` (`FARE_BENEFIT_LABELS`) | PR + deploy | Próximo build |
| Remetente dos e-mails | `app_setting.partner_email_from` | Manager | Imediato |
| Credenciais de e-mail | Edge Secrets `SES_SMTP_*` | hub_admin no Supabase | Imediato |
| Conteúdo dos e-mails | `supabase/functions/_shared/email.ts` (ADR-007) | PR + deploy da Edge | Deploy |
| Credenciais e templates de WhatsApp | Edge Secrets `WHATSAPP_OFFICIAL_*`, `WHATSAPP_BOOKING_*_TEMPLATE` | hub_admin | Imediato, **depois** de aprovado na Meta |
| Texto do template de WhatsApp | Painel da Meta (fora do repo) | hub_admin | Após aprovação da Meta |
| Tolerância de saída por unidade | `location.tolerance_minutes` (formulário da unidade) | operador/manager | Cotações novas |
| WhatsApp central de suporte | `src/features/guarantee/copy.ts` (vazio hoje) | PR + deploy | Próximo build |

Regra que vale para todas as linhas: **catálogo muda o futuro, nunca o passado.** A reserva decide
por `fare_tier`, `fare_price_cents`, `fare_cancel_until` e `fare_benefits` gravados na compra.

## 3a. Templates do WhatsApp a aprovar na Meta (1.1)

Um segredo por evento na Edge (`supabase secrets set`), com o nome do template aprovado. Os
parâmetros do corpo saem nesta ordem.

| Segredo | Evento | Parâmetros do corpo |
|---|---|---|
| `WHATSAPP_BOOKING_CONFIRMED_TEMPLATE` | reserva confirmada | nome, código |
| `WHATSAPP_BOOKING_REMINDER_TEMPLATE` | lembrete de entrada (24h) | nome, código, unidade, data e hora da entrada |
| `WHATSAPP_BOOKING_CHECKOUT_TEMPLATE` | lembrete de retirada (2h) | nome, código, unidade, data e hora da saída |
| `WHATSAPP_BOOKING_CANCELLED_TEMPLATE` | cancelamento | nome, código |
| `WHATSAPP_BOOKING_CHANGED_TEMPLATE` | datas ou veículo alterados | nome, código, novo período ou nova placa |
| `WHATSAPP_BOOKING_EXTENDED_TEMPLATE` | saída estendida (voo) | nome, código, nova saída |

Sem o segredo, o evento sai por e-mail e o `notification_log` registra o canal usado.

**Criados em 23/09/2026** na WABA `449333654922434` (número `456610384191644`, +55 11 99475-2952),
categoria UTILITY, idioma pt_BR, pela Graph API com o token de usuário de sistema que já era
segredo da Edge. **Os seis foram aprovados no mesmo dia** (em cerca de 25 minutos) e os
segredos acima já apontam para eles; um envio de teste da confirmação e do lembrete de entrada
chegou ao cliente de teste. Se um template for pausado ou reprovado depois, o envio falha e o
aviso cai para e-mail (o `notification_log` mostra o canal).

| Template | Corpo |
|---|---|
| `movepark_reserva_confirmada` | Oi, {{1}}. Sua reserva {{2}} está confirmada. O voucher já está na sua conta na Movepark. Boa viagem! |
| `movepark_lembrete_entrada` | Oi, {{1}}. Sua entrada está chegando: reserva {{2}}, em {{3}}, a partir de {{4}}. Leve o voucher no celular e chegue com alguns minutos de folga. |
| `movepark_lembrete_retirada` | Oi, {{1}}. Sua reserva {{2}}, em {{3}}, termina em {{4}}. O carro vai estar pronto para retirada. Se precisar de mais tempo, veja as opções na sua conta na Movepark. |
| `movepark_reserva_cancelada` | Oi, {{1}}. Sua reserva {{2}} foi cancelada. Se houver reembolso, ele volta pelo mesmo meio de pagamento. Qualquer dúvida, é só responder aqui. |
| `movepark_reserva_alterada` | Oi, {{1}}. Sua reserva {{2}} foi atualizada. O que vale agora: {{3}}. O voucher na sua conta já está com os dados novos. |
| `movepark_saida_estendida` | Oi, {{1}}. A saída da reserva {{2}} foi estendida para {{3}}. Não precisa fazer mais nada: o estacionamento já sabe. |

Mudar o texto de um template é criar outro (a Meta reaprova) e trocar o segredo; o envio não
tem como saber o corpo, só o nome. O segredo `WHATSAPP_OFFICIAL_API_VERSION` subiu de `v13.0`
(descontinuada) para `v21.0` no mesmo dia.

## 3b. Feito em 23/09/2026

- **2.5, 2.6, 2.7 (proteção de voo):** botão "Meu voo atrasou" na reserva do cliente (Superflex,
  confirmada ou em uso, até 120 min depois da saída, uma vez) e card "Proteção contra atraso de
  voo" na tela da reserva do Manager e do Operator; a RPC exige o número do voo, limita a 24h e
  credita o parceiro pela diária extra (`payout_debt_settlement.kind = 'flight_extension_credit'`,
  valor pelo motor de preço na parte do parceiro). Número do voo opcional no checkout da Superflex.
  A copy de /cancelamento deixou de dizer "estende sozinha".
- **Cancelamento:** tarifa sem janela deixou de cair no fallback de 24h; a troca de data recalcula
  a janela a partir da reserva, não do catálogo.
- **Placa:** o servidor bloqueia depois do carimbo de check-in (§2.5 voltou a ser verdade).
- **Matriz da ficha:** comparativo, tooltips, selo, barra de confiança e resumo SSG leem
  `get_unit_fares` (1.4 e 1.5 feitos junto).
- **E-mail de confirmação:** a reconciliação (webhook perdido) passou a enviar e-mail e WhatsApp.
- **Suporte prioritário (fase 3, Q-028):** prioridade derivada na `mia-inbox` pelo telefone
  (`booking_priority_for_phones`), fila ordenada e selo "Superflex · SLA 15 min" em Conversas, que
  fica vermelho com o tempo de espera quando o SLA estoura.
- **Avisos (2.1 a 2.4):** trilho único em `_shared/notify.ts` com `notification_log`
  (idempotência por reserva, evento e canal): WhatsApp para Flex e Superflex quando o template
  existe; senão, e em falha, e-mail. Cron `booking-reminders` (entrada em 24h, retirada em 2h).
  Avisos de cancelamento, troca de data (pendente e paga), troca de veículo e extensão. E-mails
  transacionais novos: lembrete de entrada, lembrete de retirada, datas alteradas, veículo
  alterado, saída estendida. Falta só a aprovação dos templates na Meta (1.1), que é da Movepark;
  até lá, o benefício é entregue por e-mail.
- **Propagar ao parceiro (2.8):** troca de data (pendente e paga) e extensão por voo liberam a
  reserva vigente no white-label e reservam de novo com id versionado (`<id>#2`, `#3`...); o
  cancelamento libera a versão vigente. Placa não vai: o sync do WL só entende disponibilidade.
- **Vaga garantida (1.3 e o registro):** WhatsApp central preenchido da fonte única; o acionamento
  fica em `guarantee_claim` e a Movepark fecha com desfecho e valor (ver spot-guarantee.md).

## 4. O que precisa ser feito (plano de adequação)

Cada item virou atividade no Backlog do ClickUp em 17/09/2026, na série **E2.8-i** a **E2.8-t**.

Ordenado por "o que dói se um cliente comprar amanhã".

### Fase 1: parar de prometer o que não entrega (bloqueia a venda da Flex e da Superflex)

| # | Item | Onde | Por quê |
|---|---|---|---|
| 1.1 | Aprovar os dois templates de WhatsApp na Meta e setar os secrets | Meta + Edge Secrets | Sem isso a Flex não entrega nada e falha calada |
| 1.2 | Alinhar `/cancelamento` à política real (binária por tarifa) | `src/routes/cancelamento.tsx` | Anuncia reembolso parcial que não existe. Exposição de CDC |
| 1.3 | Preencher o WhatsApp central de suporte | `src/features/guarantee/copy.ts` | A garantia de vaga hoje cai em e-mail |
| 1.4 | Dizer no comparativo que alterar data re-precifica | `FareComparisonDialog` + copy da tela | Evita a discussão de "por que mudou o preço" no atendimento |
| 1.5 | Tirar "vaga garantida" do grid e pôr como linha "em qualquer tarifa" | `FareComparisonDialog` | Ocupa três colunas sem diferenciar |

### Fase 2: fechar os dois benefícios que existem pela metade

| # | Item | Onde | Nota |
|---|---|---|---|
| 2.1 | **Régua de avisos** por WhatsApp: confirmação, lembrete 24h antes do check-in, lembrete de retirada, aviso de cancelamento/estorno, aviso de alteração aplicada | Novo cron + pontos já existentes | Transforma "avisos" no plural em verdade |
| 2.2 | **`notification_log`** (canal, evento, reserva, destino, status, id externo) com chave de idempotência | Migration nova | Sem ele não há reenvio seguro nem resposta a "foi entregue?" |
| 2.3 | Queda para e-mail quando o WhatsApp falhar | `_shared` | O cliente pagou pelo aviso, não pelo canal |
| 2.4 | E-mails transacionais faltantes: cancelamento, estorno, alteração de data, troca de veículo | `_shared/email.ts` (ADR-007) | Vale para todas as tarifas, não só Flex |
| 2.5 | UI da **proteção contra atraso de voo**: botão "Meu voo atrasou" no detalhe da reserva (Superflex), com nova saída dentro do limite | `bookings-detail.tsx` + Edge existente | Hoje o benefício é inacessível |
| 2.6 | **Limite** da proteção travado na RPC (proposta: até 24h de extensão, uma vez por reserva) | `extend_booking_flight_delay` | Sem limite, é extensão infinita de graça |
| 2.7 | **Lançamento financeiro** da diária estendida: a Movepark paga o parceiro pela diária de cortesia | Repasse / `booking_item` de cortesia | Sem isso o parceiro banca o benefício que a Movepark vendeu |
| 2.8 | Propagar alteração ao parceiro: `update` no `wl_delivery` (troca de placa, datas, extensão) e aviso à unidade | Outbox WL + WPS | A portaria precisa da verdade, senão o cliente é barrado no balcão |

### Fase 3: dar corpo ao suporte prioritário

Proposta: **prioridade é derivada, nunca gravada** (mesmo princípio do §1.2 da automação de
marketing). A Edge `mia-inbox` já é o portão entre a caixa e o Hub. Ela consulta o Hub pelo telefone
da thread, descobre se há reserva ativa e com que tarifa, e devolve a etiqueta junto da conversa. A
tela ordena a fila por prioridade e mostra o selo. O bot não precisa saber de nada, e não nasce uma
segunda verdade para envelhecer.

| # | Item | Nota |
|---|---|---|
| 3.1 | Definir o SLA que a Superflex compra (proposta: primeira resposta humana em até 15 min, das 6h às 23h; fora disso, primeira da fila na abertura) | Decisão de negócio, precisa caber na escala do time |
| 3.2 | `mia-inbox` devolve `prioridade` por thread (derivada da tarifa da reserva ativa) | Lembrar: campo novo tem que ser copiado no portão **e** no teste |
| 3.3 | Fila ordenada + selo na `/manager/conversas` | Quem atende precisa ver sem procurar |
| 3.4 | Medir tempo de primeira resposta por tarifa | Sem medição, "prioritário" é adjetivo |

## 5. Decisões de negócio em aberto

As seis viraram cards de Questionamento no Backlog do ClickUp (Q-025 a Q-030) em 17/09/2026, com a
sugestão junto para não travar por falta de opinião.

Precisam de resposta antes da implementação correspondente. Sugestão em cada uma, para não travar.

| # | Pergunta | Sugestão |
|---|---|---|
| Q-025 | Quanto a proteção de voo estende, e quantas vezes? | Até 24h a mais, uma vez por reserva, acionável até o horário de saída mais a tolerância. Acima disso, vira alteração de data normal |
| Q-026 | Exigir número do voo para acionar a proteção? | Pedir opcional no checkout da Superflex e obrigatório no acionamento. Permite conferir o atraso depois e abre caminho para o disparo automático |
| Q-027 | Quem paga a diária estendida ao parceiro? | Movepark. É o custo do produto que a Movepark vendeu, e a margem da Superflex cobre |
| Q-028 | Qual o SLA do suporte prioritário? | 15 min em horário estendido. Prometer 24/7 sem plantão é criar a próxima promessa vazia |
| Q-029 | A troca de placa e de data tem limite? | Sem limite por enquanto, mas com contador em `booking_modification` para revisitar com dado |
| Q-030 | Cancelamento Superflex a 1 min: compensa o parceiro? | Não neste momento. Medir a frequência desde a primeira reserva e revisitar |

## 6. O que isso exige de teste

Segue a pirâmide do projeto, sem exceção por ser "operação":

- **pgTAP**: limite da extensão de voo (aceita dentro, recusa fora, uma vez por reserva); idempotência
  do `notification_log`; matriz de benefício continua travada em `fare_action_matrix.test.sql`.
- **deno test**: régua de avisos (qual evento dispara para qual tarifa), queda para e-mail, novos
  templates de e-mail, prioridade devolvida pelo `mia-inbox`.
- **Vitest**: gate do botão "Meu voo atrasou" por tarifa e status; copy do comparativo depois de 1.4
  e 1.5; fila ordenada da caixa de conversas.
- **Regressão**: todo item da Fase 1 que muda copy entra com o teste de contrato que impede a
  promessa de voltar.

## 7. Referências

- [fares.md](./fares.md): catálogo, snapshot, receita e split da tarifa.
- [booking-modifications.md](./booking-modifications.md): matriz canônica tarifa × ação.
- [spot-guarantee.md](./spot-guarantee.md): garantia de vaga.
- [capacidades-unidade.md](./capacidades-unidade.md) e ADR-009: por que unidade externa não vende
  tarifa (`LocationCapabilities.fares`), e por que bloco de promessa não renderiza sem capacidade.
- [caixa-de-entrada-conversas.md](./caixa-de-entrada-conversas.md): a caixa da Mia e a armadilha do
  portão que não copia campo novo.
- [marketing-automation.md](./marketing-automation.md): motor de campanhas, caso a régua de avisos
  reuse a máquina de jornada em vez de um cron próprio.
