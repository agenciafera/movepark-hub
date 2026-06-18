# Booking Flow — Ciclo de Vida da Reserva

> **Modelo de capacidade (implementado):** a vaga é **reservada na criação do `pending`**
> (`create_booking_atomic` segura `location_parking_availability.booked_count` por data, com
> `expires_at = now() + 30 min`) — **não** na confirmação do pagamento. A confirmação **não**
> re-incrementa. O hold é liberado (`release_booking_capacity`) no **cancelamento** e na
> **expiração** de `pending` não pago, que vira **`cancelled`** (não `no_show`) via
> `cron_expire_pending_bookings` (pg_cron `expire-pending-bookings`, a cada 5 min).
> `minimum_stay`/`minimum_date`/antecedência são validados na criação. Ver
> [capacity-rules.md](./capacity-rules.md).

## State Machine

### Estados

| Status | Descrição | Visível ao usuário |
|---|---|---|
| `pending` | Reserva criada, aguardando pagamento | ✅ |
| `confirmed` | Pagamento confirmado | ✅ |
| `checked_in` | QR escaneado, veículo no estacionamento | ✅ |
| `completed` | Saída registrada, reserva encerrada | ✅ |
| `cancelled` | Cancelada (pelo usuário ou sistema) | ✅ |
| `no_show` | Não compareceu dentro do prazo | ✅ |

> No legado os status eram: `new`, `in_progress`, `complete`, `canceled`, `expired`, `refund-requested`.
> No Hub os nomes foram normalizados para o domínio real de estacionamento.

### Transições válidas

```
pending ──────→ confirmed   (pagamento aprovado)
pending ──────→ cancelled   (falha no pagamento / cancelamento antes do pagamento)
pending ──────→ cancelled   (expires_at ultrapassado sem pagamento — job libera o hold)

confirmed ────→ checked_in  (QR escaneado na entrada)
confirmed ────→ cancelled   (cancelamento após pagamento — inicia reembolso)
confirmed ────→ no_show     (não compareceu — transição automática por job)

checked_in ───→ completed   (saída registrada)
checked_in ───→ cancelled   (emergência operacional)

completed ────→ (terminal — sem transições)
cancelled ────→ (terminal — sem transições)
no_show ──────→ (terminal — sem transições)
```

---

## Sequência de checkout

### 1. Simulação de preço

```
GET /api/price-simulation
  params: location_id, parking_type_id, check_in_at, check_out_at, coupon? 

→ Retorna: price, old_price, coupon_discount, total
```

- O motor de preço (`pricing_rule`) é consultado com base no `location_parking_type`
- Disponibilidade de vagas é verificada para todas as datas do período
- Coupon é validado se fornecido (ver [coupon-rules.md](./coupon-rules.md))

### 2. Criação da reserva

```
POST /api/bookings
  body: location_id, parking_type_id, check_in_at, check_out_at,
        vehicle_id?, add_on_service_ids[]?, coupon_code?
```

- Cria `booking` com status `pending`
- Cria `booking_item` para a vaga e para cada serviço adicional
- Preços são **snapshot** no momento da criação (unit_price, subtotal)
- **Snapshot completo do preço (E2.2.1):** `_create_booking_core` grava `booking.price_breakdown`
  (jsonb **imutável**) com o **contexto que o cliente viu** — `base_price`, `old_price`, `subtotal`,
  `auto_discount` (+ `label`), `coupon` (+ `code`), `strategy`, `days`, `total` e `line_items`. Como é
  derivado de `simulate_price` (que é **STABLE** e muda com a Tábua de Marés), persistir o breakdown
  garante que summary/voucher/histórico mostrem sempre **o que foi cobrado**, sem re-simular. O
  `SummaryCard` usa o `old_price` do snapshot pra exibir o "de R$X" riscado sem mexer no total.
- Se coupon: cria `booking_coupon` com `discount_applied`
- **Não** ocupa vaga ainda — só na confirmação do pagamento

> **Reserva criada por parceiro (Public API, E0.7):** além do consumidor (com JWT), uma reserva
> pode ser criada **em nome da empresa** via chave de API (`POST /v1/bookings`). Nesse caso
> `booking.profile_id` é **null** e `created_via_api_key_id` aponta para a chave usada; o contato do
> cliente vai nas colunas denormalizadas `customer_name/email/phone`. O `CHECK booking_actor_check`
> garante `profile_id IS NOT NULL OR created_via_api_key_id IS NOT NULL`. O núcleo é o mesmo
> (`_create_booking_core`, reusado por `create_booking_atomic` e `api_create_booking`), então hold de
> capacidade, pricing, desconto e cupom são idênticos. Idempotência por `(api_key, Idempotency-Key)`.
> Ver [public-api.md](./public-api.md).

### 3. Pagamento

```
POST /api/bookings/{id}/payment
  body: provider, payment_data (depende do provedor)
```

