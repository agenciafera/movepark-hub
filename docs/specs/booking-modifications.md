# Alterações de reserva gateadas pela Tarifa

**Épico:** E2.8 (Tarifas de flexibilidade) · **Regra de negócio:** PRD-12 (cancelamento) + MON-11 (Superflex).
**Status:** ✅ Definido. Cancelamento (bloqueio fora da janela) + trocas (data/veículo) sob um único modelo.

> Esta spec amarra **todas** as alterações que um cliente pode fazer numa reserva ao **benefício da
> Tarifa contratada**. A verdade é sempre o **servidor** (Edge Function); o front só espelha para
> exibir e evitar cliques que vão falhar. **Staff (hub_admin / operador da empresa) e a Public API
> por parceiro fazem override** e não passam por estes gates. Ver [fares.md](./fares.md) (catálogo e
> snapshots) e [booking-flow.md](./booking-flow.md) (ciclo de vida e estorno).

## 1. Modelo mental

Uma reserva carrega um **snapshot imutável** da Tarifa comprada, gravado na criação
(`_create_booking_core`): `booking.fare_tier`, `booking.fare_cancel_until`, `booking.fare_benefits`.
Toda alteração posterior é decidida **contra esse snapshot**, não contra o catálogo vivo (o catálogo
pode mudar de preço; a reserva não muda de regra depois de vendida).

Há **dois tipos de gate**, porque as flexibilidades têm naturezas diferentes:

| Alteração | Tipo de gate | Fonte no snapshot |
|---|---|---|
| **Cancelar** (com estorno) | **Janela de tempo** (até quando antes do check-in) | `booking.fare_cancel_until` |
| **Trocar datas** | **Benefício booleano** | `fare_benefits.date_change` |
| **Trocar veículo/placa** | **Benefício booleano** | `fare_benefits.plate_change` |

Cancelamento é **janela** (Básica/Flex = até 24h antes; Superflex = até 1 min antes). Trocas são
**flag booleana** (Básica não tem; Flex e Superflex têm), válidas enquanto a reserva ainda não começou.
Não existe janela de tempo separada para trocas: o modelo de Tarifa não define uma, então o gate é
"tem o benefício **e** falta acontecer o check-in".

### 1.1 Matriz Tarifa × ação (fonte da verdade)

Esta é a matriz canônica. É **travada por testes** nos três pontos (se um seed/migration ou um gate
divergir, o teste correspondente falha):

| Ação | Gate | **Básica** | **Flex** | **Superflex** |
|---|---|---|---|---|
| **Cancelar (com estorno)** | janela `cancel_window_minutes` → `fare_cancel_until` | até **24h** antes | até **24h** antes | até **1 min** antes |
| **Trocar datas** | benefício `date_change` (+ reserva `pending`) | ❌ | ✅ | ✅ |
| **Trocar veículo/placa** | benefício `plate_change` (+ `pending`/`confirmed`) | ❌ | ✅ | ✅ |
| Proteção de voo (atraso ou cancelamento) | benefício `flight_delay_protection` | ❌ | ❌ | ✅ |
| Suporte prioritário | benefício `priority_support` | ❌ | ❌ | ✅ |

Regras comuns a toda ação do cliente: sempre **antes do check-in**; **staff/parceiro fazem override**
de todos os gates; reserva `pending` (hold não pago) é cancelável a qualquer hora.

**Onde a matriz é travada:**
- **Seed do catálogo** (`fare.cancel_window_minutes` + `fare.benefits`): pgTAP
  [`supabase/tests/fare_action_matrix.test.sql`](../../supabase/tests/fare_action_matrix.test.sql).
- **Gates do front** (`customerSelfCancel`, `canCustomerChangeDates`, `canCustomerChangeVehicle`):
  Vitest [`src/features/bookings/booking-modifications.logic.test.ts`](../../src/features/bookings/booking-modifications.logic.test.ts).
- **Gates do servidor** (`refundDecision`, `dateChangeAllowed`, `plateChangeAllowed`): `deno test` em
  `supabase/functions/{cancel-booking,change-booking-dates,change-booking-vehicle}/logic.test.ts`.

