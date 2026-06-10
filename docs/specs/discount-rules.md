# Motor de Descontos Automáticos — Spec de Engenharia

> O módulo de promoções tem **dois pilares** que juntos formam o motor de **Cupons & Descontos**:
>
> | Pilar | Quem aciona | Onde incide | Spec |
> |---|---|---|---|
> | **Cupom** | cliente digita um **código** | sobre o subtotal, **depois** do preço | [coupon-rules.md](./coupon-rules.md) ✅ implementado |
> | **Desconto automático** | **regra** da empresa (sem código) | **dentro** do `simulate_price`, antes de tudo | **este doc** 🔲 a implementar |
>
> Um **desconto automático** é uma promoção aplicada direto no preço — o cliente vê o preço já
> reduzido com o valor original **riscado** (`old_price`), sem digitar nada. Difere do `old_price`
> atual (âncora **estática** de marketing) porque é uma **regra dinâmica** com janela, condições e
> que **de fato reduz o total cobrado**.

**Status:** 🔲 não implementado. Schema de preço + `simulate_price` + `old_price` estático existem
(ver [pricing-engine.md](./pricing-engine.md)); falta a camada de regras de desconto. Plano em §12.

Relacionado: [pricing-engine.md](./pricing-engine.md) · [coupon-rules.md](./coupon-rules.md) ·
[booking-flow.md](./booking-flow.md) · [operator-panel.md](./operator-panel.md) §4.6.

---

## 1. Conceito — desconto vs cupom vs old_price

```
preço base (tiers)  ── simulate_price ──►  base_price
                                            │
              ┌── desconto automático (regra) reduz aqui ──┐
              ▼                                             ▼
        price = base_price − desconto            old_price = base_price (riscado real)
              │
   create_booking_atomic usa price como subtotal
              │
        cupom (código) reduz o subtotal aqui (empilha por cima)
              ▼
           total
```

| | Cupom | Desconto automático | `old_price` estático (hoje) |
|---|---|---|---|
| Aciona | código do cliente | regra da empresa | configuração de preço |
| Reduz o total? | ✅ | ✅ | ❌ (só visual) |
| Aparece sem ação? | ❌ | ✅ | ✅ |
| Tem janela/condições? | ✅ | ✅ | ❌ |
| Onde mora | `coupon` | `discount_rule` (novo) | `pricing_rule.old_price_*` / `pricing_tier.is_old_price` |

> **Migração do old_price estático:** continua válido para âncoras puramente de marketing
> (`multiplier`/`own_table`). Quando uma **regra de desconto** aplica, ela **tem precedência** e
> passa a ser a fonte do `old_price` (= preço antes do desconto). Ver §7.

---

## 2. Estado atual

- `simulate_price(p_company, p_location, p_parking_type, p_days)` retorna `{ price, old_price, days, strategy, … }` — `old_price` vem só de `old_price_strategy` (`multiplier`/`own_table`), **estático**.
- `create_booking_atomic` usa `simulate_price` para o snapshot (`v_price` → `v_subtotal`), guarda `old_price` no retorno mas ele **não** afeta o total.
- **Não há** tabela/regra de desconto automático, nem campanha, nem promoção por data/duração.
- Cupons (código) já existem e empilham depois do preço.

---

## 3. Decisões de design

