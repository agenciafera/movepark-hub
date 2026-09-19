# Comissão por origem da venda: plano de implementação

> Spec: `docs/specs/comissao-por-origem.md` (E0.3.12). Execução inline, fase a fase, na `main`.
> Cada tarefa fecha com teste próprio verde, typecheck, lint e commit. Nenhuma tarefa muda o
> comportamento de quem não tem regra cadastrada.

**Goal:** a comissão, o pagador da taxa do gateway e o responsável por chargeback passam a
depender da origem da venda, por regras que a Movepark cadastra no Manager.

**Architecture:** tabela `commission_rule` + função SQL `resolve_commission`; o pacote é
congelado na reserva por `booking_apply_commission` (chamada pela Edge `create-booking`, e de novo
pelas Edges de cobrança se a reserva ainda não tiver pacote); as Edges de cobrança leem o pacote
congelado; o webhook de chargeback grava a dívida conforme o `bearer`.

**Tech stack:** Postgres (pgTAP no banco vivo em transação com rollback, via `tap.sh`), Edge
Functions Deno, React + TanStack Query, Vitest.

## Global constraints

- Sem travessão em texto nenhum. Migrations com carimbo único (`ls supabase/migrations | sed 's/_.*//' | sort | uniq -d`).
- Função nova no schema `public`: `revoke all ... from public, anon` nominal; escrita só `hub_admin`.
- Nunca `supabase start`. pgTAP roda com `bash $SP/tap.sh <teste> <migration>`.
- Janela de atribuição: 7 dias (`app_setting.commission_attribution_window_days`).
- Padrão do Hub: `company.take_rate_bps`, `app_setting.commission_default_fee_payer = movepark`,
  `app_setting.commission_default_chargeback_bearer = each`.

## Interfaces (nomes que as tarefas compartilham)

- SQL `resolve_commission(p_company_id uuid, p_origin text, p_utm_source text, p_clicked_at timestamptz, p_at timestamptz default now()) returns jsonb`
  → `{ rule_id, channel, take_rate_bps, fee_payer, chargeback_bearer }`.
- SQL `booking_apply_commission(p_booking_id uuid, p_attribution jsonb default null) returns jsonb` (service_role e hub_admin). Não mexe em reserva com pagamento pago nem com `commission_locked`.
- SQL `admin_list_commission_rules(p_company_id uuid default null)`, `admin_upsert_commission_rule(p_rule jsonb)`, `admin_delete_commission_rule(p_id uuid)`, `admin_set_booking_commission(p_booking_id uuid, p_rule_id uuid, p_reason text)`.
- Colunas em `booking`: `commission_rule_id`, `commission_channel`, `commission_take_rate_bps`, `commission_fee_payer`, `commission_chargeback_bearer`, `commission_locked`, `attribution jsonb`.
- TS front `src/lib/utm.ts`: `type Attribution = Utm & { clicked_at: string | null; landing_url: string | null; referrer: string | null }`, `getStoredAttribution()`.
- TS Edge `_shared/payments/commission.ts`: `commissionForCharge(booking, companyTakeRateBps) → { takeRateBps, feePayer }`; `buildSplit({ ..., feePayer })`.
- Coluna `payment.chargeback_debt_cents` lida por `payout_debt_cents`.

## Tarefas

1. **Modelo e resolução** (migration `commission_rule` + funções + colunas; pgTAP `commission_rule.test.sql`): casa por UTM, empresa vence global, prioridade, vigência, janela de 7 dias, UTM de outra empresa não casa, white-label, sem regra = Hub, UTM duplicado na mesma empresa recusado, RLS e grants.
2. **Congelamento** (`booking_apply_commission` + `admin_set_booking_commission`; mesmo pgTAP): reserva nova recebe o pacote; com pagamento pago não muda; override trava e registra histórico.
3. **Atribuição 7 dias no front** (`src/lib/utm.ts`, `utm.test.ts`): localStorage, `clicked_at`, URL, referrer, expiração, chegada sem UTM não apaga.
4. **`create-booking` grava a prova e congela** (`logic.ts`, `index.ts`, `logic.test.ts`); o `ReservationCard` manda `attribution`.
5. **Cobrança pelo pacote** (`_shared/payments/commission.ts` + teste, `split.ts` `feePayer`, Edges de PIX e cartão).
6. **Chargeback por regra** (migration `payment.chargeback_debt_cents` + `payout_debt_cents`; webhook; pgTAP e Deno).
7. **Manager**: Configurações › Comissões por origem e Empresa › Comissões (hooks com contrato de rede, formulário, simulador), canal na tela da reserva com "Corrigir canal".
8. **Operator**: canal e comissão na tela da reserva; "Seu link rastreado".
9. **Relatório por canal e alerta de concentração**.
10. **Validação em produção** (roteiro da spec) e docs finais.