Ao mexer em Tarifa (novo tier, nova flag, mudança de janela): atualize esta matriz **e** os três
testes no mesmo PR. O mapa ação → benefício booleano mora em `FARE_ACTION_BENEFIT` (`src/lib/fares.ts`).

## 2. Cancelamento (a regra que mudou)

**Decisão de produto (PO, jul/2026):** fora da janela grátis da Tarifa, o cliente **não cancela**.
O cancelamento fora do prazo deixou de ser "cancela sem reembolso" e passou a ser **bloqueado** para
o cliente. Racional: se não há reembolso, cancelar só serve para o cliente perder a vaga que já
pagou; a vaga fica presa de qualquer jeito (a política é sem estorno tardio), então a plataforma
mantém a reserva viva e encaminha exceções para o suporte/parceiro, que podem cancelar via override.

Matriz de decisão (`cancel-booking/logic.ts` · `refundDecision`), verdade no servidor:

| Situação | Cliente | Staff (override) |
|---|---|---|
| `cancelled` (terminal) | `noop` idempotente | `noop` |
| não `pending`/`confirmed` (checked_in/completed/no_show) | `noop` `not_cancelable` | `noop` |
| `pending` (hold não pago) | `cancel_no_refund` `pending` (só libera a vaga) | idem |
| `confirmed` + já estornado | `cancel_no_refund` `already_refunded` | idem |
| `confirmed` + pagamento não `paid` | `cancel_no_refund` `not_paid` | idem |
| `confirmed` + pago, **dentro** da janela | `cancel_with_refund` (estorno integral) | `cancel_with_refund` |
| `confirmed` + pago, **fora** da janela | **`blocked` `late_window`** (novo) | `cancel_with_refund` (override) |

Notas:
- **`pending` continua cancelável** independentemente da janela: é um hold não pago que só prende
  capacidade; bloquear seria hostil e inútil (ele expira sozinho). O bloqueio vale para o compromisso
  real, ou seja `confirmed` + pago.
- **Staff sempre pode cancelar antes do check-in** (override da janela). A RPC
  `cancel_booking_with_release` recusa reserva já iniciada, então nem staff cancela depois do check-in.
- A janela vem do **snapshot** `fare_cancel_until`. Reservas anteriores à E2.8 (sem snapshot) caem no
  **fallback de 24h** (`FREE_CANCEL_WINDOW_HOURS`, PRD-12).

### Resposta da Edge

`cancel-booking` (`POST /functions/v1/cancel-booking`, JWT do cliente ou staff):

- `blocked` → **HTTP 403** com `{ error, code: "cancel_window_closed" }`. Nada é escrito.
- `cancel_with_refund` → estorna via gateway (nunca cancela sem estornar) e chama a RPC única
  `cancel_booking_with_release`.
- `cancel_no_refund` → chama a RPC direto (sem estorno).
- `noop` → devolve o status atual sem efeito.

## 3. Trocas (data e veículo)

Já implementadas e coerentes com o modelo; esta spec apenas as documenta sob o mesmo guarda-chuva.

- **Trocar datas** (`change-booking-dates`): gate `fare_benefits.date_change === true` para o cliente;
  staff faz override. A RPC `change_booking_dates` exige reserva **`pending`** (paga é recusada com
  orientação de cancelar e refazer), re-segura capacidade do novo período, re-precifica, **recalcula
  `fare_cancel_until`** e dropa cupom. Fora do benefício → **403** "Sua Tarifa não permite alterar
  datas".
- **Trocar veículo/placa** (`change-booking-vehicle`): gate `fare_benefits.plate_change === true` para
  o cliente; staff override. Exige `status IN (pending, confirmed)`, valida que o veículo pertence ao
  titular, e **regenera o voucher** (a placa está no PDF). Fora do benefício → **403** "Sua Tarifa não
  permite trocar o veículo".

## 4. Espelho no front (não é a barreira, é a UX)

