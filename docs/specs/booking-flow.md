# Booking Flow — Ciclo de Vida da Reserva

> **Modelo de capacidade (implementado):** a vaga é **reservada na criação do `pending`**
> (`create_booking_atomic` segura `location_parking_availability.booked_count` por data, com
> `expires_at = now() + booking_hold_minutes`) — **não** na confirmação do pagamento. A confirmação
> **não** re-incrementa. O hold é liberado (`release_booking_capacity`) no **cancelamento** e na
> **expiração** de `pending` não pago, que vira **`cancelled`** (não `no_show`) via
> `cron_expire_pending_bookings` (pg_cron `expire-pending-bookings`, a cada 5 min).
> `minimum_stay`/`minimum_date`/antecedência são validados na criação. Ver
> [capacity-rules.md](./capacity-rules.md).
>
> **Janela de expiração configurável + blindagem de pagamento (E0.3.1-a, ADR-005).** A janela do
> hold é **uma config única** em `app_setting.booking_hold_minutes` (default 30, editável no Manager
> → Configurações → Pagamentos) lida pelo helper `get_booking_hold_minutes()`; **o hold da reserva e
> a validade do QR PIX derivam do mesmo valor** (fim do desencontro 30 min × QR de 1 h). Gerar
> PIX/cartão **renova** `booking.expires_at = now() + hold` (o "relógio de pagar" começa quando o
> cliente decide pagar). O cron **reconcilia contra `payment` antes de cancelar**: nunca expira uma
> reserva com pagamento comprometido (`paid`/`authorized`/cartão em voo) — só PIX apenas gerado e não
> pago (`method=pix, status=pending`); há uma folga `booking_hold_grace_minutes` (default 2) antes de
> cancelar. Cartão aprovado **confirma inline** (não espera o webhook, que vira reconciliação
> idempotente). Rede de segurança do caso 4c (pago sem vaga): `confirm_or_refund_booking` reconfirma
> se há vaga (`acquire_booking_capacity`), senão **estorna automático** (nunca captura sem entregar);
> a Edge `reconcile-confirmations` (pg_cron, a cada 15 min) cobre o webhook perdido.

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
- Confirma a reserva via **`confirm_or_refund_booking`** (E0.3.1-a): `pending → confirmed`
  (idempotente — `noop` se já `confirmed`, ex.: cartão confirmado inline). Se a reserva já expirou
  no gap pagar↔webhook (**caso 4c**), reconfirma se ainda há vaga (`acquire_booking_capacity`); se
  não há, marca `needs_refund` e a Edge **estorna automático** (`gateway.refundCharge`) — nunca
  captura sem entregar
- **Não** mexe em `location_parking_availability.booked_count` na confirmação normal — a vaga já foi
  segurada na criação do `pending` (ver nota de capacidade no topo); confirmar só consolida o hold
- Gera voucher / QR code (**gerador único**, idempotente por reserva; ver
  [voucher-qrcode.md](./voucher-qrcode.md)) + envia confirmação. O webhook perdido é coberto pela
  Edge `reconcile-confirmations` (pg_cron, a cada 15 min)

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

**Regra (implementada — E0.3.1-a, ADR-005):**
- Cancela apenas `status = pending` cujo `expires_at < now() - booking_hold_grace_minutes` (folga
  para atraso de webhook, default 2 min) **E** que **não** tenha pagamento comprometido — o cron
  reconcilia contra `payment`: pula quem tem `paid`/`authorized` ou `method=card` não-terminal.
  **PIX apenas gerado e não pago** (`method=pix, status=pending`) continua expirando normalmente.
- Cancela via **`cancel_booking_with_release`** (único ponto idempotente de cancelar+liberar), que
  chama `release_booking_capacity` e marca **`cancelled`** + `deleted_at`.
- Executado por pg_cron `expire-pending-bookings` (a cada 5 min).
- O hold **foi** criado na reserva, então expirar **precisa** liberá-lo (senão a vaga vaza).

**Campo `expires_at` na `booking`:** `timestamptz`; `create_booking_atomic` grava
`now() + booking_hold_minutes` (config única em `app_setting`, default 30) na criação, e
`create-pix-charge`/`create-card-charge` **renovam** `expires_at` ao gerar o pagamento — o QR PIX usa
o **mesmo** valor, então o hold sempre cobre a validade do QR.

---

## Cancelamento e reembolso

### Cancelamento pelo usuário

- Permitido enquanto `status IN (pending, confirmed)`
- **Política por Tarifa (PRD-12 + E2.8, ✅):** a janela de cancelamento grátis é a da **Tarifa**
  contratada (ver [fares.md](./fares.md)), snapshotada em `booking.fare_cancel_until` na criação:
  **Básica/Flex = até 24h antes**; **Superflex = até 1 min antes** (estorno integral). Dentro da
  janela → reembolso integral; após, ainda pode cancelar **sem reembolso**. Reservas anteriores à
  E2.8 (sem snapshot) usam o **fallback de 24h**. A Tarifa é **receita 100% Movepark** (split próprio
  pra Movepark, fora do repasse do parceiro) — ver [payment-split.md](./payment-split.md).
