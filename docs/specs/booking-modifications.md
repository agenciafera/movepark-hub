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
- Lógica pura testável em `cancellation.logic.ts` (`customerSelfCancel`, `cancellationStatus`) e
  `src/lib/fares.ts` (`isWithinFareCancelWindow`, `cancelWindowLabel`).

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
- **Testes:**
  - `supabase/functions/cancel-booking/logic.test.ts` (`deno test`): `blocked` para cliente fora da
    janela (Flex 24h e Superflex 1 min), override de staff fora da janela, `pending` sempre cancelável.
  - `src/features/bookings/cancellation.logic.test.ts` (Vitest): `customerSelfCancel` em cada estado.
  - `src/features/bookings/CancelBookingDialog.test.tsx` (Vitest): estados grátis / bloqueado.

## 7. Divergência conhecida a alinhar

A página estática `src/routes/cancelamento.tsx` (marketing) ainda anuncia uma política de **3 faixas**
(48h = 100%, 24-48h = 50%, <24h = 0%) que **nunca foi implementada**. A política real é **binária por
Tarifa** (dentro da janela = estorno integral; fora = bloqueado). A página precisa ser alinhada à
regra vigente para não prometer reembolso parcial inexistente.
