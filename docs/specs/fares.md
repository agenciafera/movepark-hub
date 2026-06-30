# Tarifas de flexibilidade da reserva (E2.8 · Básica / Flex / Superflex)

> **Status:** E2.8-e (núcleo financeiro) **implementado** — migration `20260717000000_fare_tiers.sql`
> aplicada, Edges de criação/cobrança/cancelamento deployadas. Front (seletor no checkout E2.8-b,
> detalhe da reserva E2.8-c, upgrade pós-reserva E2.8-d) e admin de config por unidade (E2.8-f) são
> as próximas subtarefas; auto-extensão por atraso de voo + notificações SMS/WhatsApp são o passo 2
> da E2.8-e.

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

## Testes

- **Vitest** (`src/lib/fares.test.ts`): conversão de preço, janela de cancelamento (24h × 1 min),
  delta de upgrade, integridade dos rótulos de benefício.
- **Deno** (`_shared/payments/split.test.ts`): a Tarifa cai 100% na Movepark sem tocar o repasse do
  parceiro (com/sem take_rate, com juros de parcelamento). `cancel-booking/logic.test.ts`: estorno
  Superflex a 2h do check-in, Flex fora da janela, prioridade do snapshot sobre o fallback 24h.
- **pgTAP** (`supabase/tests/fare_tiers.test.sql`): schema/seed/RLS, `get_unit_fares`, e criação de
  reserva com Tarifa (total +12,90 / +24,90, snapshot de `fare_cancel_until`).

## Pendências (próximas subtarefas E2.8)

- **E2.8-b/c/d** (front): seletor no checkout, Tarifa no detalhe da reserva + ações, upgrade pós-reserva.
- **E2.8-f** (admin): config de preço/on-off por unidade (overrides via `get_unit_fares`) + honrar
  troca de placa/cancelamento mesmo onde o white-label não permite.
- **E2.8-e passo 2:** auto-extensão por atraso de voo (Superflex) + disparo de SMS/WhatsApp (Flex+).
