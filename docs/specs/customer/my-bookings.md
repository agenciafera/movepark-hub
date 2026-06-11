# Minhas reservas — `/bookings`

> Hub onde o cliente vê, gerencia e age sobre suas reservas.

---

## 1. Rotas

```
/bookings                 redirect → /bookings/upcoming
├─ /bookings/upcoming     próximas (default)
├─ /bookings/active       em uso (status = checked_in)
├─ /bookings/history      concluídas
├─ /bookings/cancelled    canceladas/no-show
└─ /bookings/:code        detalhe + voucher
```

Auth obrigatória.

---

## 2. Lista (`/bookings/upcoming`, etc.)

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Minhas reservas                                            │  display-lg
│  [Próximas (3)] [Em uso (1)] [Histórico] [Canceladas]       │  tabs
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Hoje                                                       │  group label
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [foto]  Vaga coberta · Aerovalet GRU       Confirm. │    │  booking card
│  │         15 jun · 22:00 → 20 jun · 08:00             │    │
│  │         5 diárias · R$ 159,50                       │    │
│  │                              [Ver voucher] [Editar] │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Próxima semana                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ...                                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Booking card
- **Foto** (96×96 quadrada com `rounded-md`)
- **Título** — `{parking_type.name} · {operator.name} {location.short_name}`
- **Datas** — `dd/mm · HH:MM → dd/mm · HH:MM`
- **Resumo** — `N diárias · R$ X,YZ`
- **Status badge** no canto superior direito (Confirmada · Em uso · Concluída · Cancelada · Pendente)
- **Ações inline** — variam conforme status:
  - `pending` → `[Continuar pagamento]` `[Cancelar]`
  - `confirmed` → `[Ver voucher]` `[Editar]` `[Cancelar]`
  - `checked_in` → `[Ver voucher]` (sem mais nada)
  - `completed` → `[Ver recibo]` `[Avaliar]` `[Reservar de novo]`
  - `cancelled` → `[Detalhes do reembolso]` `[Reservar de novo]`

### Agrupamento
- **Próximas**: por proximidade — "Hoje", "Amanhã", "Esta semana", "Próximo mês".
- **Histórico**: por mês ("Junho 2026", "Maio 2026", …).
- **Canceladas**: por mês de cancelamento.

### Empty states
- **Próximas**: ilustração + "Você ainda não tem reservas futuras." + `[Buscar vaga]`.
- **Histórico**: "Seu histórico está vazio. Que tal reservar uma viagem?"

### Filtros (top-right da lista)
- Operadora (dropdown checkboxes)
- Ano
- Status (extras dentro de cada tab)

### Click no card
→ `/bookings/:code`.

---

## 3. Detalhe — `/bookings/:code`

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  ‹ Voltar pra reservas                                      │
├─────────────────────────────────────────────────────────────┤
│  Reserva MP-A8K7P2                              [Confirmada]│  display-lg
│  Criada em 28/05/2026                                       │
├──────────────────────────┬──────────────────────────────────┤
│                          │  ┌──────────────────────────┐    │
│  ── Resumo da reserva ── │  │  Voucher                 │    │
│                          │  │                          │    │
│  Operadora               │  │  [QR code 240×240]       │    │  Sticky right
│  Aerovalet               │  │                          │    │
│                          │  │  Apresente este QR       │    │
│  Localização             │  │  na chegada à vaga.      │    │
│  Aeroporto de Guarulhos  │  │                          │    │
│  Av. Novo Brasil, 954    │  │  Código: MP-A8K7P2       │    │
│  [Como chegar →]         │  │                          │    │
│                          │  │  [Baixar PDF]            │    │
│  ── divider ──           │  │  [Calendário ▾]          │    │
│                          │  │  [Compartilhar]          │    │
│  Datas e duração         │  │                          │    │
│  Check-in                │  └──────────────────────────┘    │
│  15 jun · 22:00 (BRT)    │                                  │
│  Check-out               │                                  │
│  20 jun · 08:00 (BRT)    │                                  │
│  Duração: 5 diárias      │                                  │
│                          │                                  │
│  ── divider ──           │                                  │
│                          │                                  │
│  Veículo                 │                                  │
│  ABC-1D23 · Civic prata  │                                  │
│  [Trocar veículo]        │                                  │
│                          │                                  │
│  ── divider ──           │                                  │
│                          │                                  │
│  Pagamento               │                                  │
│  Vaga × 5 diárias R$ 159 │                                  │
│  Capa Protetora  + R$ 10 │                                  │
│  Cupom PROMO10  − R$ 17  │                                  │
│  Total          R$ 153   │                                  │
│  Cartão Visa •••• 4242   │                                  │
│  [Baixar recibo PDF]     │                                  │
│                          │                                  │
│  ── divider ──           │                                  │
│                          │                                  │
│  Política de cancelamento│                                  │
│  Cancelar com reembolso  │                                  │
│  total até 14/06 · 22:00 │                                  │
│  [Cancelar reserva]      │                                  │
│                          │                                  │
│  ── divider ──           │                                  │
│                          │                                  │
│  Precisa de ajuda?       │                                  │
│  [Falar com a operadora] │                                  │
│  [Falar com a Movepark]  │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**Mobile**: voucher sai da lateral e vira a primeira seção rolável.

