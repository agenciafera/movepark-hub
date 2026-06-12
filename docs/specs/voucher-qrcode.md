# Voucher & QR Code — Comprovante de Reserva

> **Status: ✅ Implementado** — migration `20260615000000_voucher_storage.sql` (bucket privado
> `vouchers`), edge `voucher-pdf`, página `/voucher/validate` (check-in por QR do operador).
> **Ao mudar uma regra, atualize esta spec no mesmo PR.**

## Estado implementado (fonte de verdade)

- **Voucher PDF (server-side):** edge **`voucher-pdf`** (`supabase/functions/voucher-pdf/`) — recebe
  `{ code }` com JWT, lê o booking escopado pela RLS (dono **ou** operador da empresa), gera o PDF com
  `pdf-lib` (wordmark, código, QR da página de validação, operadora/unidade/endereço, datas, veículo,
  valor — helper puro `fields.ts`), sobe no bucket **privado `vouchers`** em `${booking_id}.pdf`
  (service_role), grava `booking.voucher_url` e devolve uma **signed URL** (1h). Só para status
  `confirmed`/`checked_in`/`completed`. No cliente: hook `useVoucherPdf()` + botão "Baixar voucher PDF"
  no [Voucher](../../src/features/bookings/Voucher.tsx) e na confirmação do checkout (substitui o
  `window.print()`).
- **Check-in por QR:** o QR do voucher aponta para **`/voucher/validate?code=<code>`**
  ([voucher-validate.tsx](../../src/routes/voucher-validate.tsx)) — rota **pública** com conteúdo por
  papel (`useAuth().effectiveRole`): **operador/hub_admin** vê a validação + "Registrar entrada"
  (confirmed → `checked_in` + `checked_in_at`, via UPDATE direto gateado pela RLS
  `booking_operator_update`); **cliente** vê aviso + link para a própria reserva; **anônimo** vê CTA de
  login. Validade em `voucher.logic.ts` (estado por status + janela -30min/+2h, pura/testável). A
  **saída** (checked_in → completed) segue no drawer do painel do operador.
- **Cliente vê a entrada:** `useBookingDetail` carrega `checked_in_at`; o voucher mostra "Entrada
  registrada às HH:MM" quando `checked_in`.

Testes: Vitest `voucher.logic.test.ts` (máquina de validade) + componente `voucher-validate.test.tsx`
(papéis/estados); deno `voucher-pdf/fields.test.ts`. Sem RPC/migration de schema (reuso de RLS).

---

## Visão geral

O voucher é o comprovante digital da reserva. É gerado após a confirmação do pagamento
e serve como prova de acesso ao estacionamento. O QR code embutido é escaneado na entrada
para fazer o check-in do veículo.

---

## Geração do voucher

### Gatilho

O voucher é gerado automaticamente ao receber confirmação de pagamento (`booking.status → confirmed`).

### Conteúdo

| Dado | Fonte |
|---|---|
| Código da reserva | `booking.code` |
| URL do QR code | `https://{domain}/voucher/validate?code={booking.code}` |
| Empresa e logo | `company.name` + logo |
| Unidade / endereço | `location.name`, `location.address` |
| Tipo de vaga | `parking_type.name` |
| Datas de entrada/saída | `booking.check_in_at`, `booking.check_out_at` |
| Placa do veículo | `vehicle.license_plate` (se informado) |
| Valor pago | `booking.total_amount` |
| Passageiros / PCD | `booking.passenger_count`, `booking.has_pcd` |

### Armazenamento

- Arquivo PDF gerado e salvo no storage (S3 ou equivalente)
- Caminho: `{env}/{company_slug}/voucher_{booking_id}.pdf`
- URL salva em `booking.voucher_url` (campo ainda não no schema — adicionar)
- PDF é reutilizado se já existir; regenerado apenas sob demanda

---

## Check-in via QR

```
GET /voucher/validate?code={booking.code}

Validações:
1. booking.code existe?                    → Não: 404
2. booking.status = 'confirmed'?           → Não: erro (já usado, cancelado etc.)
3. check_in_at está dentro da janela?      → Não: erro de horário
4. location_parking_type tem capacidade?   → Não: erro de vaga

Ação:
→ booking.status = 'checked_in'
→ Registra timestamp real de entrada
```

---

## Campos no schema (✅ já existem no baseline)

| Campo | Tabela | Tipo | Descrição |
|---|---|---|---|
| `voucher_url` | `booking` | `text` | Caminho do PDF no bucket `vouchers` (populado pela edge `voucher-pdf`) |
| `checked_in_at` | `booking` | `timestamptz` | Timestamp real de entrada (set no check-in por QR) |
| `checked_out_at` | `booking` | `timestamptz` | Timestamp real de saída (set no drawer do operador) |

> `checked_in_at` e `checked_out_at` são distintos de `check_in_at` / `check_out_at`:
> os primeiros são o **agendamento**, os segundos são o **evento real**.

---

## Regeneração manual

- Disponível no backoffice para operadores
- Deleta o PDF existente do storage
- Regera com os dados atuais da reserva
- Reenvia e-mail ao cliente

---

## Notificações

| Evento | Canal | Conteúdo |
|---|---|---|
| Pagamento confirmado | E-mail | Confirmação + link/anexo do voucher |
| Check-in realizado | E-mail / push (futuro) | Confirmação de entrada |
| Reserva cancelada | E-mail | Informações de cancelamento + reembolso |
| Expiração iminente (PIX) | E-mail | Lembrete de pagamento pendente |

> Implementação de notificações é fora do MVP de banco de dados — documentado aqui apenas para referência futura.