| # | Decisão | Racional |
|---|---|---|
| D1 | Desconto é da **empresa**, opcionalmente por **unidade** e por **tipo de vaga**; gerido pelo **operator** (`hub_admin` por override). | Coerência com cupons/add-ons (RPC `SECURITY DEFINER` + guard). |
| D2 | A regra é avaliada **dentro do `simulate_price`** (fonte única do preço). Assim listing, busca, simulador do operador e `create_booking_atomic` recebem o preço já descontado **de graça**. | Um lugar só calcula preço; sem duplicar a lógica em N callers. |
| D3 | O desconto **produz o `old_price`**: `old_price = base_price` (pré-desconto), `price = base_price − desconto`. Tem **precedência** sobre o `old_price_strategy` estático. | É o "preço riscado" real que o usuário pediu. |
| D4 | Incide sobre o **preço de estacionamento** (não sobre add-ons), igual ao cupom. | Previsibilidade; mesma base do cupom. |
| D5 | **No máximo um** desconto automático por preço: escolhe o de **maior valor** (best-pick). Múltiplas regras não somam entre si. | Evita descontos compostos acidentais. |
| D6 | **Empilha com cupom**: o desconto entra primeiro (vira `subtotal`), o cupom reduz o subtotal já descontado. Configurável por regra via `allow_coupon_stack` (default `true`). | Promo automática + código são coisas distintas; mas dá controle ao operador. |
| D7 | Snapshot por reserva em **`booking_discount`** (regra + valor aplicado), análogo a `booking_coupon`. | Auditoria/financeiro corretos mesmo se a regra mudar depois. |
| D8 | Escrita só por **RPC `SECURITY DEFINER`**; sem RLS de escrita direta. Leitura pública só de regras ativas. | Mesmo modelo de cupons. |

---

## 4. Modelo de dados

**Migration `AAAAMMDDHHMMSS_discount_engine.sql`:**

```sql
-- regra de desconto automático
create table public.discount_rule (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.company(id) on delete cascade,
  location_id   uuid references public.location(id) on delete cascade,  -- null = todas as unidades
  name          text not null,                 -- rótulo exibido ("Promo de inverno")
  description   text,
  discount_type public.discount_type not null, -- reusa enum percent | fixed
  discount_value numeric(12,2) not null check (discount_value >= 0),

  -- janela e condições (todas opcionais → sem restrição)
  valid_from    timestamptz,
  valid_until   timestamptz,
  min_days      integer check (min_days is null or min_days >= 1),
  min_amount    numeric(12,2) check (min_amount is null or min_amount >= 0),
  advance_days  integer check (advance_days is null or advance_days >= 0), -- early-bird: check_in ≥ N dias à frente

  allow_coupon_stack boolean not null default true,
  priority      integer not null default 0,    -- desempate no best-pick (maior valor; depois maior priority)
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.discount_rule (company_id, location_id) where is_active;

-- restrição opcional por tipo de vaga (sem linhas = todos)
create table public.discount_rule_parking_type (
  discount_rule_id        uuid not null references public.discount_rule(id) on delete cascade,
  company_parking_type_id uuid not null references public.company_parking_type(id) on delete cascade,
  primary key (discount_rule_id, company_parking_type_id)
);

-- snapshot por reserva
create table public.booking_discount (
  booking_id        uuid not null references public.booking(id) on delete cascade,
  discount_rule_id  uuid not null references public.discount_rule(id) on delete restrict,
  discount_applied  numeric(12,2) not null check (discount_applied >= 0),
  created_at        timestamptz not null default now(),
  primary key (booking_id, discount_rule_id)
);
```

Enum `discount_type` (`percent`|`fixed`) já existe — reusar. Trigger `set_updated_at` em `discount_rule`.

---

## 5. Avaliação — `discount_evaluate`

Função que, dado o contexto de uma simulação, devolve a **melhor** regra aplicável e o valor.

```
discount_evaluate(
  p_location_id uuid,
  p_company_parking_type_id uuid,
  p_base_price numeric,
  p_days integer,
  p_check_in_at timestamptz   -- p/ advance_days; null no preview sem data
) returns table(discount_rule_id uuid, discount numeric, label text)
```

**Filtro de elegibilidade (cada regra ativa da empresa da unidade):**
```
location_id is null OR = p_location_id
is_active = true
valid_from  is null OR <= now()
valid_until is null OR >= now()
min_days    is null OR p_days >= min_days
min_amount  is null OR p_base_price >= min_amount
advance_days is null OR (p_check_in_at is null) OR (p_check_in_at - now()) >= advance_days dias
restrição de tipo de vaga: sem linhas OU inclui p_company_parking_type_id
```
**Desconto da regra:** `percent → round(base × value/100, 2)` · `fixed → least(value, base)`.
**Best-pick (D5):** ordena por `discount` desc, depois `priority` desc, depois `sort_order` asc → pega 1.
Retorna `label` pronto p/ UI (ex: `"-20%"` ou `"-R$ 10"`).