O front usa os mesmos snapshots para não oferecer ações que o servidor vai recusar.

- **`bookings-detail.tsx`** (detalhe da reserva do cliente):
  - Botão **"Cancelar reserva"** só aparece quando `customerSelfCancel(...)` permite: `pending`
    (qualquer hora) **ou** `confirmed` **dentro** da janela. `confirmed` fora da janela → o botão
    some e entra uma **nota de bloqueio** explicando que a janela da Tarifa encerrou e que o suporte
    pode avaliar exceções.
  - Botão **"Alterar datas"** só com `fare_benefits.date_change`, status `pending` e check-in futuro.
  - Botão **"Trocar veículo"** só com `fare_benefits.plate_change`, status `pending`/`confirmed` e
    check-in futuro.
- **`CancelBookingDialog.tsx`**: renderiza o estado certo (grátis com reembolso / hold não pago /
  bloqueado). No estado bloqueado o botão de confirmar fica **desabilitado** (defesa extra; o botão
  de abrir o dialog já não aparece).
- Lógica pura testável: `customerSelfCancel` (`cancellation.logic.ts`) e `canCustomerChangeDates` /
  `canCustomerChangeVehicle` (`booking-modifications.logic.ts`), mais `isWithinFareCancelWindow` /
  `cancelWindowLabel` (`src/lib/fares.ts`). Os botões "Alterar datas" e "Trocar veículo" do detalhe
  usam esses gates (não condições inline).

## 5. Override de staff e Public API

- **Painel (staff):** hub_admin e a equipe da empresa cancelam/alteram como override no back-end.
  Desde 26/11/2026 a equipe precisa do **escopo** da ação (`bookings:cancel` para cancelar,
  `bookings:write` para datas, placa, proteção de voo e upgrade), conferido em
  `_shared/booking-actor.ts`; antes bastava o vínculo em `profile_company`. A tela da reserva tem
  Cancelar, Trocar placa e o card **Alterar reserva** (§8.7). Exceção ao override: a troca de datas
  de reserva Básica pela equipe da empresa cobra o upgrade para o Flex (§8.7).
- **Public API por parceiro** (`POST /v1/bookings/:id/cancel`, escopo `bookings:cancel`): é
  **company-scoped** (`api_cancel_booking(p_company_id, ...)`), ou seja o parceiro cancelando reserva
  da própria empresa, equivalente a staff. **Não** passa pelo gate de janela do cliente. Ver
  [public-api.md](./public-api.md).

## 6. Enforcement e testes

- **Onde vive a regra:** a janela e o `blocked` moram na Edge (`cancel-booking/logic.ts`), coerente
  com a arquitetura atual (a RPC `cancel_booking_with_release` é `service_role`, só valida status e
  idempotência; não há caminho de cancelamento do cliente que não passe pela Edge). Não há migration
  nova nesta entrega.
- **Testes (travam a matriz da §1.1):**
  - pgTAP `supabase/tests/fare_action_matrix.test.sql`: seed do catálogo (janela + flags) por tier.
  - `deno test` em `cancel-booking/logic.test.ts` (`refundDecision`: `blocked` fora da janela Flex/
    Superflex, override de staff, `pending` cancelável), `change-booking-dates/logic.test.ts`
    (`dateChangeAllowed`) e `change-booking-vehicle/logic.test.ts` (`plateChangeAllowed`) por tier.
  - Vitest `src/features/bookings/booking-modifications.logic.test.ts`: matriz dos 3 tiers × 3 ações.
  - Vitest `cancellation.logic.test.ts` e `CancelBookingDialog.test.tsx`: estados do cancelamento.

## 7. Histórico de alterações (auditoria)

