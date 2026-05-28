# Checkout — fluxo de reserva

> Onde o cliente confirma identidade, veículo, pagamento e recebe o voucher.
> Referência de máquina de estados: [docs/specs/booking-flow.md](../booking-flow.md).

---

## 1. URL e estado

```
/checkout/:bookingCode
```

O **booking** é criado no banco com `status = 'pending'` **na entrada** do checkout (e não ao clicar em "Reservar agora" do listing). Isso permite:
- URL shareable / retornável (`/checkout/MP-A8K7P2`).
- Countdown server-side de expiração (`booking.expires_at`).
- Métricas de funil (quantos abandonam por step).

### Fluxo prévio (listing → checkout)
1. Cliente clica "Reservar agora" no listing.
2. Frontend faz `POST /api/bookings` (ou Edge Function) com:
   ```json
   {
     "location_parking_type_id": "...",
     "check_in_at": "2026-06-10T22:00:00Z",
     "check_out_at": "2026-06-15T08:00:00Z",
     "passenger_count": 2,
     "add_on_service_ids": ["..."],
     "coupon_code": "PROMO10"
   }
   ```
3. Edge function: valida disponibilidade, calcula preço via `simulate_price`, cria `booking` + `booking_item[]` + `booking_coupon` se houver. Define `expires_at = now() + 30 min`.
4. Retorna `{ booking_code: "MP-A8K7P2" }`.
5. Cliente é redirecionado pra `/checkout/MP-A8K7P2`.

---

## 2. Layout (desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar reduzida — só wordmark, sem search bar                │
│ Countdown: "Sua vaga está reservada por 29:48 ⏳"            │  banner sticky
├────────────────────────────┬─────────────────────────────────┤
│                            │  ┌──────────────────────────┐   │
│ [1 Identificação]          │  │ Resumo da reserva        │   │
│ ─ ─ ─                      │  │                          │   │
│ [2 Veículo]                │  │ Aerovalet GRU            │   │
│ [3 Pagamento]              │  │ Vaga coberta             │   │
│ [4 Confirmação]            │  │                          │   │
│                            │  │ 10 jun · 22:00           │   │
│  ── stepper vertical ──    │  │ 15 jun · 08:00           │   │  Summary card
│                            │  │ 5 diárias                │   │  sticky right
│  Step content here         │  │                          │   │  width 360
│  (form)                    │  │ R$ 159,50                │   │
│                            │  │ + Capa  R$  10,00        │   │
│  [Voltar]  [Continuar →]   │  │ - Cupom -R$ 15,95        │   │
│                            │  │ ───                      │   │
│                            │  │ Total R$ 153,55          │   │
│                            │  │                          │   │
│                            │  │ [✏ Editar reserva]       │   │
│                            │  └──────────────────────────┘   │
└────────────────────────────┴─────────────────────────────────┘
```

**Stepper**: vertical à esquerda (desktop), horizontal topo (mobile/tablet). Etapas clicáveis pra voltar; bloqueadas pra frente.

---

## 3. Step 1 — Identificação

### Caso A — usuário anônimo
Mostra duas tabs no topo:

```
[Entrar] [Continuar como visitante]
```

#### Aba "Entrar"
Formulário e-mail + senha + "Esqueci minha senha". Após login, pula direto pra **Step 2**.

#### Aba "Continuar como visitante"
Form com 4 campos:
- **Nome completo** (obrigatório)
- **CPF** (obrigatório, máscara `000.000.000-00`, valida com `cpf-cnpj-validator`)
- **E-mail** (obrigatório, valida formato)
- **Telefone** (obrigatório, máscara `(00) 00000-0000`)
- Checkbox "Aceito os [termos] e a [política de privacidade]" (obrigatório)
- Checkbox "Quero receber ofertas por e-mail" (opcional)

Botão `[Continuar →]` cria/atualiza um `profile` provisório (associado ao booking via `booking.profile_id`) e prossegue.

### Caso B — usuário logado
Carrega `profile` automaticamente e mostra read-only:

```
Você está logado como:
Maria Silva  ·  maria@email.com  ·  (11) 91234-5678  ·  CPF 123.***.***-89
                                                                [Trocar conta]
