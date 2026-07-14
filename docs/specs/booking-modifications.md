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
| Proteção contra atraso de voo | benefício `flight_delay_protection` | ❌ | ❌ | ✅ |
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

- **Painel (staff):** hub_admin e operador da empresa cancelam/alteram como override no back-end
  (autorização por `profile_company`). Hoje não há botão de cancelar nas telas de operador/manager;
  o override existe na Edge e é usado por fluxos internos (webhook, delete-account, reconciliação).
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

## 8. Fase B (E2.8-h): alterar datas de reserva PAGA (mecânica confirmada)

Decisões de produto (jul/2026) que guiam a implementação:

- **Preço:** re-cota a vaga a **preço atual** (`simulate_price`), igual à troca de datas de reserva
  pendente. Uma estadia do mesmo tamanho pode mudar de valor se o preço mudou desde a compra. O delta
  é sempre `novo_total − booking.total_amount` (o total acumulado que a pessoa já pagou, incluindo
  upgrades). Cotação read-only já entregue: `reprice_booking_dates` (B1, migration `20260809000000`).
- **Delta > 0 (mais caro):** cobra o delta por **PIX** (`payment.kind='date_change'`, split 100%
  Movepark, padrão do `fare_upgrade`). As datas-alvo ficam em `payment.date_change_check_in_at/out_at`.
  **Segura a vaga nova já na cobrança** (hold): adquire a capacidade das novas datas no momento da
  cobrança e mantém as datas antigas até o pagamento. As novas datas só são aplicadas quando o
  **webhook** confirma o PIX (aí libera a capacidade antiga). Se o PIX **expira** sem pagar, libera o
  hold das novas datas e a reserva segue nas antigas (cleanup por expiração).
- **Delta < 0 (mais barato):** aplica as novas datas na hora e **estorna a diferença** (estorno
  parcial via gateway, reverte o split proporcional). É o "estorno parcial" descopado da E0.3.2.
- **Delta = 0:** aplica na hora.
- **Histórico:** registra em `booking_modification` (`date_change`, e `refund` quando estorna).
- **Front:** libera "Alterar datas" na reserva **confirmada**; mostra a diferença e o fluxo (pagar
  por PIX / confirmar estorno / confirmar).

Estágios: **B1** schema + cotação (✅); **B2** RPCs de hold/apply + Edge + ramo do webhook + expiração;
**B3** front; **B4** testes + deploy.

## 9. Divergência conhecida a alinhar

A página estática `src/routes/cancelamento.tsx` (marketing) ainda anuncia uma política de **3 faixas**
(48h = 100%, 24-48h = 50%, <24h = 0%) que **nunca foi implementada**. A política real é **binária por
Tarifa** (dentro da janela = estorno integral; fora = bloqueado). A página precisa ser alinhada à
regra vigente para não prometer reembolso parcial inexistente.
