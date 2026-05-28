# Voucher & QR Code — Comprovante de Reserva

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

## Campos necessários no schema

| Campo | Tabela | Tipo | Descrição |
|---|---|---|---|
| `voucher_url` | `booking` | `text` | URL do PDF gerado |
| `checked_in_at` | `booking` | `timestamptz` | Timestamp real de entrada (vs agendado) |
| `checked_out_at` | `booking` | `timestamptz` | Timestamp real de saída |

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