```

Botão `[Continuar →]` direto sem mais inputs.

---

## 4. Step 2 — Veículo

### Anônimo / logado sem veículo cadastrado
Form:
- **Placa** (obrigatório, máscara `AAA-0A00` ou `AAA-0000`)
- **Marca** (autocomplete via FIPE — `fipe.brand`)
- **Modelo** (autocomplete via FIPE — `fipe.model` filtrado pela marca)
- **Cor** (select com cores comuns)
- Checkbox "Salvar veículo na minha conta" (visível se logado)

### Logado com veículos
Lista de cards radio-button:
```
○ ABC-1D23 · Honda Civic · Prata
○ XYZ-7K89 · VW Gol · Branco
○ + Adicionar outro veículo
```

Se há `pricing_rule` com surcharge por tipo de veículo no futuro, podemos filtrar.

### Step 2.5 — Detalhes adicionais (condicional)

Se `location.has_passenger_quantity = true`:
- Input numérico "Quantos passageiros usarão a vaga?" 1–9.

Se `location.has_pcd_config = true`:
- Toggle "Vai usar vaga preferencial / acessível?"

Se `location.has_notice = true`:
- Banner informativo `bg-mp-pale` com o texto de `location.notice`.

---

## 5. Step 3 — Pagamento

> ⚠️ **MVP: pagamento mockado.** Gateway real ainda não definido (Stripe BR vs Pagar.me vs Mercado Pago — decisão de negócio em aberto). Por enquanto o front simula o fluxo e o back confirma automaticamente.

### Métodos exibidos no MVP mockado
1. **PIX** — gera QR placeholder, confirma em ~3 segundos.
2. **Cartão de crédito** — aceita qualquer número que passe validação Luhn, confirma instantaneamente.

Boleto omitido no MVP (pra adicionar quando houver gateway real).

### Layout
Tabs no topo:
```
[📱 PIX] [💳 Cartão]
```

#### PIX (mock)
- Botão **"Gerar PIX"** → chama Edge Function `POST /functions/v1/mock-payment` com `booking_code` e `method='pix'`.
- A function:
  1. Cria registro em `payment` com `provider='mock'`, `status='pending'`, `provider_payment_id='mock_<uuid>'`.
  2. Agenda confirmação automática em **3 segundos** (via `pg_sleep` inline ou `setTimeout` no client antes de chamar a confirmação).
  3. Retorna QR code SVG **placeholder** (pode ser uma imagem genérica com "PIX MOCK" sobreposto) + linha "copia e cola" fake.
- UI mostra QR grande (256×256), botão "Copiar código", countdown "Confirmando pagamento… 00:03".
- Após 3s, polling detecta `payment.status = 'paid'` e avança pro Step 4.
- Botão extra **"⚡ Confirmar agora (mock)"** visível apenas em dev pra pular a espera.

#### Cartão (mock)
- Form com número, validade, CVV, nome.
- Validação client-side: Luhn check no número, MM/YY válido, CVV 3-4 dígitos.
- Cartões de teste sugeridos no helper text:
  ```
  Aprovado: 4111 1111 1111 1111
  Recusado: 4000 0000 0000 0002
  ```
- Click "Confirmar pagamento" → chama mesma Edge Function `mock-payment` com `method='card'`.
  - Se número termina em `0002` → simula recusa, mostra banner "Cartão recusado".
  - Caso contrário → confirma em ~1 segundo.
- Logado: salva cartão **mocked** em `payment_method` (só `last4` + `brand` — sem token real).

### Edge Function `mock-payment` (referência)
```
POST /functions/v1/mock-payment
{
  "booking_code": "MP-A8K7P2",
  "method": "pix" | "card",
  "fail": false  // opcional, força recusa pra teste
}
→ { payment_id, status: "pending" }

