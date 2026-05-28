# Booking Flow — Ciclo de Vida da Reserva

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
pending ──────→ no_show     (expires_at ultrapassado sem pagamento)

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
- Se coupon: cria `booking_coupon` com `discount_applied`
- **Não** ocupa vaga ainda — só na confirmação do pagamento

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
- **Incrementa** `location_parking_availability.booked_count` para cada data do período
- Gera voucher / QR code (ver [voucher-qrcode.md](./voucher-qrcode.md))
- Envia e-mail de confirmação

### 5. Check-in (QR escaneado)

```
GET /voucher/validate?code={booking_code}
```

- Valida se booking está `confirmed`
- Valida se check_in_at está dentro da janela permitida
- Atualiza `booking.status` → `checked_in`

### 6. Saída / Conclusão

- Operacional registra saída no backoffice
- `booking.status` → `completed`

---

## Expiração de reservas pendentes

Reservas com `expires_at` preenchido (pagamentos assíncronos como PIX) precisam
ser expiradas automaticamente.

**Regra:**
- Se `status = pending` E `expires_at < now()` → transição para `no_show`
- Executado por job agendado (cron)
- Ao expirar: **não** incrementa `booked_count` (vaga nunca foi ocupada)
- Notificação opcional ao usuário

**Campo `expires_at` na `booking`:**
```sql
expires_at  timestamptz  -- preenchido pelo gateway (ex: PIX tem 30min de validade)
```
> Esta coluna ainda não existe no schema atual — adicionar na próxima migration.

---

## Cancelamento e reembolso

### Cancelamento pelo usuário

- Permitido enquanto `status IN (pending, confirmed)`
- Se `confirmed` (pagamento já feito): cria solicitação de reembolso
  - No legado havia o status `refund-requested`
  - No Hub: o campo `payment.status` → `refunded` cobre esse caso
- Ao cancelar: **decrementa** `booked_count` para cada data do período

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