> Mesma função é a fonte única usada por `simulate_price` (preview) e `create_booking_atomic`
> (autoritativa) — espelha o padrão `coupon_evaluate`.

---

## 6. Aplicação

### 6.1 `simulate_price` (camada de desconto)
Depois de calcular `v_price` (base) e antes de retornar:
```
base := v_price
sel  := discount_evaluate(location_id, cpt_id, base, p_days, null)   -- preview sem data exata
if sel.discount > 0:
   price     := base - sel.discount
   old_price := base                          -- D3: âncora real
   discount  := { rule_id, type, value, amount: sel.discount, label }
else:
   price     := base
   old_price := old_price_strategy estático (comportamento atual)   -- D3 fallback
```
`simulate_price` passa a retornar também `discount: { rule_id, amount, label } | null`.
`get_pricing_data` precisa expor `location_id` e `company_parking_type_id` (hoje já tem slugs).

> **Atenção `surcharge`:** a estratégia `surcharge` chama `_apply_pricing` de outro tipo. O desconto
> incide sobre o **preço final** do tipo solicitado (após surcharge), não sobre o tipo-fonte.

### 6.2 `create_booking_atomic`
`v_subtotal` passa a ser o **preço já descontado** (vem do `simulate_price`). Para o snapshot:
```
chama simulate_price → v_price (já descontado), v_old_price, v_auto_discount (rule_id, amount)
v_subtotal := v_price
if v_auto_discount: insert booking_discount(booking_id, rule_id, amount)
... cupom avalia sobre v_subtotal (já descontado) — empilha (D6) ...
total := v_subtotal - v_coupon_discount + add_ons
```
Se a regra tiver `allow_coupon_stack = false` e houver cupom, a RPC rejeita o cupom com
`error_code = 'no_stack'` (mensagem "Este cupom não acumula com a promoção atual").

---

## 7. Interação com o `old_price` estático
- Sem regra de desconto: `old_price` continua vindo de `old_price_strategy` (`multiplier`/`own_table`) — **nada muda**.
- Com regra de desconto: a regra **tem precedência** e `old_price = base_price` (pré-desconto). O `old_price_strategy` é ignorado naquele cálculo (não faz sentido riscar duas vezes).
- O front **não muda**: já exibe `old_price` riscado quando `old_price > price` ([ReservationCard](../../src/features/listing/ReservationCard.tsx), [ResultCard](../../src/features/search/ResultCard.tsx)). Opcional: exibir o `label` ("-20%") como selo.

---

## 8. Empilhamento (resumo)
```
base_price ──(desconto automático, best-pick)──► subtotal ──(cupom, se allow_coupon_stack)──► (− cupom) ──(+ add-ons)──► total
```
- 1 desconto automático (maior valor) + no máximo 1 cupom.
- `allow_coupon_stack=false` → cupom bloqueado quando há desconto ativo.
- Add-ons sempre por cima, sem desconto (D4).

---

## 9. Backend — RPCs (espelham cupons/add-ons)

| Função | Tipo | Responsabilidade |
|---|---|---|
| `discount_assert_company_access(company_id)` | DEFINER | guard (reusa padrão `coupon_assert_company_access`). |
| `discount_evaluate(...)` | **VOLATILE** DEFINER | §5 (VOLATILE como `coupon_evaluate`, pela mesma razão de snapshot em transação). |
| `operator_upsert_discount(p_company_id, p_id, p_location_id, p_name, p_description, p_discount_type, p_discount_value, p_valid_from, p_valid_until, p_min_days, p_min_amount, p_advance_days, p_allow_coupon_stack, p_priority, p_is_active, p_sort_order, p_parking_type_ids)` | DEFINER | upsert + sincroniza `discount_rule_parking_type`; valida percent ≤ 100. |
| `operator_set_discount_active(p_id, p_is_active)` | DEFINER | toggle. |
| `operator_delete_discount(p_id)` | DEFINER | bloqueia se houver `booking_discount` (FK RESTRICT) → orienta desativar. |

Refactor de `simulate_price` e `create_booking_atomic` conforme §6. Grants `authenticated, service_role`.
⚠️ Lições já conhecidas: contar tipos no `revoke/grant`, dollar-quotes nomeados, `%%` em `RAISE`,
aplicar a migration completa (não omitir seções).

