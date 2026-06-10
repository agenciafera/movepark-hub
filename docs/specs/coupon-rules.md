# Cupons — Spec de Engenharia (pilar de código do motor de Cupons & Descontos)

> O motor de promoções tem **dois pilares**: **cupom** (código que o cliente digita — **este doc**)
> e **desconto automático** (regra da empresa aplicada direto no preço, sem código —
> [discount-rules.md](./discount-rules.md)). Eles **empilham**: o desconto automático entra no
> `simulate_price` e vira o subtotal; o cupom reduz o subtotal já descontado (ver
> [discount-rules.md](./discount-rules.md) §8).
>
> Fonte de verdade do **pilar de cupons**. Cobre modelo de dados, regras de validação,
> ciclo de vida do uso, RPCs, RLS, UI (checkout + operator + manager) e o plano de
> implementação/testes. **Ao mudar uma regra, atualize esta spec no mesmo PR.**

**Status:** ✅ implementado (Fase 1 + Fase 2) na migration `20260611000000_coupon_engine.sql`.
Ciclo de uso (trigger no pagamento), regra única `coupon_evaluate`, RPCs de gestão,
`validate_coupon` (preview), painel operator `/operator/coupons`, cupom no listing +
desconto no checkout, elegibilidade (`per_user_limit`/`min_amount`/`min_days`/tipo de vaga) e
testes (pgTAP `coupon_rpc.test.sql` + Vitest de lógica). §2/§12 ficam como registro histórico
do que foi entregue.

Relacionado: [booking-flow.md](./booking-flow.md) · [pricing-engine.md](./pricing-engine.md) ·
[operator-panel.md](./operator-panel.md) §4.6 · [database-schema.md](./database-schema.md) ·
[customer/checkout.md](./customer/checkout.md) §5.

---

## 1. Estado atual (o que já existe)

| Camada | Situação |
|---|---|
| Tabela `coupon` | ✅ baseline (`company_id`, `code`, `discount_type`, `discount_value`, `valid_from`, `valid_until`, `max_uses`, `times_used`, `is_active`, timestamps). Unique `(company_id, code)`, checks de não-negatividade, índice `coupon_company_id_idx`, trigger `set_updated_at`. |
| Enum `discount_type` | ✅ `percent` \| `fixed`. |
| Tabela `booking_coupon` | ✅ `(booking_id, coupon_id)` PK, `discount_applied` (snapshot), FK `coupon` `ON DELETE RESTRICT`. |
| RLS | ✅ leitura: catálogo público só `is_active`; operator vê os da própria empresa; `booking_coupon` só do dono da reserva. **Sem RLS de escrita** (igual add-ons). |
| Validação na reserva | ✅ embutida em `create_booking_atomic` (código existe + mesma empresa da unidade + ativo + janela de validade + `times_used < max_uses`). |
| Cálculo do desconto | ✅ `percent`: `round(subtotal × value/100, 2)`; `fixed`: `least(value, subtotal)`. Incide sobre o **subtotal de estacionamento** (antes dos add-ons). |
| Retorno | ✅ `create_booking_atomic` devolve `subtotal`, `discount`, `total_amount` no JSON. |
| Snapshot | ✅ grava `booking_coupon` quando `discount > 0`. |
| Edge / client | ✅ `create-booking` e `useCreateBooking()` aceitam `coupon_code`. |

> **Importante:** a base já é sólida. O grosso do trabalho é **fechar o ciclo de uso**,
> **expor no produto** (UI) e **cobrir com testes** — não reescrever o núcleo.

---

## 2. Gap analysis (o que falta)

**Backend**
- [ ] `coupon.times_used` **nunca é incrementado** — não há gatilho no pagamento confirmado.
- [ ] Não há RPC de **pré-validação** (`validate_coupon`) para o checkout mostrar o desconto antes de criar a reserva.
- [ ] `simulate_price` não aceita cupom.
- [ ] Não há RPCs de **gestão** (`operator_upsert_coupon` / `operator_delete_coupon`).
- [ ] Regra "usuário já usou" (`per_user_limit`) e elegibilidade (`min_amount`, `min_days`, restrição por tipo de vaga) não existem.
- [ ] Validação duplicada em texto: o algoritmo vive só dentro de `create_booking_atomic`; deveria ser uma função SQL reutilizável.

