# Tarifas de flexibilidade da reserva (E2.8 · Básica / Flex / Superflex)

> **Status:** E2.8-e **completa no backend** — núcleo financeiro (`20260717000000_fare_tiers.sql`) +
> passo 2 (auto-extensão por atraso de voo + notificações SMS/WhatsApp, `20260718000000_fare_flight_extension.sql`)
> aplicados; Edges deployadas. Front (seletor no checkout E2.8-b, detalhe da reserva E2.8-c, upgrade
> pós-reserva E2.8-d) e admin de config por unidade (E2.8-f) são as próximas subtarefas.

## O que é (e o que não é)

A **Tarifa** é a flexibilidade da **própria reserva**, vendida no checkout no padrão good-better-best
(modelo de companhia aérea). **Não** é assinatura. Vocabulário fixado no épico:

- **Tarifa** = flexibilidade da reserva (este doc).
- **Adicionais** = extras à la carte (sala VIP, pet, lavagem) — dependem do parceiro, vêm depois.
- **Clube / Prime** = assinatura/fidelidade — E3.1.

## Os três níveis (preços aprovados — E2.8-g, jun/2026)

| Tarifa | Preço | Janela de cancelamento grátis | Benefícios (cumulativos) |
|---|---|---|---|
| **Básica** | Grátis (no preço da vaga) | até **24h** antes | vaga garantida, confirmação por e-mail, cancelamento grátis |
| **Flex** ⭐ | **R$ 12,90** | até **24h** antes | + troca de placa/veículo, alteração de data/horário, avisos SMS/WhatsApp |
| **Superflex** | **R$ 24,90** | até **1 min** antes (estorno total) | + proteção contra atraso de voo (auto-extensão), suporte prioritário |

Flex é marcada como **"Mais popular"** (efeito isca; Superflex ancora). Preços são hipótese inicial
para A/B — por isso vivem em catálogo (tabela `fare`), não em código.

## Receita = serviço Movepark (fora do split da vaga)

A Tarifa é **receita de serviço da Movepark** (margem ~93%), com **nota própria**, e **nunca** entra
no `take_rate` nem no repasse do parceiro. No split da cobrança (ADR-004), isso é roteado reusando o
mecanismo de **"excedente"** do `buildSplit` (`_shared/payments/split.ts`):

```
base (parceiro)   = total − tarifa          → perna do parceiro = base − comissão
charged (cliente) = total (+ juros cartão)  → perna da Movepark = comissão + tarifa (+ juros)
```

Como `chargedCents > baseCents`, a tarifa cai inteira na perna da Movepark. Invariante mantida: a
soma do split == valor cobrado. Implementado em `create-pix-charge` e `create-card-charge` (ambas
descontam `booking.fare_price_cents` do base do parceiro; no cartão o cliente parcela o total
vaga+tarifa e os juros incidem sobre esse total).

## Modelo de dados (`20260717000000_fare_tiers.sql`)

| Objeto | Papel |
|---|---|
| enum `fare_tier` | `basica` / `flex` / `superflex` |
| tabela `fare` | catálogo global: `price_cents`, `sort_order`, `is_popular`, `cancel_window_minutes` (1440 / 1440 / 1), `benefits` (jsonb de flags), `is_active`. RLS: **leitura pública**, escrita só `hub_admin`. Seedada com os preços aprovados |
| `booking.fare_tier` | Tarifa contratada (default `basica`) |
| `booking.fare_price_cents` | snapshot do preço da Tarifa (receita Movepark) |
| `booking.fare_cancel_until` | snapshot do **prazo de cancelamento grátis** (verdade do estorno) |
| `booking.fare_benefits` | snapshot dos benefícios contratados (o que a Tarifa cobre) |
| RPC `get_unit_fares(lpt_id?)` | Tarifas ativas para o checkout. O parâmetro é reservado para os **overrides por unidade** (preço/on-off) da E2.8-f; hoje devolve o catálogo global |

`benefits` (flags): `free_cancellation`, `email_confirmation`, `guaranteed_spot`, `plate_change`,
`date_change`, `notifications_sms`, `flight_delay_protection`, `priority_support`.

## Criação da reserva com Tarifa

`_create_booking_core` (e os wrappers `create_booking_atomic` / `api_create_booking`) ganharam o
parâmetro `p_fare_tier` (default `basica`, retrocompatível). No núcleo:

1. resolve a Tarifa no catálogo (tem que estar ativa) — senão `Tarifa indisponível.`;
2. soma `fare_price` ao `total_amount` e ao `price_breakdown` (linha `kind: 'fare'`, só quando paga);
3. calcula o snapshot `fare_cancel_until = check_in − cancel_window_minutes`;
4. grava `fare_tier` / `fare_price_cents` / `fare_cancel_until` / `fare_benefits` na reserva.

A Edge `create-booking` repassa `fare_tier` do payload. Espelho de apresentação/lógica de janela em
`src/lib/fares.ts` (rótulos pt-BR dos benefícios + `fareCancelDeadline`/`isWithinFareCancelWindow` +
`fareUpgradeDeltaCents` para a E2.8-d), com teste de paridade em `src/lib/fares.test.ts`.

## Cancelamento/estorno por Tarifa (integra E0.3.2)

A janela de cancelamento grátis deixou de ser o fixo de 24h e passou a ser o **`fare_cancel_until`**
snapshot da reserva — Superflex cancela com estorno **até 1 min antes** do check-in. A decisão mora
em `cancel-booking/logic.ts` (`refundDecision` → `withinFreeWindow(checkIn, now, fareCancelUntil)`):

- **cliente** estorna só dentro da janela da Tarifa; fora dela, cancela **sem** estorno;
- **staff** (hub_admin/operador) estorna como override a qualquer momento (inalterado);
- reservas anteriores à E2.8 (sem snapshot) caem no **fallback de 24h** (PRD-12).

O resto do fluxo de estorno (idempotência, `cancel_booking_with_release`, webhook `charge.refunded`)
é o de [payment-split.md](./payment-split.md) / [booking-flow.md](./booking-flow.md) — inalterado.

## Auto-extensão por atraso de voo (Superflex · `20260718000000`)

Benefício `flight_delay_protection` (só Superflex): estende `check_out_at` cobrindo diária(s) extra(s)
**sem cobrança**. A regra é server-authoritative na RPC **`extend_booking_flight_delay(booking_id,
new_check_out_at, actor?, reason?)`** (SECURITY DEFINER, grant só `service_role`):

1. exige a reserva com `fare_benefits.flight_delay_protection` (senão recusa) e status `confirmed`/`checked_in`;
2. nova saída tem que ser **depois** da atual (auto-guarda contra reentrada);
3. **re-segura a capacidade** só das datas adicionadas (mesma regra do hold de criação: `blocked` +
   `booked + external < capacity`, sob `for update`) — resolve o lote via `booking_item` + `location`,
   já que a `booking` não guarda o `location_parking_type_id`;
4. estende `check_out_at` (sem tocar `total_amount`) e registra em **`booking_fare_extension`** (log).

A Edge **`extend-booking`** (JWT; dono ou staff, mesma autz do `cancel-booking`) chama a RPC e dispara
a notificação. **Follow-up:** a propagação da extensão ao white-label (o outbox `wl_delivery` modela
`reserve`/`release`, não `extend`) e o gatilho automático por uma API de voos ficam para depois — hoje
a extensão é acionada manualmente (cliente/staff).

## Notificações SMS/WhatsApp (Flex+)

Tarifas com `fare_benefits.notifications_sms` (Flex e Superflex) recebem aviso por WhatsApp. Sender
reutilizável em **`_shared/whatsapp.ts`** (Meta Cloud API, mensagens de **template**), que **degrada
como o e-mail**: sem config/template aprovado, loga e segue (nunca derruba o chamador). Pontos de
disparo (best-effort, pós-resposta):

- **Confirmação** — no `pagarme-webhook`, ao confirmar a reserva (template `WHATSAPP_BOOKING_CONFIRMED_TEMPLATE`).
- **Extensão** — na Edge `extend-booking` (template `WHATSAPP_BOOKING_EXTENDED_TEMPLATE`).

> ⚠️ Mensagens iniciadas pela Movepark (fora da janela de 24h) exigem **template aprovado no Meta**.
> A infra está pronta e parametrizada por env; ativar = aprovar os templates e setar os secrets.

## Testes

- **Vitest** (`src/lib/fares.test.ts`): conversão de preço, janela de cancelamento (24h × 1 min),
  delta de upgrade, integridade dos rótulos de benefício.