Toda alteração relevante da reserva é registrada em **`booking_modification`** (migration
`20260808000000`): `type` (`cancel`/`date_change`/`vehicle_change`/`fare_upgrade`/`refund`),
`actor_id` + `actor_role` (`customer`/`staff`/`system`), `changes` (de→para em jsonb),
`amount_delta_cents` (+ cobrado / − estornado) e `reason`. Escrita centralizada por
`log_booking_modification` (SECURITY DEFINER, **só `service_role`**; anon/authenticated revogados,
senão inseririam histórico falso). RLS de leitura: dono da reserva, hub_admin e operador da empresa.
As Edges `cancel-booking`, `change-booking-dates` e `change-booking-vehicle` gravam o log ao concluir.
A extensão por atraso de voo mantém a tabela própria `booking_fare_extension`. pgTAP:
`supabase/tests/booking_modification.test.sql`. (`fare_upgrade`/`refund` do webhook entram na Fase B.)

## 8. Fase B (E2.8-h): alterar datas de reserva PAGA

### 8.1 Regra de 17/11/2026 (substitui as decisões de jul/2026)

Decidida pelo Kallef em 17/11/2026, depois de a simulação com reservas reais mostrar que a regra de
jul/2026 ("re-cota a vaga a preço atual", "split 100% Movepark") cobrava R$ 80 de quem só mudava o
dia da viagem quando a tabela tinha subido (MP-BD9A16), cobrava para encurtar quando a tabela tinha
pacote e deixava o estacionamento sem receber pelos dias a mais.

| # | Decisão | Consequência |
|---|---|---|
| 1 | A diferença sai da **tabela da compra**. A reserva guarda, ao nascer, o preço de cada duração (`booking.price_by_days`, de 1 até 30 dias além da estadia, teto 90). O motor de preço não muda. | Mudar só o dia, com a mesma quantidade de diárias, não custa nada. Tabela que sobe depois não pesa na reserva. |
| 2 | Reserva sem a tabela guardada (anterior a 17/11/2026, ou duração fora da faixa) usa a **diferença entre as durações pela tabela de hoje**: `tabela(nova) − tabela(atual)`. | Mesmo nas antigas, mudar só o dia não custa nada. |
| 3 | **Encurtar segue a tabela**: se a estadia menor custa mais (pacote da Pare Seguro: 15 dias R$ 350, 13 dias R$ 375,70), cobra a diferença. O Kallef recusou a trava "encurtar nunca cobra". | A prévia mostra antes; o Termo 6.3 v6 avisa. |
| 4 | A diferença é **da vaga**: divide como a reserva (comissão congelada, E0.3.12) e entra no extrato do estacionamento (`payout_*` passaram a contar `kind in ('booking','date_change')`). A **tarifa** é sempre da Movepark e nunca entra na diferença, nem na cobrança nem no estorno. | No estorno, sai do estacionamento a parte dele nas diárias devolvidas e da Movepark a comissão delas (decisão do Kallef em 17/11/2026, depois de eu ter descrito a conta de hoje ao contrário: a proporção do total incluía a tarifa e tirava R$ 45,10 em vez de R$ 49,13 num estorno de R$ 57,80). |
| 5 | O **cupom continua**: percentual refeito sobre o novo valor (com o teto `max_discount_amount`), fixo mantido sem passar do novo valor. Cupom da Movepark volta para a base do repasse, como na reserva. | A troca não apaga mais `booking_coupon`. |
| 6 | Pagamento da diferença por **PIX ou cartão**. O cartão vai pela Edge `create-card-charge` com `date_change` (mesmo split, antifraude, parcelamento congelado e cartão salvo do checkout). A equipe (Mia, painel) gera PIX. | Os Termos v5 já prometiam "PIX ou cartão"; o Kallef escolheu fazer o cartão em vez de mudar o texto. |

### 8.2 Como funciona

- **Cotação única** `reprice_booking_dates(booking, entrada, saída)`: devolve `days` (com a tolerância
  da unidade, a mesma conta da criação), `days_before`, `price_source` (`compra`/`hoje`),
  `delta_cents`, `new_total_cents`, `subtotal_new`, `coupon_discount_new`, `partner_base_delta_cents`,
  `available`, `reason`. Abaixo do mínimo da tabela devolve "Nesta unidade o mínimo é de N diárias."
  O delta é `(subtotal_novo − cupom_novo) − (subtotal_atual − cupom_atual)` somado ao total atual,
  então upgrades e outros componentes do total ficam como estão.