**Frontend — checkout**
- [ ] Sem input de cupom (aplicar/limpar, mensagens de erro/sucesso).
- [ ] `SummaryCard` não exibe a linha de desconto.
- [ ] `BookingForCheckout` / `useCheckoutBooking()` não carregam `booking_coupon`.

**Frontend — gestão**
- [ ] Operator não tem CRUD de cupons (criar, listar, editar, ativar/desativar, ver uso).
- [ ] Manager não tem visão/relatório de cupons.

**Testes**
- [ ] Zero testes de cupom (pgTAP, unit de cálculo, componente, integração).

---

## 3. Decisões de design

| # | Decisão | Racional |
|---|---|---|
| D1 | **Cupom é da empresa** (`coupon.company_id`); quem gerencia é o **operator** (e `hub_admin` por override). Cupom global de plataforma fica como evolução futura. | Coerência com o schema atual e com o módulo de add-ons (mesmo padrão de RPC `SECURITY DEFINER` + guard `*_assert_company_access`). |
| D2 | **Desconto incide sobre o subtotal de estacionamento**, não sobre serviços adicionais. | É o comportamento atual de `create_booking_atomic`; mantém previsibilidade. Documentado explicitamente para não regredir. |
| D3 | `times_used` incrementa **uma única vez, quando o pagamento é confirmado** (`payment.status → 'paid'`), via **trigger** em `payment`. Cancelamento **não** decrementa. | Funciona para qualquer caminho de confirmação (mock hoje, gateway real depois) sem acoplar à Edge Function. Idempotente por reserva. |
| D4 | A validação vira **uma função SQL reutilizável** (`coupon_evaluate`) chamada por `validate_coupon` (preview) e por `create_booking_atomic` (autoritativa). | Uma só fonte de verdade da regra; evita divergência. |
| D5 | `discount_applied` em `booking_coupon` é **snapshot imutável**. Mudanças posteriores no cupom não afetam reservas passadas. | Auditoria/financeiro corretos. Já é assim. |
| D6 | Escrita só por **RPC `SECURITY DEFINER`** (sem RLS de escrita direta na tabela). | Mesmo modelo de add-ons; centraliza autorização e validação. |
| D7 | `per_user_limit`, `min_amount`, `min_days` e restrição por tipo de vaga entram como **Fase 2** (schema já preparado, regra plugável em `coupon_evaluate`). | Mantém o MVP enxuto sem fechar a porta. |

---

## 4. Modelo de dados

### 4.1 Existente (mantém)
`coupon`, `booking_coupon`, enum `discount_type` — conforme §1.

### 4.2 Alterações propostas

**Migration `AAAAMMDDHHMMSS_coupon_engine.sql`:**

```sql
-- Elegibilidade (Fase 2 — colunas opcionais, default = sem restrição)
alter table public.coupon
  add column if not exists per_user_limit integer,          -- null = ilimitado por usuário
  add column if not exists min_amount      numeric(12,2),   -- null = sem mínimo
  add column if not exists min_days         integer,         -- null = sem mínimo
  add column if not exists description       text,            -- rótulo interno/explicação
  add column if not exists sort_order        integer not null default 0;

alter table public.coupon
  add constraint coupon_per_user_limit_check check (per_user_limit is null or per_user_limit > 0),
  add constraint coupon_min_amount_check     check (min_amount is null or min_amount >= 0),
  add constraint coupon_min_days_check       check (min_days  is null or min_days  >= 1);

-- Restrição por tipo de vaga (Fase 2 — sem linhas = vale para todos)
create table if not exists public.coupon_parking_type (
  coupon_id               uuid not null references public.coupon(id) on delete cascade,
  company_parking_type_id uuid not null references public.company_parking_type(id) on delete cascade,
  primary key (coupon_id, company_parking_type_id)
);

-- Índice de busca por código (case-insensitive) dentro da empresa
create index if not exists coupon_company_code_idx
  on public.coupon (company_id, lower(code));
```