depois (após delay simulado): UPDATE payment SET status='paid', paid_at=now()
                              UPDATE booking SET status='confirmed'
                              INSERT location_parking_availability +1 (todas as datas)
```

Quando o gateway real entrar, troca a implementação dessa function — o front continua igual.

### Cupom de desconto
Acima das tabs (ou na sticky card):
```
[Aplicar cupom]
```
Click expande:
```
┌──────────────────────────────────┐
│ Código:                          │
│ [PROMO10            ] [Aplicar]  │
└──────────────────────────────────┘
```
Se válido: badge verde "Cupom aplicado — 10% OFF". Recalcula total no resumo.
Se inválido: mensagem `text-error` "Cupom inválido ou expirado".

### Validação antes de cobrar
- Reserva ainda em status `pending` e `expires_at > now()`.
- Capacidade ainda disponível (rechecagem server-side antes de chamar gateway).
- Termos aceitos.

---

## 6. Step 4 — Confirmação

Tela "Sucesso" full-width:

```
✅
Reserva confirmada!

Código: MP-A8K7P2
Aerovalet · Aeroporto de Guarulhos · Vaga coberta
10 jun, 22:00  →  15 jun, 08:00

[QR code 240×240]

[Baixar voucher PDF]  [Adicionar ao calendário ▾]

Próximos passos:
1. Imprima ou guarde o voucher.
2. Apresente o QR no acesso à vaga.
3. O shuttle te leva até o terminal.

──────────────────────────

Compartilhe sua experiência: você ganha R$ 20 de crédito a cada amigo
que reservar com seu link.   [Convidar amigos →]
```

Comportamentos:
- **E-mail** com voucher disparado server-side ao detectar `payment.status = paid`.
- **Calendar export**: dropdown com Google, Apple, Outlook, .ics.
- Persistência: rota agora vira `/bookings/MP-A8K7P2` (mesma URL pra acesso recorrente).
- Logado-anônimo: sugestão sticky "Crie sua conta com o e-mail usado pra acompanhar suas reservas mais facilmente."

---

## 7. Summary card (sticky direita, sempre visível)

Já mostrado no §2. Detalhes:

### Conteúdo
- **Operadora · Localização** (linha 1)
- **Tipo de vaga** (linha 2)
- **Check-in / Check-out** com data + hora local
- **Duração** ("5 diárias" / "8 horas")
- **Veículo** (após Step 2)
- **Breakdown de preço**:
  - Vaga × N diárias: R$ X
  - Add-ons: + R$ Y cada
  - Cupom: − R$ Z
  - **Total: R$ TOTAL**
- Mensagem do cancelamento ("Cancele grátis até 24h antes")

### Ações
- `[✏ Editar reserva]` → volta pro listing detail com os params populados (sem perder o booking, apenas re-cria).
- `[Cancelar e voltar]` → exclui o booking pendente, volta pro search.

### Mobile
Vira bottom bar minimal:
```
R$ 153,55 · Total              [Ver detalhes ▾]
```
Click "Ver detalhes" → bottom sheet com breakdown completo + ações.

---

## 8. Countdown / expiração

Banner sticky abaixo da topbar:
```
⏳  Sua vaga está reservada por 29:48
```

Cores conforme tempo restante:
- > 10 min: `bg-mp-pale text-mp-indigo`
- 5–10 min: `bg-badge-pending-bg text-badge-pending-fg`
- < 5 min: `bg-badge-cancelled-bg text-badge-cancelled-fg` (urgência)

Quando expira (`now > expires_at`):
- Booking transiciona pra `cancelled` server-side via job.
- Banner muda pra:
  ```
  ❌ Sua reserva expirou.   [Tentar novamente]
  ```
- Click → re-cria booking com os mesmos params (`POST /api/bookings` de novo) se ainda houver vaga.

---

## 9. Erros comuns

### Cartão recusado
Banner em vermelho no Step 3:
```
⚠️ Não conseguimos autorizar esse cartão.
   Confira os dados ou tente outra forma de pagamento.