---

## 4. Voucher

### Conteúdo do QR
URL: `https://hub.movepark.co/voucher/validate?code=MP-A8K7P2`

Ao escanear no acesso à vaga, abre a página de validação operacional que confere:
- `booking.status == 'confirmed'`
- `check_in_at` está dentro da janela permitida (-30 min a +2h hoje)
- Capacidade ainda OK

Transiciona `booking.status → 'checked_in'`. (Ver `voucher-qrcode.md`.)

### Baixar PDF
PDF inclui:
- Logo Movepark + operadora
- Código booking grande
- QR code grande (vetor)
- Datas/horários
- Endereço da vaga
- Veículo + placa
- Valor total
- Linha "Mostre este voucher impresso ou na tela do celular"

Storage: gera lazy ao primeiro request, cacheia em `bookings_voucher` bucket.

### Compartilhar
- Botão `[Compartilhar]` usa Web Share API quando disponível (mobile).
- Fallback: copia link do voucher.

---

## 5. Ações por status

### Pendente (`pending`)
Banner amarelo no topo:
```
⏳ Reserva aguardando pagamento — expira em 14:32
```
Ações principais:
- `[Continuar pagamento]` → volta pro `/checkout/:code` step 3.
- `[Cancelar reserva]` → soft-cancel (remove `booking.deleted_at = now()`, marca `status = 'cancelled'`).

### Confirmada (`confirmed`)
- `[Ver voucher]` (default visível).
- `[Editar reserva]`: permite mudar datas dentro de regras (24h+ antes, sem mudar tipo).
- `[Cancelar reserva]`: abre modal com info de reembolso.

### Em uso (`checked_in`)
- Voucher continua visível pra check-out.
- `[Pedir extensão]` (futuro) — operadora cobra dias extras.
- `[Falar com a operadora]`.

### Concluída (`completed`)
- `[Ver recibo]`.
- `[Avaliar]` → CTA pra deixar review (1-5 estrelas + texto).
- `[Reservar de novo]` → pré-popula datas próximas no listing original.

### Cancelada (`cancelled`)
- Banner cinza com motivo (cliente cancelou / operadora cancelou / pagamento falhou / expirou).
- `[Detalhes do reembolso]` (se aplicável) — mostra valor reembolsado + prazo.
- `[Reservar de novo]`.

### No-show (`no_show`)
- Banner vermelho "Você não compareceu — sem reembolso".
- `[Falar com a Movepark]` (caso disputa).

---

## 6. Editar reserva

Click `[Editar reserva]` abre **drawer/sheet** com formulário simplificado:
- Datas de check-in / check-out (com validação).
- Quantidade de passageiros.
- Veículo selecionado.

Quando o usuário muda datas:
- Recalcula preço via `simulate_price`.
- Mostra delta: "Novo total: R$ 178,40 · diferença +R$ 18,90".
- Botão `[Confirmar alteração]` cria charge complementar (ou reembolso) e atualiza booking.

**Regras de edição**:
- Só permitido enquanto `status in ('pending', 'confirmed')` e até **24h antes do check-in**.
- Não permite mudar `parking_type` (criar nova reserva pra isso).

---

## 7. Cancelar reserva

Modal:

```
Cancelar reserva MP-A8K7P2

Política: Cancelamento grátis até 14/06 · 22:00 (24h antes).

Você cancela agora: reembolso integral de R$ 153,55 no
prazo de 5 a 10 dias úteis no cartão Visa •••• 4242.

Tem certeza?

Motivo (opcional):
[ Mudei de planos              ▾]

[Manter reserva]              [Cancelar reserva]
```

Após confirmar:
- Booking `status → 'cancelled'`.
- Capacidade liberada (decrementa `location_parking_availability.booked_count`).
- Refund disparado pelo gateway.
- Toast "Reserva cancelada. Você verá o reembolso em até 10 dias."
- E-mail de confirmação.

---

## 8. Avaliar (post-checkout)

Após `completed`, mostra CTA "Como foi sua experiência?". Click:

```
┌─────────────────────────────────────┐
│ Avaliar Aerovalet                   │
│                                     │
│ Sua nota geral:                     │
│ ☆ ☆ ☆ ☆ ☆                           │
│                                     │
│ Limpeza         ☆ ☆ ☆ ☆ ☆           │
│ Atendimento     ☆ ☆ ☆ ☆ ☆           │
│ Custo-benefício ☆ ☆ ☆ ☆ ☆           │
│                                     │
│ Conte como foi:                     │
│ [textarea 4 rows]                   │
│                                     │
│ [Pular]                  [Publicar] │
└─────────────────────────────────────┘
```

Persistido via RPC `submit_review` na tabela `review` (rating 1-5 + sub-notas + comment, 1 por reserva, reserva própria `completed`). ✅ Implementado — ver [reviews.md](../reviews.md).

---

## 9. Comunicação dentro da reserva

Bloco "Precisa de ajuda?" no detalhe da reserva:
- **Falar com a operadora** → modal com telefone + e-mail + nota "Atendimento das 6h às 22h".
- **Falar com a Movepark** → abre chat (Zendesk / Intercom no futuro) ou e-mail `suporte@movepark.co`.

Mensagens automáticas:
- 24h antes do check-in → e-mail "Sua reserva é amanhã. Confira o voucher."
- 1h antes → push (futuro) "Hora de seguir pra vaga".
- 1h após check-out previsto sem realização → e-mail "Esquecemos algo? Avise se mudou de planos."

---

## 10. Performance

- Query inicial: `GET /api/bookings?profile_id={uid}&status=…` com paginação 20/página.
- Server side filtragem por status, dates, operator.
- React Query cache `['bookings', filters]` com `staleTime: 60s`.
- Detalhe pré-fetch ao hover ≥ 300 ms (Tanstack `prefetchQuery`).

---

## 11. Acessibilidade

- Tabs com `role="tablist"` + `role="tab"` + `aria-controls`.
- Status badge tem `aria-label` redundante ao ícone.
- QR code: `<img alt="QR code da reserva MP-A8K7P2">`.
- Datepicker no editar: navegação por teclado.

---

## 12. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.property-card}` adaptado | Card de reserva |
| `{component.button-primary}` | "Ver voucher" |
| `{component.button-secondary}` | "Editar" |
| `{component.button-danger}` | "Cancelar reserva" |
| `{component.date-picker-day}` | Editar reserva |
| Custom QR | Voucher |

---

## 13. Open points

- [ ] **Editar reserva**: requer recalcular `location_parking_availability.booked_count` na transição. Edge Function pra atomicidade.
- [ ] **Refund**: depende do gateway. Stripe tem `refund` API direta; Pagar.me tem `transactions/:id/refund`. Tempo de processamento varia.
- [x] **Avaliações**: implementado (PRD-08 — ver [reviews.md](../reviews.md)). CTA "Avaliar" no detalhe da reserva `completed` → RPC `submit_review`.
- [ ] **Chat com operadora**: MVP é só link/telefone. Futuro: chat real-time via Supabase Realtime.
- [ ] **Push notifications**: requer PWA + service worker + provider (Firebase, OneSignal). Fora do MVP.
- [ ] **Receipt PDF**: similar ao voucher, mas com info fiscal completa (CNPJ operadora, valor, impostos quando aplicável).
- [ ] **Reservar de novo**: deep link `/p/:o/:l/:pt?from=…&to=…` com datas sugeridas (próxima sexta a próxima domingo?).