- Valida disponibilidade de vagas novamente (anti race condition)
- Chama gateway de pagamento
- Em caso de PIX/boleto: retorna `expires_at` (prazo para pagar)
- Gateway responde → handler atualiza status

### 4. Confirmação de pagamento (webhook do gateway)

```
POST /webhooks/payment/{provider}
```

- Verifica assinatura do webhook
- Atualiza `payment.status` → `paid`
- Atualiza `booking.status` → `confirmed`
- **Não** mexe em `location_parking_availability.booked_count` — a vaga já foi segurada na criação
  do `pending` (ver nota de capacidade no topo); confirmar só consolida o hold
- Gera voucher / QR code (ver [voucher-qrcode.md](./voucher-qrcode.md))
- Envia e-mail de confirmação

### 5. Check-in (QR escaneado) — ✅ implementado

```
/voucher/validate?code={booking_code}   (página, não endpoint)
```

- Página **operador-gated** (rota pública, conteúdo por papel). O operador escaneia o QR no portão.
- Valida pelo status (`confirmed` libera; `pending`/`cancelled`/`no_show`/`completed` bloqueiam) e
  exibe a janela prevista (-30min/+2h de `check_in_at`) — fora da janela é aviso, não bloqueio.
- "Registrar entrada" → `booking.status → checked_in` + `checked_in_at = now()` (UPDATE direto gateado
  pela RLS `booking_operator_update`; sem RPC). Ver [voucher-qrcode.md](./voucher-qrcode.md).

### 6. Saída / Conclusão

- Operacional registra saída no backoffice
- `booking.status` → `completed`

---

## Expiração de reservas pendentes

Reservas com `expires_at` preenchido (pagamentos assíncronos como PIX) precisam
ser expiradas automaticamente.

**Regra (implementada):**
- Se `status = pending` E `expires_at < now()` → `cron_expire_pending_bookings()` chama
  `release_booking_capacity` (devolve o hold de cada data) e marca **`cancelled`** + `deleted_at`
- Executado por pg_cron `expire-pending-bookings` (a cada 5 min)
- O hold **foi** criado na reserva, então expirar **precisa** liberá-lo (senão a vaga vaza)

**Campo `expires_at` na `booking`:** já existe (`timestamptz`); `create_booking_atomic` grava
`now() + 30 min` na criação.

---

## Cancelamento e reembolso

### Cancelamento pelo usuário

- Permitido enquanto `status IN (pending, confirmed)`
- **Política de 24h (PRD-12, ✅):** cancelamento **grátis até 24h antes do check-in** → reembolso
  integral; **após** esse prazo, ainda pode cancelar **sem reembolso**. A janela estendida paga
  (**Superflex**) é futura (depende do upsell **MON-11**).
- **Estorno real (E0.3.2, ✅):** o cancelamento passa pela Edge **`cancel-booking`** (a verdade da
  elegibilidade é o servidor; o front só exibe). Ela autoriza **dono** (cliente) ou **staff**
  (hub_admin / operador da empresa), decide via `refundDecision({actor, ...})` e, quando há `payment`
  pago e elegível, chama `gateway.refundCharge(chargeId)` (`DELETE /charges/{id}`) — a Pagar.me
  **reverte o split proporcionalmente**. **Cliente** estorna só dentro da janela 24h; **staff** estorna
  como **override** (a qualquer momento). Estorno **total** nesta etapa. Se o gateway falhar, a reserva
  **não** é cancelada (nunca cancelar sem estornar). Para PIX o estorno é **assíncrono**: o `payment`
  fica `paid` + `refunded_at` setado (`refund_pending`) e vira `refunded` quando o webhook
  `charge.refunded` confirma.
- **Capacidade:** cancelar + liberar a vaga é uma RPC única e **idempotente por status**,
  `cancel_booking_with_release` (noop se já `cancelled`), chamada **tanto** pela Edge **quanto** pelo
  webhook — a vaga nunca é liberada em dobro (`release_booking_capacity` não é idempotente sozinha).
- **Taxa no estorno:** como o parceiro é `liable`/`charge_processing_fee` no split, a taxa de
  processamento já retida normalmente **não** volta e recai no parceiro (consistente com o ADR-004).

### Cancelamento automático

- `no_show`: triggered por job quando `expires_at` ultrapassa sem pagamento
- Não gera reembolso (nada foi cobrado)

---

## Campos adicionais necessários no schema

Campos identificados no legado que ainda não existem no Hub:

| Campo | Tabela | Tipo | Descrição |
|---|---|---|---|
| `expires_at` | `booking` | `timestamptz` | Prazo para pagamento (PIX/boleto) |
| `passenger_count` | `booking` | `integer` | Número de passageiros |
| `has_pcd` | `booking` | `boolean` | Reserva com necessidade especial |
| `origin` | `booking` | `text` | Canal de origem (web, app, parceiro) |
| `utm_source` / `utm_medium` / `utm_campaign` | `booking` | `text` | Rastreamento de marketing |
| `external_id` | `booking` | `text` | ID externo (integração com parceiros) |