```

### Booking expirado durante checkout
```
Sua reserva expirou enquanto você preenchia os dados.
[Tentar reservar novamente]
```

### Sem mais vaga (race condition)
Re-validation na criação do pagamento. Se outro cliente reservou a última vaga no meio do caminho:
```
Que pena — a vaga acabou de ser reservada por outra pessoa.
[Buscar outras vagas próximas]
```
Reembolso automático se já houver charge tentado.

### Documento inválido (CPF)
Mensagem inline abaixo do campo: "CPF inválido. Confira os números."

---

## 10. Save-and-resume

Se o usuário fechar a aba durante o checkout:
- Próxima vez que voltar pra `/checkout/MP-A8K7P2`: reabre exatamente no mesmo step, com dados parciais (salvos em `booking.notes` como JSON OU em uma tabela `booking_draft`).
- Se o booking já expirou: redireciona pro listing detail com os params originais.

---

## 11. Acessibilidade

- Stepper: `<ol>` com `aria-current="step"` no atual.
- Cada step é uma `<section aria-labelledby="step-{n}-title">`.
- Erros em campos: `aria-invalid="true"` + `aria-describedby="error-{field}"`.
- Countdown: `<div role="timer" aria-live="polite">`.
- PIX: o QR tem `aria-label="QR code Pix · valor R$ 153,55"`. Botão "Copiar código" usa `aria-label` claro.

---

## 12. Métricas

Eventos pra rastrear no funil:
- `checkout.opened` (entrada na URL)
- `checkout.step_1_completed`, ..., `step_3_completed`
- `checkout.payment_initiated`
- `checkout.payment_succeeded` / `payment_failed`
- `checkout.booking_confirmed`
- `checkout.expired`
- `checkout.coupon_applied`, `coupon_failed`
- `checkout.abandoned` (timeout sem step concluído)

---

## 13. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.text-input}` | Forms |
| `{component.button-primary}` | "Continuar" / "Confirmar pagamento" |
| `{component.reservation-card}` (adaptado) | Summary lateral |
| `{component.date-picker-day}` | Edição de datas |
| Stepper | Custom — não existe no Airbnb DS, criar |

---

## 14. Open points

- [ ] **Gateway de pagamento**: MVP mockado (ver §5). Decisão entre Stripe BR / Pagar.me / Mercado Pago fica para depois — quando entrar, troca só a Edge Function `mock-payment`, front fica igual.
- [ ] **PIX direto via BCB**: descartado pra MVP (requer DICT + certificados). Fica via gateway no futuro.
- [ ] **Endpoint de criação de booking**: Edge Function `POST /functions/v1/create-booking` ou tabela direta com policy? Precisa de validação atômica de capacidade (`SELECT FOR UPDATE`).
- [ ] **Job de expiração**: precisa de cron job (pg_cron ou Edge scheduled function) que transiciona bookings `pending` expirados.
- [ ] **Antifraude**: para cartão, validar 3DS quando disponível. Bloquear CPFs com histórico de chargeback (sem implementação MVP).
- [ ] **Estrutura de cupom**: hoje `coupon` é flat. Para "primeiro pedido", "indicação", precisaríamos de novas regras → futuro.
- [ ] **i18n no checkout**: fluxo de pagamento em PT-PT (Multibanco?) e EN. MVP só PT-BR + BRL.
- [ ] **CPF de visitante**: armazenamos em `profile.tax_id`. Mas se a pessoa **não** cria conta, o profile fica órfão. Tratar como soft-delete após X meses?