> `code` é normalizado para **UPPERCASE** na escrita (RPC) e comparado case-insensitive na leitura.

### 4.3 Diagrama (alvo)

```
coupon
├── id, company_id → company
├── code (UNIQUE por empresa, UPPERCASE), description, discount_type, discount_value
├── valid_from, valid_until, max_uses, times_used, is_active, sort_order
├── per_user_limit, min_amount, min_days          (Fase 2)
└── created_at, updated_at

coupon_parking_type   (Fase 2 — restrição opcional)
└── (coupon_id, company_parking_type_id)

booking_coupon  (snapshot por reserva)
└── (booking_id, coupon_id), discount_applied
```

---

## 5. Ciclo de vida do uso (`times_used`)

```
Reserva criada  ──► booking_coupon gravado (snapshot)   [times_used NÃO muda]
Pagamento pago  ──► trigger incrementa coupon.times_used  [+1, uma vez]
Reserva expira/cancela antes do pagamento ──► nada acontece
Reserva cancelada após pagamento ──► times_used NÃO decrementa
```

**Trigger (proposto):**

```sql
create or replace function public.coupon_bump_on_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- só na transição para 'paid'
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.coupon c
       set times_used = times_used + 1
      from public.booking_coupon bc
     where bc.booking_id = new.booking_id
       and bc.coupon_id  = c.id;
  end if;
  return new;
end; $$;

create trigger payment_bump_coupon
  after insert or update of status on public.payment
  for each row execute function public.coupon_bump_on_payment();
```

> **Idempotência:** o gatilho dispara só na transição `→ paid`; como há no máximo um
> `booking_coupon` por reserva e o pagamento confirma uma única vez, o incremento é único.
> Caso o domínio passe a permitir múltiplos pagamentos por reserva, adicionar guarda por
> `booking_coupon.counted_at`.

---

## 6. Algoritmo de validação (`coupon_evaluate`)

Função SQL pura de avaliação. Recebe contexto e devolve veredito + desconto.

**Assinatura proposta:**
```
coupon_evaluate(
  p_code text,
  p_location_id uuid,
  p_profile_id uuid,
  p_subtotal numeric,          -- subtotal de estacionamento (base do desconto)
  p_days integer,
  p_company_parking_type_id uuid
) returns table(coupon_id uuid, discount numeric, error_code text)
```

**Passos (ordem importa):**

```
1.  code existe na empresa da unidade?            não → 'invalid'
2.  is_active = true?                             não → 'inactive'
3.  valid_from  is null or <= now()?              não → 'not_yet_valid'
4.  valid_until is null or >= now()?              não → 'expired'
5.  max_uses is null or times_used < max_uses?    não → 'exhausted'
6.  [Fase 2] min_days  is null or p_days >= min_days?      não → 'min_days'
7.  [Fase 2] min_amount is null or p_subtotal >= min_amount? não → 'min_amount'
8.  [Fase 2] restrição por tipo de vaga atende?   não → 'not_eligible_type'
9.  [Fase 2] per_user_limit: usos do usuário < limite?     não → 'already_used'
       (conta booking_coupon ⋈ booking onde profile_id = p_profile_id
        e booking.status NOT IN ('cancelled') / pagamento pago)
→ válido: discount = aplica §7
```

**Mensagens de UI** (o backend devolve `error_code`; o front mapeia para texto pt-BR;
por segurança, motivos sensíveis colapsam para "Cupom inválido ou expirado"):

| error_code | Mensagem ao cliente |
|---|---|
| `invalid` / `inactive` / `not_eligible_type` | Cupom inválido ou expirado |
| `not_yet_valid` | Este cupom ainda não está válido |
| `expired` | Cupom expirado |
| `exhausted` | Cupom esgotado |
| `min_days` | Válido só para estadias a partir de N diárias |
| `min_amount` | Válido só para reservas a partir de R$ X |
| `already_used` | Você já utilizou este cupom |