---

## 10. RLS & UI

**RLS:** leitura pública de `discount_rule`/`discount_rule_parking_type` só de regras ativas;
operator vê as próprias (inclui inativas); `booking_discount` só do dono da reserva. Escrita só via RPC.

**Operator** — tela **Descontos** (aba ao lado de Cupons em [operator-panel.md](./operator-panel.md) §4.6,
ou rota `/operator/discounts`). Feature `src/features/discounts/` espelhando `coupons/`:
- `api.ts` (`useCompanyDiscounts`, `useUpsertDiscount`, `useSetDiscountActive`, `useDeleteDiscount`),
  `discounts.logic.ts`, `DiscountForm.tsx`, página.
- Form: nome, unidade (todas/uma), tipo+valor, janela, `min_days`/`min_amount`/`advance_days`,
  `allow_coupon_stack`, prioridade, tipos de vaga, ativo.
- Tabela: `Nome` · `Desconto` · `Unidade` · `Janela` · `Empilha?` · `Status` · Ações.

**Cliente** — **nenhuma ação**: o preço já chega descontado com `old_price` riscado no listing/busca.
Opcional: selo com o `label` ("-20%"). Snapshot do desconto exibível em "minhas reservas"/voucher.

---

## 11. Matriz de testes

**pgTAP `discount_rpc.test.sql`:**
- upsert (percent>100 rejeitado), set_active, delete bloqueado por `booking_discount` vs livre, guard `42501`.
- `discount_evaluate`: janela (não-iniciada/expirada), `min_days`, `min_amount`, `advance_days`, restrição por tipo de vaga, **best-pick** (2 regras → escolhe a maior, desempate por priority).
- `simulate_price` com regra ativa: `price = base − desc`, `old_price = base`, objeto `discount` presente; sem regra → comportamento atual intacto (não regredir os golden de `docs/simulacao-precos.md`).
- `create_booking_atomic`: total reflete o desconto, `booking_discount` gravado; empilhamento com cupom; `allow_coupon_stack=false` rejeita cupom.

**Vitest:** `discounts.logic.ts` (validação do form, build de args, formatação do `label`).

**Integração (`test:int`):** rodar contra os golden de preço garantindo que **sem regra** o preço é idêntico (defesa anti-regressão do motor de preço).

---

## 12. Plano de implementação (faseado)

**Fase 1 — núcleo automático**
1. Migration `discount_engine.sql`: tabelas, `discount_assert_company_access`, `discount_evaluate`, RPCs de gestão; refactor `get_pricing_data` (expor `location_id`/`company_parking_type_id`), `simulate_price` (camada de desconto + `discount` no retorno), `create_booking_atomic` (snapshot `booking_discount` + empilhamento). `gen:types`.
2. pgTAP + `test:int` anti-regressão.
3. Operator: feature `discounts/` + tela (aba em Cupons) + nav.
4. Front de preço: expor `discount.label`/`old_price` (já há strikethrough; opcional selo). Atualizar `SimulatedPrice`/`useSimulatePrice`.

**Fase 2 — refino**
5. `advance_days` (early-bird) e prioridade no best-pick afinados; selo de promoção no card.
6. Snapshot na tela de reserva/voucher; relatório no Manager (descontos concedidos).

**DoD:** `typecheck`/`lint`/`test` verdes; migration + `gen:types` + specs no mesmo PR; **golden de preço inalterados sem regra**.

---

## 13. Open points
- **Empilhar 2+ descontos automáticos?** Não no MVP (best-pick único, D5). Reavaliar se marketing pedir combos.
- **Desconto sobre add-ons** — fora (D4). Reavaliar para promoções de serviço.
- **Desconto global de plataforma** (`company_id` nulo, criado pelo `hub_admin`) — futuro; exigiria match por unidade *ou* global.
- **Precedência regra vs old_price estático** — D3 fixa "regra vence". Confirmar com marketing se algum caso quer os dois.
- **Arredondamento** — seguir o do motor de preço (`round(...,2)`), consistente com cupom.