- **Prévia** (`dry_run: true` na Edge `change-booking-dates-paid`): a tela do cliente e a Mia mostram
  o valor antes de qualquer cobrança. O clique manda `expected_delta_cents`; se a cotação mudou até
  lá, a Edge recusa (409 `quote_changed`) em vez de cobrar ou devolver outro valor.
- **Delta > 0:** segura a vaga nova (`hold_paid_date_change`) e cobra a diferença (PIX nesta Edge,
  cartão na `create-card-charge`). A cobrança grava a cotação em `payment.date_change_quote`, e o
  webhook aplica **essa** conta, não um re-preço na hora do pagamento. Cartão aprovado na hora aplica
  na hora. PIX vencido ou cartão recusado soltam a vaga (o webhook solta antes de gravar o status,
  porque a liberação só age em cobrança pendente). Só uma troca viva por reserva: antes de outra, os
  PIX de diferença abertos são anulados no gateway e a vaga deles é solta (`cancelPendingDateChanges`).
- **Delta < 0:** aplica na hora e estorna a diferença na cobrança da reserva. A cobrança guarda
  `date_change_refunded_cents` e `date_change_partner_refund_frac` (fração da perna do estacionamento
  devolvida), que o extrato usa no lugar da proporção do total (`payment_partner_refund_ratio`; sem
  estorno de datas, a conta é a de sempre). Recusa do gateway não desfaz a troca: a devolução vai
  para a fila manual do Manager (`payout_refund_manual`), e marcar como paga soma só o que a linha
  devolveu (`20261204150000`).
- **Delta = 0:** aplica na hora.
- **Gravação** `apply_paid_date_change(..., p_actor_role, p_quote)`: grava exatamente a cotação
  (total, diárias, subtotal, cupom), registra `staff` quando é a equipe, e a troca vai ao white-label.
- **Cancelamento depois de uma troca:** devolve o que sobrou da cobrança da reserva (não o valor
  cheio de novo) e também as cobranças extras (diferença de datas, upgrade de tarifa). Antes só a
  cobrança da reserva voltava.
- **Aviso ao cliente** (`notifyDatesChanged`): novas datas e o que aconteceu com o dinheiro (pagou,
  devolvido no PIX ou no cartão, ou devolução pela equipe). O caminho do estorno não mandava aviso.

### 8.3 Onde a regra aparece para o cliente

Termos de Uso v6, item 6.3 (`20261204160000`); FAQ global "Como funciona a alteração de datas da
reserva?" (pt, en, es) e o ajuste de "Como cancelo uma reserva?" (`20261204170000`); comparativo de
tarifas (`FareComparisonDialog`); a instrução do chat do site; a base do operador e as ferramentas da
Mia para operadores (`quote_date_change`).

### 8.4 Limites conhecidos

- Com o **estorno híbrido** ligado (chave hoje desligada), a parte que o gateway debita direto do
  estacionamento segue a proporção do total; o extrato registra a parte certa das diárias.
- Os relatórios de canal e os resumos diários (`commission_channel_report`, `team_digest_*`,
  `partner_daily_digest`) ainda contam só a cobrança da reserva.
- O formulário de cartão da troca (`DateChangeCardForm`) repete os campos do checkout em vez de
  compartilhar um componente com o `Step4Payment`.

### 8.5 Histórico

Implementação E2.8-h (jul/2026): **B1** cotação `reprice_booking_dates` (migration `20260809000000`);
**B2.1** RPCs `hold_paid_date_change`/`apply_paid_date_change`/`expire_paid_date_change_hold`;
**B2.2** Edge `change-booking-dates-paid` + ramo `date_change` do webhook + cron
`cron_expire_date_change_holds`; **B3** front `ChangeDatesPaidDialog` + gate
`canCustomerChangePaidDates`. Regra nova: migrations `20261204140000` (tabela da compra, cotação,
gravação, extrato) e `20261204150000` (reembolso manual parcial). Até 17/11/2026 nenhuma cobrança de
diferença nem estorno parcial tinha acontecido em produção (3 trocas, todas com diferença zero).