`create_booking_atomic` e `validate_coupon` **ambas** chamam `coupon_evaluate` — a regra
vive num lugar só (D4).

---

## 7. Aplicação do desconto

```
base = subtotal_estacionamento            (NÃO inclui serviços adicionais — D2)

percent: discount = round(base × discount_value / 100, 2)
fixed:   discount = least(discount_value, base)      -- nunca > base, nunca negativo

total_final = (base - discount) + soma(add_ons)
```

- Arredondamento em 2 casas (BRL).
- `discount` nunca torna o total negativo.
- O `discount` calculado é gravado em `booking_coupon.discount_applied` (snapshot).

---

## 8. Backend — RPCs e funções

Seguindo o padrão dos add-ons ([operator-panel.md](./operator-panel.md) §4.5):

| Função | Tipo | Responsabilidade |
|---|---|---|
| `coupon_assert_company_access(company_id)` | `SECURITY DEFINER` | Guard: `hub_admin` ou membro via `profile_company`. Reaproveitar o padrão `addon_assert_company_access`. |
| `coupon_evaluate(...)` | `STABLE` (sem definer; lê via tabelas) | Avaliação da regra (§6). Usada pela criação e pelo preview. |
| `operator_upsert_coupon(p_company_id, p_id, p_code, p_description, p_discount_type, p_discount_value, p_valid_from, p_valid_until, p_max_uses, p_is_active, p_sort_order, …Fase2)` | `SECURITY DEFINER` | Cria/edita cupom. Normaliza `code` p/ UPPERCASE; valida `discount_value` (percent ≤ 100); unique `(company_id, code)`. |
| `operator_set_coupon_active(p_coupon_id, p_is_active)` | `SECURITY DEFINER` | Ativa/desativa rápido. |
| `operator_delete_coupon(p_coupon_id)` | `SECURITY DEFINER` | Exclui. **Bloqueia** se houver `booking_coupon` referenciando (FK `RESTRICT`) → orienta desativar. |
| `validate_coupon(p_code, p_location_parking_type_id, p_check_in_at, p_check_out_at)` | `SECURITY DEFINER` (precisa do `auth.uid()`) | **Preview** p/ checkout: resolve subtotal+dias via motor de preço, chama `coupon_evaluate`, retorna `{ valid, discount, total_preview, error_code }`. Não grava nada. |
| `coupon_bump_on_payment()` + trigger | `SECURITY DEFINER` | Incremento de `times_used` (§5). |

**Mudanças em `create_booking_atomic`:** substituir o bloco inline de validação por chamada
a `coupon_evaluate` (passando `profile_id`, `days`, `company_parking_type_id`), preservando o
retorno atual (`subtotal`/`discount`/`total_amount`).

**Grants:** `revoke all … from public` + `grant … to authenticated, service_role` em todas
as RPCs (idem add-ons). ⚠️ **Atenção à assinatura** no `revoke/grant`: contar os tipos exatos
(ver bug histórico no módulo de add-ons). Usar dollar-quotes **nomeados** (`$fn$`) nos corpos
porque o aplicador de migration faz split ingênuo por `;`.

---

## 9. Edge Functions

- `create-booking`: **sem mudança** de contrato — já repassa `coupon_code`. Garantir que
  o erro de cupom da RPC volte com status/mensagem adequada (já trata `P0001`).
- **Validação no checkout**: o front chama `validate_coupon` **direto via `supabase.rpc`**
  (não precisa de Edge Function nova). Se for preciso rodar sem sessão (guest, v2), criar
  endpoint `validate-coupon` com anon key.
- `mock-payment`: **sem mudança** — o incremento vem do trigger em `payment` (§5). Apenas
  garantir que ele escreve `payment.status='paid'` (já escreve).

---

## 10. RLS & segurança