- **Estorno real (E0.3.2, ✅):** o cancelamento passa pela Edge **`cancel-booking`** (a verdade da
  elegibilidade é o servidor; o front só exibe). Ela autoriza **dono** (cliente) ou **staff**
  (hub_admin / operador da empresa), decide via `refundDecision({actor, fareCancelUntil, ...})` e,
  quando há `payment` pago e elegível, chama `gateway.refundCharge(chargeId)` (`DELETE /charges/{id}`)
  — a Pagar.me **reverte o split proporcionalmente**. **Cliente** estorna só dentro da janela da
  **Tarifa** (`fare_cancel_until`; Superflex = 1 min antes); **staff** estorna como **override**, mas
  sempre **antes do check-in** (a RPC recusa reserva já iniciada). Estorno **total** nesta etapa. Se o gateway falhar, a reserva
  **não** é cancelada (nunca cancelar sem estornar). Para PIX o estorno é **assíncrono**: o `payment`
  fica `paid` + `refunded_at` setado (`refund_pending`) e vira `refunded` quando o webhook
  `charge.refunded` confirma.
- **Reembolso = cancelamento, e só antes do check-in (E0.3.2):** **não** há ação de "estorno avulso"
  separada — quem devolve o dinheiro é o **cancelamento** (`cancel-booking`), disponível **apenas
  enquanto a reserva não começou** (`pending`/`confirmed`). Depois do check-in
  (`checked_in`/`completed`/`no_show`) não há reembolso pelo painel (a estadia aconteceu). O botão
  **"Estorno"** foi **removido** do Manager (`BookingModal`) e do Operator (`BookingDrawer`), assim
  como a Edge `refund-booking`; `paymentState()` agora só alimenta o **badge** de estado
  (Estornado / em processamento).
- **Webhook decide pelo TIPO do evento (não pelo `data.status`):** `webhookIntentFromType()` mapeia
  `charge.refunded`/`order.refunded` → refund (mesmo com `data.status:"paid"`, o caso PIX que
  falhava), `*.canceled` → cancela booking + libera capacidade, `partially_refunded` → registra o
  valor. **Estorno total** (`charge.refunded`) reflete no `payment` **e cancela a reserva se ainda
  `confirmed`/`pending`** (regra única `refundShouldCancelBooking` em `_shared/refund.ts` → libera a
  vaga via `cancel_booking_with_release`); reserva em andamento/concluída recebe só o reembolso. Como
  esta conta emite o full refund/void como o **próprio `charge.refunded`** (não há `charge.canceled`),
  o cancelamento **tem** de partir dele — e o `reconcile-refunds` (poll) aplica a **mesma** regra.
  Idempotência **resiliente** por `payment_webhook_event.processed_at`:
  reentrega de evento que não completou é **reprocessada** (antes o 23505 engolia a falha).
  **Eventos a assinar no painel Pagar.me** (nomes reais da conta): `charge.paid`, `charge.refunded`
  (estorno total) e `charge.partial_canceled` (estorno parcial). Esta conta emite `charge.*` (não há
  `order.*` nem `charge.canceled`); o full refund/void é o próprio `charge.refunded`.
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
| `origin` | `booking` | `text` | Canal de origem (web, app, parceiro) — **já existe**, ver "Origem da reserva" |
| `utm_source` / `utm_medium` / `utm_campaign` | `booking` | `text` | Rastreamento de marketing (colunas existem; preenchimento na E2.4) |
| `external_id` | `booking` | `text` | ID externo (integração com parceiros) |

## Origem da reserva (E2.1.1 · venda direta)

Pra medir a migração da venda do white-label pro hub, toda reserva carrega uma **origem**:

| Sinal | O que indica | Como |
|---|---|---|
| `booking.created_via_api_key_id` | **externo vs hub** (sinal forte) | `NOT NULL` = criada via Public API (parceiro/white-label); `NULL` = nasceu no próprio hub |
| `booking.origin` | **sub-fonte** dentro do hub (funil) | `hub_search`, `hub_destino`, `hub_direct`; via API: `api` (default) / `white_label` |

**Taxonomia centralizada** em `src/lib/bookingOrigin.ts` (`BOOKING_ORIGIN`, `originFromSrc`, `isHubOrigin`).
No consumo direto, a busca (`/search`) e as páginas de destino (`/destinos/:slug`) anexam `?src=search|destino`
ao link da listagem (`ResultCard`); o `ReservationCard` lê esse `src` e grava o `origin` ao criar a reserva
(`originFromSrc`), default `hub_direct` quando a listagem é aberta direta.

**Medição hub × white-label**: `created_via_api_key_id IS NULL AND origin LIKE 'hub%'` = hub; o resto =
externo. **Sem CHECK rígido** em `origin` (não quebrar o default `api` da Public API).

**UTM + dashboard (E2.4.1):** as UTMs são capturadas no front (last-touch da URL → `sessionStorage`,
`src/lib/utm.ts`, no `AppProviders`) e enviadas no payload da reserva; a Edge `create-booking` grava
`utm_source/medium/campaign` na reserva (UPDATE pós-criação, sem tocar no `create_booking_atomic`). O
**dashboard** vive em **Manager → Atribuição** (`/manager/attribution`), via RPC `booking_attribution(from,to)`
(SECURITY DEFINER, só hub_admin) que agrega o período por hub×externo, por `origin` e por `utm_source`.

> **Cutover/go-live é tarefa separada:** apontar `movepark.co` + o tráfego do consumidor pro Hub (301/SEO)
> é atividade de **lançamento**, fora da E2.1, dependente da publicação do Hub.