### 8.6 Dias a mais no balcão (26/11/2026)

A mesma tabela da compra serve o balcão para cobrar quem sai depois do combinado (pedido do Kallef em
26/11/2026). A RPC `booking_extra_days_table(booking)` (migration `20261208110000`) devolve as
diárias pagas (`price_breakdown.days`, ou as datas com a tolerância), a tolerância da unidade e o
preço de tabela da estadia reservada e de até 30 dias a mais: pela `price_by_days` quando ela cobre a
estadia, senão pelo `simulate_price` de hoje (`price_source` diz qual). O valor a cobrar é
`tabela(diárias da saída real) − tabela(diárias pagas)`, a regra da decisão 1 acima, com piso zero
(estadia maior que custa menos não vira devolução no portão). A conta da saída real está em
`extraDays.logic.ts` e a tela no card **Dias a mais** (`operator-panel.md` §4.2). Isto só informa: a
cobrança acontece no balcão, fora do Hub, como o excedente da proteção de voo. pgTAP
`booking_extra_days_table`.

### 8.7 A equipe altera datas e faz upgrade pelo cliente (26/11/2026)

Pedido do Kallef em 26/11/2026; desenho e decisões em
[`docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md`](../superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md).
Card **Alterar reserva** na tela da reserva do Hub (Operator e Manager), reserva confirmada, antes da
entrada, com `bookings:write`:

- **Alterar datas** (`StaffChangeDatesDialog`): a mesma Edge `change-booking-dates-paid` e a mesma
  conta do cliente (§8.1). A equipe só gera PIX (cartão é do cliente, ADR-004), com QR na tela, o
  código para copiar e uma mensagem pronta para o WhatsApp. A tela relê a reserva a cada 3 segundos
  enquanto o PIX espera e avisa "Pagamento recebido".
- **Básica (sem `date_change`) pela equipe da empresa:** a troca cobra o **upgrade para o Flex**
  junto (D1). Com diferença das diárias positiva, um PIX só: `kind = date_change`,
  `fare_target_tier = flex`, valor = diferença + upgrade, e o `buildSplit` põe o upgrade inteiro na
  perna da Movepark (`chargedCents` somado, `baseCents` = diferença), então o extrato do
  estacionamento, que lê a perna dele no `payment.split`, não conta o plano. O webhook aplica
  **primeiro** as datas (`apply_paid_date_change` grava o total da cotação) e **depois** o upgrade
  (`apply_fare_upgrade` soma o plano e refaz a janela de cancelamento). Com diferença zero ou
  negativa, a Edge responde 409 `fare_upgrade_first`: a janela gera o PIX do upgrade
  (`create-fare-upgrade`) e, quando a reserva vira Flex, faz a troca, que vale na hora e devolve a
  diferença pelo caminho de sempre.
- **Equipe da Movepark (hub_admin):** pode mandar `waive_fare_upgrade` com `reason` (o upgrade é
  receita da Movepark, D6); o histórico registra `fare_upgrade` com `changes.waived`.
- **Balcão sem `finance:read`:** a Edge tira `current_total`, `new_total` e `total_amount` da
  resposta; fica a diferença e o upgrade, que são preço de tabela.
- **Fazer upgrade** (`StaffFareUpgradeDialog`): a Edge `create-fare-upgrade` aceita a equipe com
  `bookings:write` (antes só o dono). PIX 100% Movepark, mesmas regras do cliente.
- **Histórico:** o upgrade aplicado passa a entrar em `booking_modification` ("Plano alterado para
  Flex"), o que antes não acontecia; a troca paga pela equipe fica como `staff` (o papel vai na
  cotação gravada no pagamento).