- Leitura permanece como hoje (catálogo público só `is_active`; operator vê os próprios;
  `booking_coupon` só do dono).
- **Escrita só via RPC `SECURITY DEFINER`** (D6) — nenhuma policy de `INSERT/UPDATE/DELETE`
  direta em `coupon` / `coupon_parking_type`.
- `validate_coupon` não vaza existência: para motivos sensíveis devolve `error_code='invalid'`.
- `code` nunca é enumerável publicamente (sem listagem pública de cupons).

---

## 11. Frontend

### 11.1 Checkout (cliente) — `customer/checkout.md` §5
- Componente `CouponInput` (feature `checkout` ou nova feature `coupons`): campo + botão
  **Aplicar**; estado aplicado mostra badge verde ("Cupom X — 10% OFF") + **Remover**.
- Ao aplicar: chama `validate_coupon` → em erro, mostra mensagem do mapa (§6); em sucesso,
  guarda `coupon_code` no estado do checkout e exibe a prévia.
- `SummaryCard`: nova linha **"Cupom — − R$ Z"** entre subtotal/add-ons e o **Total**.
- `useCheckoutBooking()` / `BookingForCheckout`: carregar `booking_coupon(discount_applied, coupon(code, discount_type, discount_value))` para exibir o desconto **na reserva já criada**.
- `useCreateBooking()`: já envia `coupon_code`; expor `discount` do retorno para confirmação.
- **Lógica pura testável** em `checkout/coupon.logic.ts` (mapa de `error_code`→texto,
  formatação "X% OFF" / "− R$ Y", cálculo de total previsto).

### 11.2 Operator — painel de Cupons (`/operator/coupons`)
Espelha o módulo de add-ons. Ver [operator-panel.md](./operator-panel.md) §4.6.
- Feature `src/features/coupons/` com `api.ts` (hooks TanStack: `useCompanyCoupons`,
  `useUpsertCoupon`, `useSetCouponActive`, `useDeleteCoupon`), `coupons.logic.ts`,
  `CouponForm.tsx`, página `src/routes/operator/coupons.tsx`.
- Tabela: `Código` · `Desconto` (10% / R$ 5) · `Validade` · `Usos` (`times_used / max_uses`) ·
  `Status` · Ações (Editar, Ativar/Desativar, Excluir).
- Form: código, descrição, tipo (percent/fixed), valor, janela de validade, `max_uses`,
  ativo; (Fase 2) `min_amount`, `min_days`, `per_user_limit`, tipos de vaga.
- Tipos curados em `@/types/domain` (`Coupon`, `CouponWithUsage`).
- Item de nav "Cupons" na `Sidebar` (ícone `Ticket`/`BadgePercent`).

### 11.3 Manager (Fase 2)
- Visão read-only de cupons por empresa + relatório "cupons mais usados / desconto total
  concedido" reutilizando `booking_coupon`. Sem CRUD (operador é o dono).

---

## 12. Plano de implementação (faseado)

### Fase 1 — Fechar o ciclo + gestão (MVP do motor)
1. **Migration** `coupon_engine.sql`: trigger de incremento (§5), `coupon_evaluate` (§6 sem
   Fase 2), `operator_upsert_coupon` / `operator_set_coupon_active` / `operator_delete_coupon`,
   `coupon_assert_company_access`, `validate_coupon`; refatorar `create_booking_atomic` para
   usar `coupon_evaluate`. `bun run gen:types`.
2. **pgTAP** `coupon_rpc.test.sql` (§13).
3. **Operator panel**: feature `coupons/` + página + nav + tipos.
4. **Checkout**: `CouponInput` + `validate_coupon` + linha de desconto no `SummaryCard` +
   carregar `booking_coupon`. Lógica pura + testes.
5. **Specs**: atualizar esta + `operator-panel.md` + `booking-flow.md` + `customer/checkout.md`.

### Fase 2 — Elegibilidade & relatórios
6. Colunas `per_user_limit` / `min_amount` / `min_days` + `coupon_parking_type` (já na §4.2)
   plugadas em `coupon_evaluate` (passos 6–9). Form do operator ganha os campos.