- **Deno** (`_shared/payments/split.test.ts`): a Tarifa cai 100% na Movepark sem tocar o repasse do
  parceiro (com/sem take_rate, com juros de parcelamento). `cancel-booking/logic.test.ts`: estorno
  Superflex a 2h do check-in, Flex fora da janela, prioridade do snapshot sobre o fallback 24h.
  `_shared/whatsapp.test.ts` (config/components/telefone) + `extend-booking/logic.test.ts` (parsing).
- **pgTAP** (`supabase/tests/fare_tiers.test.sql`): schema/seed/RLS, `get_unit_fares`, e criação de
  reserva com Tarifa (total +12,90 / +24,90, snapshot de `fare_cancel_until`).
  `fare_extension.test.sql`: extensão Superflex (+1 diária, total inalterado, capacidade re-segurada,
  log) + rejeições (Flex, nova saída ≤ atual, reserva inexistente).

## Front (E2.8-b/c/d) — implementado

- **E2.8-b · Seletor no checkout:** `src/features/fares/` — `useUnitFares` (RPC `get_unit_fares`) +
  `FareTierSelector` (good-better-best, Flex "Mais popular", default Básica). Integrado no
  `ReservationCard` (Tarifa no payload de `create-booking`, total/breakdown, rótulo de cancelamento)
  e no `SummaryCard` do checkout.
- **E2.8-c · Detalhe da reserva:** `FareDisplay` (nível, benefícios cobertos, "cancelável até …"
  via `fare_cancel_until`) no detalhe; `cancellationStatus`/`CancelBookingDialog` respeitam a janela
  da Tarifa (Superflex = 1 min). _Pendente: ações de trocar placa/veículo e alterar data (RPCs novos)._
- **E2.8-d · Upgrade pós-reserva:** cobra o **delta** (alvo − atual) como cobrança PIX de serviço
  Movepark (split 100% master). Migration `20260720000000` (`payment.kind`/`fare_target_tier` + RPC
  `apply_fare_upgrade`), Edge `create-fare-upgrade`, ramo `fare_upgrade` no `pagarme-webhook` (promove
  a Tarifa quando pago — sem confirmar/voucher), UI `FareUpgradeDialog` + botão no detalhe. Sem
  downgrade; idempotente. Validado e2e (Flex→Superflex, delta R$12 → reserva vira Superflex).

## E2.8-f · Config de Tarifa por unidade (Frente A) — implementado

`location_fare` (override por unidade: `enabled` + `price_cents_override`, RLS leitura pública +
escrita hub_admin) sobrepõe o catálogo global. `get_unit_fares(lpt)` faz o **overlay**
(`coalesce(override, catálogo)` + filtra desabilitadas); `_create_booking_core` usa o **preço/on-off
efetivo da unidade** (checkout e cobrança batem). Escrita via RPC **`operator_set_unit_fare`**
(gate `pricing:write`/hub_admin). UI: `/operator/fares` (`FareConfigCard` por tipo de vaga) +
`useLocationFareConfig`/`useSetUnitFare`. Migration `20260721000000`.

## E2.8-f · Honrar alterações (Frente B) — troca de veículo implementada

**Trocar placa/veículo** (benefício `plate_change`, Flex+): Edge **`change-booking-vehicle`** (dono ou
staff; valida benefício/status/posse do veículo) troca `booking.vehicle_id` e **regenera o voucher** —
resolve a dor do white-label que não troca placa (registramos do nosso lado). UI: `ChangeVehicleDialog`
+ botão "Trocar veículo" no detalhe da reserva (gate `plate_change` + antes da entrada);
`useChangeBookingVehicle`. Staff faz override (sem exigir o benefício). Fecha o "trocar placa" da E2.8-c.

## Pendências (próximas subtarefas E2.8)

- **Alterar data/horário** (benefício `date_change`): re-hold de capacidade do novo período + re-preço
  + tratamento do delta de pagamento (cobrar/estornar a diferença) numa reserva paga. É a peça mais
  pesada (toca capacidade + pricing + pagamento) e merece um passo próprio — ainda não implementada.
- **Ação de troca de veículo no painel do operador** (a capability/Edge já existe; falta o botão na
  `BookingDrawer`).
- **Follow-ups da E2.8-e:** propagação da extensão ao white-label (`wl_delivery` não modela `extend`)
  e gatilho automático da auto-extensão por uma API de rastreio de voos; aprovação dos templates de
  WhatsApp no Meta para ativar as notificações.
