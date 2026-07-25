# Booking Flow — Ciclo de Vida da Reserva

> **Modelo de capacidade (implementado):** a vaga é **reservada na criação do `pending`**
> (`create_booking_atomic` segura `location_parking_availability.booked_count` por data, com
> `expires_at = now() + booking_hold_minutes`) — **não** na confirmação do pagamento. A confirmação
> **não** re-incrementa. O hold é liberado (`release_booking_capacity`) no **cancelamento** e na
> **expiração** de `pending` não pago, que vira **`expired`** (abandono, não `cancelled` nem
> `no_show`) via `cron_expire_pending_bookings` (pg_cron `expire-pending-bookings`, a cada 5 min).
> `minimum_stay`/`minimum_date`/antecedência são validados na criação. A **entrada não pode ser
> retroativa** (piso incondicional `assert_check_in_not_past`, bug E2.2.1): vale na criação e na
> troca de datas (pendente e paga), com espelho `past_ok` em `check_availability` para o front. Ver
> [capacity-rules.md](./capacity-rules.md).
>
> **Abandono ≠ cancelamento (status `expired`).** Um `pending` que vence sem nunca ter sido pago é
> **carrinho abandonado** e vira **`expired`**, não `cancelled`. `cancelled` fica reservado para
> reserva que teve dinheiro envolvido (paga/comprometida) e depois foi cancelada. Isso limpa a taxa
> de cancelamento (que antes inflava com abandono) e destrava recuperação de carrinho pelo marketing.
> Regra e semântica completas na seção **[Abandono vs cancelamento](#abandono-vs-cancelamento-expired-vs-cancelled)**.
>
> **Janela de expiração configurável + blindagem de pagamento (E0.3.1-a, ADR-005).** A janela do
> hold é **uma config única** em `app_setting.booking_hold_minutes` (default 30, editável no Manager
> → Configurações → Pagamentos) lida pelo helper `get_booking_hold_minutes()`; **o hold da reserva e
> a validade do QR PIX derivam do mesmo valor** (fim do desencontro 30 min × QR de 1 h). Gerar
> PIX/cartão **renova** `booking.expires_at = now() + hold` (o "relógio de pagar" começa quando o
> cliente decide pagar). **Keep-alive "Ainda está aí?" (E0.3.1-b):** ~5 min antes de expirar, o
> checkout mostra o `KeepAliveModal` que deixa o cliente **renovar o hold sem pagar** via RPC
> `renew_booking_hold` (dono/hub_admin) — com **teto** `booking_hold_max_minutes` (default 90, a
> partir de `created_at`, **editável no Manager → Configurações → Pagamentos** junto do hold e da
> folga; o checkout lê o teto pela RPC pública `get_booking_hold_max_minutes`) pra não segurar a
> vaga indefinidamente. O cron **reconcilia contra
> `payment` antes de cancelar**: nunca expira uma
> reserva com pagamento comprometido (`paid`/`authorized`/cartão em voo) — só PIX apenas gerado e não
> pago (`method=pix, status=pending`); há uma folga `booking_hold_grace_minutes` (default 2) antes de
> cancelar. Cartão aprovado **confirma inline** (não espera o webhook, que vira reconciliação
> idempotente). Rede de segurança do caso 4c (pago sem vaga): `confirm_or_refund_booking` reconfirma
> se há vaga (`acquire_booking_capacity`), senão **estorna automático** (nunca captura sem entregar);
> a Edge `reconcile-confirmations` (pg_cron, a cada 15 min) cobre o webhook perdido.

> **Idempotência da criação (dedup de duplo-envio).** Um `create_booking` do consumidor (chatbot/
> agente MCP e checkout web) pode chegar duplicado (dois "reserva" seguidos, duplo-submit). Sem
> guarda, cada envio cria uma `pending` que segura vaga real até o cron expirar. `create_booking_atomic`
> deriva a chave no servidor de `(profile, tipo de vaga, entrada, saída)` (não confia numa chave do
> chamador, que um modelo não inventa estável), guarda em `booking.idempotency_key` e, dentro de um
> `pg_advisory_xact_lock`, devolve a `pending` viva (`idempotent_replay: true`) em vez de criar outra.
> A janela é a vida do hold: depois que a 1ª expira/confirma, a mesma reserva pode ser feita de novo.
> A criação por parceiro (`api_create_booking`) segue idempotente por **chave explícita** (keyed em
> `api_key`, header `Idempotency-Key`). Migration `20260825000000_consumer_booking_idempotency.sql`.

## State Machine

### Estados

| Status | Descrição | Visível ao usuário |
|---|---|---|
| `pending` | Reserva criada, aguardando pagamento | ✅ |
| `confirmed` | Pagamento confirmado | ✅ |
| `checked_in` | QR escaneado, veículo no estacionamento | ✅ |
| `completed` | Saída registrada, reserva encerrada | ✅ |
| `cancelled` | Cancelada com dinheiro envolvido (paga/comprometida e depois cancelada) | ✅ |
| `expired` | **Carrinho abandonado**: `pending` que venceu sem nunca ter sido pago | ✅ |
| `no_show` | Não compareceu dentro do prazo | ✅ |

> No legado os status eram: `new`, `in_progress`, `complete`, `canceled`, `expired`, `refund-requested`.
> No Hub os nomes foram normalizados para o domínio real de estacionamento. O `expired` **volta**
> aqui de propósito, com semântica clara (abandono ≠ cancelamento); ver a seção dedicada abaixo.

### Transições válidas

```
pending ──────→ confirmed   (pagamento aprovado)
pending ──────→ expired     (expires_at ultrapassado SEM pagamento: carrinho abandonado, job libera o hold)
pending ──────→ cancelled   (pending que JÁ tinha pagamento comprometido e foi cancelado)

confirmed ────→ checked_in  (QR escaneado na entrada)
confirmed ────→ cancelled   (cancelamento após pagamento: inicia reembolso)
confirmed ────→ no_show     (não compareceu: transição automática por job)

checked_in ───→ completed   (saída registrada)
checked_in ───→ cancelled   (emergência operacional)

completed ────→ (terminal, sem transições)
cancelled ────→ (terminal, mas pagamento tardio pode reconfirmar: ver confirm_or_refund_booking)
expired ──────→ (terminal, mas pagamento tardio pode reconfirmar: ver confirm_or_refund_booking)
no_show ──────→ (terminal, sem transições)
```

> **`pending` → `expired` vs `pending` → `cancelled`.** O que decide é ter havido **dinheiro
> envolvido**, não o status de origem. Um `pending` cru (nenhum pagamento comprometido) que é
> encerrado (pelo cron ou por cancelamento) vira **`expired`**. Um `pending` que já tem pagamento
> `paid`/`authorized`/cartão em voo (a janela entre pagar e o webhook confirmar) vira **`cancelled`**:
> tem estorno a fazer, não é abandono. Detalhe na seção **Abandono vs cancelamento**.

---

## Sequência de checkout

### 0. Persistência de intenção e retomada pós-login

A criação da reserva exige JWT (guest checkout é v2). Quando um visitante anônimo escolhe datas,
tarifa, passageiros, PCD, add-ons e cupom no card da unidade e clica em "Reservar agora", essas
escolhas vivem só em estado local do `ReservationCard`. Antes de mandar pro login, o card **salva a
intenção** num objeto em `sessionStorage` (`mp_booking_intent`, via `src/lib/bookingIntent.ts`), que
sobrevive ao round-trip de login (OTP e OAuth do Google, mesma aba). O redirect usa
`/login?next=<listing>` (o `next` já existente resolve a volta pra rota certa).

Na volta autenticado, o card **hidrata** o estado a partir da intenção (amarrada ao `listingId`, só
retoma no mesmo lote), limpa a intenção consumida e **auto-avança pro checkout**. O gate
`isAutoSubmitReady` evita a corrida entre restaurar sessão e restaurar intenção: só submete quando a
sessão já carregou (`!authLoading`), é cliente, o lote está reservável (disponibilidade e preço
**revalidados** via `canReserve`) e o cupom já resolveu (pra não criar a reserva sem o desconto). Se
o lote esgotou ou o preço mudou no intervalo, não auto-submete: o usuário vê o card restaurado com o
aviso de disponibilidade e decide. O cupom continua também persistido em separado (`mp_coupon`).

Isso resolve o bug de perder as datas/cupom/tarifa ao logar no meio da reserva (o "barramento de
retomar destino" já existia via `next`; faltava a parte **stateful** do card). Cobertura:
`bookingIntent.test.ts` (round-trip do storage + gate de auto-submit).

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
> cliente vai nas colunas denormalizadas `customer_name/email/phone`. O nome é quebrado em
> `customer_first_name`/`customer_last_name` (pra bater com o checkout, que coleta Nome + Sobrenome):
> um trigger `booking_reconcile_customer_name` reconcilia os dois lados, então quem manda
> `customer_name` (Public API/MCP/RPCs) tem o nome fatiado e quem manda first/last (checkout) tem o
> `customer_name` recomposto. O contrato da Public API segue com `customer_name` (string única). O `CHECK booking_actor_check`
> garante `profile_id IS NOT NULL OR created_via_api_key_id IS NOT NULL`. O núcleo é o mesmo
> (`_create_booking_core`, reusado por `create_booking_atomic` e `api_create_booking`), então hold de
> capacidade, pricing, desconto e cupom são idênticos. Idempotência por `(api_key, Idempotency-Key)`.
> Ver [public-api.md](./public-api.md).

> **Titular x passageiro + pagamento pelo snapshot (checkout do consumidor).** O TITULAR (conta logada) é
> sempre o pagador: o passo 1 grava `booking.customer_first_name/last_name/phone/email` (titular) e, no passo
> de pagamento, `customer_tax_id` (CPF/CNPJ). "Reserva para outra pessoa" adiciona um passageiro
> (`passenger_first_name/last_name/phone`) só pro voucher/aviso. As Edges de pagamento (`create-pix-charge`,
> `create-card-charge`, `create-fare-upgrade`) montam o pagador **a partir do snapshot do booking**, nunca de
> `profiles`/`auth.users` — assim quem loga por e-mail (sem `auth.users.phone`) paga normalmente. O telefone
> do titular também é anexado ao `auth.users` (Edge `attach-phone-silent`, sem OTP, com guarda de colisão;
> exceção da ADR-006). O checkout é autocontido: sem redirect pra `/account/complete-profile`.

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

**Regra (implementada, E0.3.1-a, ADR-005):**
- Expira apenas `status = pending` cujo `expires_at < now() - booking_hold_grace_minutes` (folga
  para atraso de webhook, default 2 min) **E** que **não** tenha pagamento comprometido: o cron
  reconcilia contra `payment` e pula quem tem `paid`/`authorized` ou `method=card` não-terminal.
  **PIX apenas gerado e não pago** (`method=pix, status=pending`) continua expirando normalmente.
- Encerra via **`cancel_booking_with_release`** (único ponto idempotente de encerrar+liberar), que
  chama `release_booking_capacity` e marca o status terminal + `deleted_at`. Como esses pendentes
  nunca foram pagos, o status resultante é **`expired`** (abandono), não `cancelled`.
- Executado por pg_cron `expire-pending-bookings` (a cada 5 min).
- O hold **foi** criado na reserva, então expirar **precisa** liberá-lo (senão a vaga vaza).

**Campo `expires_at` na `booking`:** `timestamptz`; `create_booking_atomic` grava
`now() + booking_hold_minutes` (config única em `app_setting`, default 30) na criação, e
`create-pix-charge`/`create-card-charge` **renovam** `expires_at` ao gerar o pagamento — o QR PIX usa
o **mesmo** valor, então o hold sempre cobre a validade do QR.

---

## Abandono vs cancelamento (`expired` vs `cancelled`)

Este status carrega peso: ele separa duas coisas que antes viravam a mesma linha (`cancelled`) e
que significam negócios opostos.

- **`expired` = carrinho abandonado.** A pessoa criou um `pending`, segurou a vaga, e **nunca pagou**.
  O hold venceu (ou alguém encerrou a reserva não paga). Ninguém desistiu de uma compra: a compra
  nunca aconteceu. É perda de topo de funil, não de cliente.
- **`cancelled` = cancelamento real.** Houve **dinheiro envolvido** (reserva paga ou com pagamento
  comprometido) e depois ela foi desfeita. Aqui há estorno a tratar, política de janela de Tarifa,
  impacto em receita e no parceiro.

### Por que a distinção importa (o peso do status)

1. **Taxa de cancelamento honesta.** Misturar abandono com cancelamento inflava a métrica: no
   backfill deste banco, ~87% do que estava como `cancelled` era, na verdade, carrinho abandonado. O
   dashboard do dono e os relatórios passam a medir cancelamento de reserva **paga**, que é o número
   que fala de satisfação e de operação. Abandono é outra história (topo de funil), medida à parte.
2. **Recuperação de carrinho pelo marketing.** Abandono é recuperável; cancelamento pago já teve o
   dinheiro de volta. Sem separar os dois, não dá para saber a quem oferecer "sua vaga ainda está
   disponível" sem incomodar quem já cancelou de propósito. Ver **Recuperável** abaixo.
3. **Integrações não disparam à toa.** Os triggers de WPS/White-Label observam `new.status =
   'cancelled'`. Como abandono nunca foi confirmado ao parceiro, marcá-lo `expired` (e não
   `cancelled`) **não** dispara sincronização de cancelamento: nada é "cancelado" lá fora porque
   nada chegou a existir lá fora. O backfill de legado (cancelled → expired) por isso é seguro.

### A regra: o determinante é o dinheiro, não o status de origem

`expired` acontece **só** quando a reserva é um `pending` **cru**, sem **nenhum pagamento
comprometido**. Qualquer outra coisa que seja encerrada é `cancelled`.

| Situação ao encerrar | Vira | Por quê |
|---|---|---|
| `pending` sem pagamento (PIX gerado e não pago, ou nada) | `expired` | carrinho abandonado, sem dinheiro |
| `pending` com pagamento `paid`/`authorized`/cartão em voo | `cancelled` | janela pré-confirmação: já há dinheiro |
| `confirmed` / `checked_in` cancelado | `cancelled` | só se chega nesses status depois de pagar |

"Pagamento comprometido" = `payment` com `status in (paid, authorized, refunded)`, com `paid_at`, ou
`method = card` que não falhou/cancelou. A decisão vive em **um lugar**: `cancel_booking_with_release`
(usada pela Edge `cancel-booking`, pelo webhook e pelo cron) e a irmã `api_cancel_booking` (Public
API). O cron `cron_expire_pending_bookings` **delega** a ela, então nunca há uma segunda cópia da
regra. Implementado em `supabase/migrations/20260914000000_booking_status_expired.sql` (enum) +
`20260914010000_booking_expired_logic.sql` (lógica + backfill); cobertura em
`supabase/tests/booking_expired.test.sql`.

### Recuperável: `expired` + check-in ainda no futuro (derivado, nunca um status)

Um `expired` **recuperável** é o abandono que o marketing ainda dá para reconquistar: o carrinho foi
abandonado, **mas a data de entrada (`check_in_at`) ainda está no futuro**, então a pessoa ainda
poderia reservar aquela estadia. Um `expired` cujo check-in já passou é história: não há o que
recuperar.

**Recuperável é DERIVADO, não um status do banco.** A propriedade **decai com o relógio**: o mesmo
`expired` é recuperável hoje e deixa de ser amanhã, sem nada mudar na reserva. Cravar "recoverable"
como status obrigaria um job para "expirar o recuperável" a cada minuto, e o valor certo dependeria
de quando alguém olhou. Por isso a regra é:

```
recuperável  ⇔  status = 'expired'  E  check_in_at > now()
```

Calculado com o relógio, onde e quando for preciso, **nunca** persistido:
- **Front:** `isRecoverableExpired(booking, now)` em `src/features/bookings/bookings.logic.ts`
  (puro, `now` injetável, testado em `bookings.logic.test.ts`).
- **Marketing/recuperação:** a fila de "recuperar carrinho" é uma **query** por `status = 'expired'
  AND check_in_at > now()` (mais os filtros de contato/consentimento), não uma coluna. Assim a lista
  está sempre certa no instante em que roda, e um abandono cujo check-in passou sai dela sozinho.

> **Não crie um status `recoverable`.** Se um dia o produto precisar marcar "já abordamos este
> abandono", isso é um **evento de marketing** (ex.: `booking_recovery_attempt` com timestamp),
> ortogonal ao ciclo de vida da reserva, e não um sétimo `booking_status`. O status diz o que a
> reserva é; recuperável diz o que dá para fazer com ela agora, e isso é do relógio e do CRM.

### Pagamento tardio ainda reconfirma

Como antes, se o pagamento aterrissa depois do encerramento (o gap pagar↔webhook), a reserva pode
sair do terminal: `confirm_or_refund_booking` trata `expired` **igual** a `cancelled` (reconfirma se
há vaga via `acquire_booking_capacity`, senão estorna). Ou seja, `expired` é terminal para o fluxo
normal, mas não é uma sentença: dinheiro que chega atrasado é honrado ou devolvido, nunca engolido.

---

## Cancelamento e reembolso

### Cancelamento pelo usuário

- Permitido enquanto `status IN (pending, confirmed)`
- **Política por Tarifa (PRD-12 + E2.8, ✅):** a janela de cancelamento grátis é a da **Tarifa**
  contratada (ver [fares.md](./fares.md)), snapshotada em `booking.fare_cancel_until` na criação:
  **Básica/Flex = até 24h antes**; **Superflex = até 1 min antes** (estorno integral). Dentro da
  janela → reembolso integral. **Fora da janela o cliente é bloqueado** (decisão PO jul/2026): não
  cancela mais por conta própria; só **staff/parceiro** cancelam como override. O `pending` (hold não
  pago) segue cancelável a qualquer hora (só libera a vaga). Reservas anteriores à E2.8 (sem snapshot)
  usam o **fallback de 24h**. A Tarifa é **receita 100% Movepark** (split próprio pra Movepark, fora
  do repasse do parceiro), ver [payment-split.md](./payment-split.md). Regra completa das alterações
  (cancelar + trocar data/veículo) em [booking-modifications.md](./booking-modifications.md).
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
  `cancel_booking_with_release` (noop se já `cancelled` ou `expired`), chamada **tanto** pela Edge
  **quanto** pelo webhook: a vaga nunca é liberada em dobro (`release_booking_capacity` não é
  idempotente sozinha). O status terminal que ela grava é `expired` para abandono (pending cru sem
  pagamento) e `cancelled` para o resto (ver seção **Abandono vs cancelamento**).
- **Taxa no estorno:** como o parceiro é `liable`/`charge_processing_fee` no split, a taxa de
  processamento já retida normalmente **não** volta e recai no parceiro (consistente com o ADR-004).

### Encerramento automático

- `expired`: `pending` cru cujo `expires_at` venceu sem pagamento (carrinho abandonado). Libera o
  hold; não há reembolso (nada foi cobrado). Ver **Expiração de reservas pendentes** e **Abandono vs
  cancelamento**.
- `no_show`: reserva **confirmada** (paga) cujo cliente não compareceu na janela de check-in. É outro
  caso, sobre reserva paga, e não se confunde com abandono.

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