7. `simulate_price` aceita cupom (preview no listing antes do checkout).
8. Manager: relatório de uso.

### Definition of Done (cada fase)
- `bun run typecheck` + `bun run lint` limpos; `bun run test` verde (gate).
- Migration aplicada + `gen:types` commitado + specs atualizadas no mesmo PR.
- Cobertura nova: regra → pgTAP; lógica/UI → Vitest; bug → teste de regressão.

---

## 13. Matriz de testes

### pgTAP — `supabase/tests/coupon_rpc.test.sql`
- [ ] `operator_upsert_coupon` cria (code normalizado UPPERCASE, defaults) e edita por id.
- [ ] percent > 100 é rejeitado; `discount_value` negativo rejeitado.
- [ ] `operator_set_coupon_active` ativa/desativa.
- [ ] `operator_delete_coupon` **bloqueia** quando há `booking_coupon` (FK RESTRICT); permite quando livre.
- [ ] Guard de escopo: usuário fora da empresa → `42501`.
- [ ] `coupon_evaluate`: inválido / inativo / `not_yet_valid` / `expired` / `exhausted`.
- [ ] Cálculo: percent (`round`) e fixed (`least(value, subtotal)`), nunca negativo.
- [ ] **Incremento**: ao marcar `payment.status='paid'`, `times_used` += 1 **uma vez**.
- [ ] Cancelar após pago **não** decrementa.
- [ ] Reserva criada mas não paga → `times_used` inalterado.
- [ ] (Fase 2) `min_days`, `min_amount`, `per_user_limit`, restrição por tipo de vaga.

### Vitest — lógica pura
- [ ] `coupons.logic.ts` (operator): validação do form (valor/percent/janela), build de args, formatação de "usos".
- [ ] `checkout/coupon.logic.ts`: mapa `error_code`→mensagem, "X% OFF" / "− R$ Y", total previsto.

### Vitest — componente (Testing Library + MSW)
- [ ] `CouponInput`: aplica válido (badge + desconto), aplica inválido (mensagem), remove.
- [ ] `SummaryCard` exibe a linha de desconto quando há cupom.
- [ ] `CouponForm` (operator): cria/edita, exibe erro da RPC.

### Integração (banco vivo) — opcional
- [ ] `validate_coupon` contra dados de seed reproduz o desconto golden.

---

## 14. Convenção de migrations
- Uma migration nova `AAAAMMDDHHMMSS_coupon_engine.sql` (Fase 1). Fase 2 em migration separada.
- Nomes singular, `lower_snake`, dollar-quotes **nomeados** nos corpos de função.
- Após aplicar: `bun run gen:types` e atualizar o catálogo em [README.md](./README.md).

---

## 15. Open points / decisões a confirmar
- **Cupom de plataforma** (global, `company_id` nulo, criado pelo `hub_admin`) — fora do MVP; exigiria ajuste em `coupon_evaluate` (match por unidade *ou* global) e numa policy de leitura.
- **Empilhamento**: hoje **um** cupom por reserva (`booking_coupon` PK por reserva permite vários, mas a regra de negócio é 1). Manter 1 no MVP.
- **Cupom nominativo** (`coupon.profile_id`) — coberto por `per_user_limit`=1 + futura coluna; decidir se entra na Fase 2.
- **Desconto sobre add-ons** — D2 fixa em "não". Reavaliar se o produto pedir promoções de serviços.
- **Arredondamento** de `percent` — `round(…, 2)` (banker's vs half-up): seguir o do motor de preço para consistência.

---

## 16. Notas do legado
- Legado tinha **CouponGroup** (validade no grupo) + **Coupon** (código). No Hub colapsado em `coupon` único com validade direta.
- Legado permitia `max_usage_per_user` ≠ `max_usage` global → mapeia para `per_user_limit` (Fase 2).
- Cupom nominativo do legado → `per_user_limit` e/ou `profile_id` futuro.