- Testes: `deno test` em `_shared/booking-actor.test.ts`, `change-booking-dates-paid/logic.test.ts`,
  `create-fare-upgrade/logic.test.ts`, `mcp/operator.logic.test.ts`; Vitest em
  `staffChange.logic.test.ts`, `StaffChangeDatesDialog.test.tsx`, `StaffFareUpgradeDialog.test.tsx`,
  `BookingDetailView.test.tsx` e `bookingHistory.logic.test.ts`.

### 8.8 Estender a saída com o carro no pátio (26/11/2026)

Parte 2 do mesmo desenho. O caso mais comum do balcão é "a volta atrasou e o carro já está aí", e
até aqui ninguém resolvia isso pelo Hub: a cotação recusava entrada no passado e a vaga só era
segura em reserva confirmada antes do check-in.

- **Quem e quando:** só a equipe com `bookings:write`, depois do horário de entrada, em reserva
  `confirmed`, `checked_in` ou `completed` **sem `checked_out_at`** (o `cron_complete_bookings`
  conclui uma hora depois da saída prevista, com o carro lá) e com a saída prevista há no máximo 30
  dias. O cliente não estende pela conta (Termos 6.3).
- **Conta:** a Edge `change-booking-dates-paid` com `extend: true` chama `reprice_booking_dates` e
  `hold_paid_date_change` com `p_extension` (migration `20261208120000`). A entrada não muda, a saída
  tem de ser maior que a reservada, a diferença é a da troca (tabela da compra, cupom continua) com
  **piso zero**: estadia maior que custa menos (pacote) não devolve, e o valor da vaga fica como
  estava (D4; Termos 7.3). Sem upgrade da Básica (D5): é cobrança de dias a mais, não troca de
  reserva. Estadia mínima, data mínima e antecedência não se aplicam.
- **Dinheiro:** diferença positiva vira PIX `kind = date_change`, dividido como a reserva, com a vaga
  dos dias novos segura até o PIX vencer (a liberação é a mesma da troca). Diferença zero aplica na
  hora. O webhook grava pela mesma `apply_paid_date_change`.
- **Status:** a reserva **não** volta de `completed` para `checked_in`. A conclusão dispara cashback,
  clube e indicação, e `booking_guard_status_transition` não deixa voltar; a extensão muda só a
  saída. (O desenho falava em voltar o status; ficou assim depois de ler os gatilhos.)
- **Tela:** o card **Dias a mais** ganha **Cobrar pelo Hub** (`ExtendStayPanel`) para a saída
  escolhida: prévia do servidor, PIX com QR e mensagem para o WhatsApp, e "Pagamento recebido"
  quando a reserva relida já tem a saída nova. O balcão segue podendo cobrar na retirada, por fora do
  Hub, como antes: as duas formas estão nos Termos v7 (item 4.3).
- **Cloudpark (gate G-CP):** a extensão não chega à cancela (a fila de integração só dispara na
  confirmação). Na unidade com `integration_connection` ativa a prévia traz `access_provider` e a
  tela avisa para ajustar a saída da placa na Cloudpark. Falta confirmar com Nationpark e Abbapark
  como a cancela trata quem sai depois do horário.
- **Termos v7** (`20261208130000`): 4.3 com as duas formas de cobrar e "sair antes não devolve";
  6.3 com "depois do check-in, só o estacionamento estende". As FAQs que dizem "paga na saída pela
  tabela do próprio estacionamento" continuam verdade (é uma das formas) e não foram reescritas.
- Testes: pgTAP `booking_extension` (16, no vivo dentro de transação desfeita) e a regressão
  `paid_date_change_tabela_da_compra` (24, com e sem a migration); `deno test` de `extensionDenial`;
  Vitest `ExtendStayPanel.test.tsx` e os casos do card em `BookingDetailView.test.tsx`.

## 9. Divergência conhecida a alinhar

A página estática `src/routes/cancelamento.tsx` (marketing) ainda anuncia uma política de **3 faixas**
(48h = 100%, 24-48h = 50%, <24h = 0%) que **nunca foi implementada**. A política real é **binária por
Tarifa** (dentro da janela = estorno integral; fora = bloqueado). A página precisa ser alinhada à
regra vigente para não prometer reembolso parcial inexistente.
