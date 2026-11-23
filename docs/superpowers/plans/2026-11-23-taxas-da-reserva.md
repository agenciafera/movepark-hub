# Taxas da reserva e tabela de taxas (Manager) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Ver taxas" no card Valores da reserva do Manager, que abre um modal com o resumo, cada taxa cobrada (comissão, juros, MDR, antecipação, antifraude), as parcelas e a tabela de taxas; e o bloco "Taxas do gateway" em Configurações › Pagamentos, com o contratado ao lado do medido nas vendas.

**Architecture:** Tudo sai do que já está gravado: o último evento `payables` do rastro (`booking_gateway_trail`), o pacote de comissão congelado na reserva e a política de parcelamento. A tabela contratada mora só em `app_setting.gateway_fee_schedule` (o repo é público). Uma RPC nova (`gateway_fee_measured`) devolve somas por método e número de parcelas; a divisão por faixa acontece no front, porque as faixas são configuração. Lógica pura em `src/lib/gatewayFees.ts` e `src/features/bookings/bookingFees.logic.ts`; os componentes só desenham.

**Tech Stack:** Supabase (Postgres, pgTAP), React 18 + TanStack Query + Radix Dialog (shadcn) + Testing Library, Vitest.

**Spec:** [`docs/specs/taxas-da-reserva.md`](../../specs/taxas-da-reserva.md)

## Global Constraints

- Trabalho direto na `main`; ao fim de cada tarefa, `git status` limpo (nenhum untracked que o código usa), `commit` e `git push origin main`. Mensagem `tipo(escopo): descrição` em pt-BR, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Repo PÚBLICO: nenhuma taxa real da Pagar.me (contratada ou medida) em código, migration, teste, plano, spec ou commit.** Fixtures usam números inventados (os deste plano já são). Para conferir uma venda real, consulte o banco na hora e não copie o número para arquivo nenhum.
- Migration aplicada pelo MCP `mcp__1f1d7cd0-403f-485f-8f09-f96e49482b16__apply_migration` no projeto `mgaigbezdalbyuqiofcf`, nunca `supabase db push`. Carimbo `HHMMSS` real e único: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` tem que sair vazio.
- Nada de Supabase local (`supabase start`, `bun run test:db`). pgTAP roda no vivo, numa transação com `rollback`, pelo `tap.sh` da Tarefa 2.
- `bun run gen:types` sai incompleto neste projeto: leia o diff de `src/types/database.ts`; se ele remover tabela ou função que existe, descarte com `git checkout src/types/database.ts`. A chamada da RPC usa cast localizado (padrão de `useBookingGatewayTrail`), então não depende do tipo gerado.
- Função nova no `public`: `revoke all ... from public, anon, authenticated` nominal e depois `grant execute ... to authenticated`; a checagem de `hub_admin` fica dentro da função (`42501`).
- Sem travessão (— ou –) em texto, comentário, doc ou commit. Copy em pt-BR, voz da Movepark.
- Imports por `@/`; tipos de domínio nunca de `@/types/database` direto.
- Gates antes de cada commit de código: `bun run typecheck`, `bun run lint`, `bun run test` verdes. No fim: `/security-review` e advisors de segurança do Supabase (o diff toca migration com `SECURITY DEFINER`).
- Navegador para conferir em produção: só o Arc pela extensão Claude in Chrome, numa aba criada por mim, fechada no fim.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/gatewayFees.ts` (novo) | Tipo e validação da tabela contratada, faixa de uma venda, leitura do medido, formatação de bps |
| `src/lib/gatewayFees.test.ts` (novo) | Vitest da lógica acima |
| `supabase/migrations/20261206100000_gateway_fee_measured.sql` (novo) | RPC `gateway_fee_measured(int)` |
| `supabase/tests/gateway_fee_measured.test.sql` (novo) | pgTAP da RPC |
| `src/features/settings/api.ts` | Hook `useGatewayFeeMeasured` |
| `src/features/settings/GatewayFeeScheduleSettings.tsx` (novo) | Bloco "Taxas do gateway" em Configurações › Pagamentos |
| `src/features/settings/GatewayFeeScheduleSettings.test.tsx` (novo) | Vitest do formulário |
| `src/routes/manager/settings.tsx` | Encaixa o bloco na aba Pagamentos |
| `src/features/bookings/bookingFees.logic.ts` (novo) | Recebíveis do rastro e a conta do modal (`buildFeeDetail`) |
| `src/features/bookings/bookingFees.logic.test.ts` (novo) | Vitest da conta |
| `src/features/bookings/BookingFeesDialog.tsx` (novo) | O modal |
| `src/features/bookings/BookingFeesDialog.test.tsx` (novo) | Vitest do modal |
| `src/features/bookings/BookingMoneyCard.tsx` | Exporta `Linha`/`Bloco`; botão "Ver taxas" |
| `src/features/bookings/BookingDetailView.tsx` (+ `.test.tsx`) | Decide quem vê o botão e monta o modal |
| `docs/specs/taxas-da-reserva.md`, `docs/specs/README.md` | Estado, arquitetura final, catálogo da migration |

---

### Task 1: Tabela de taxas contratada (lógica pura)

**Files:**
- Create: `src/lib/gatewayFees.ts`
- Test: `src/lib/gatewayFees.test.ts`

**Interfaces:**
- Produces:
  - `interface FeeBand { from: number; to: number; bps: number }`
  - `interface GatewayFeeSchedule { version: number; pix_bps: number; card: FeeBand[]; antifraud_cents: number }`
  - `interface GatewayFeeMeasuredRow { method: string; installments: number; sales: number; charged_cents: number; fee_cents: number; fraud_cents: number }`
  - `interface GatewayFeeMeasured { days: number; rows: GatewayFeeMeasuredRow[]; anticipation: { payables: number; fee_cents: number; base_cents_month: number; monthly_bps: number | null } }`
  - `const MAX_FEE_BPS = 2000`, `const FEE_TOLERANCE_BPS = 5`
  - `validateGatewayFeeSchedule(s: GatewayFeeSchedule): string | null`
  - `parseGatewayFeeSchedule(raw: string | null | undefined): GatewayFeeSchedule | null`
  - `bandFor(schedule: GatewayFeeSchedule | null, installments: number | null | undefined): FeeBand | null`
  - `measuredForBand(m: GatewayFeeMeasured | null | undefined, method: "card" | "pix", from: number, to: number): { sales: number; bps: number | null }`
  - `measuredAntifraudCents(m: GatewayFeeMeasured | null | undefined): number | null`
  - `differsFromContract(measuredBps: number | null, contractBps: number | null): boolean`
  - `formatBps(bps: number | null | undefined): string`
  - `parseHundredths(v: string): number`

- [ ] **Step 1: Write the failing test** (`src/lib/gatewayFees.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  bandFor,
  differsFromContract,
  formatBps,
  measuredAntifraudCents,
  measuredForBand,
  parseGatewayFeeSchedule,
  parseHundredths,
  validateGatewayFeeSchedule,
  type GatewayFeeMeasured,
  type GatewayFeeSchedule,
} from "./gatewayFees";

// Taxas inventadas: o repo é público e a proposta da Pagar.me tem sigilo.
const VALIDA: GatewayFeeSchedule = {
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 6, bps: 300 },
    { from: 7, to: 12, bps: 350 },
  ],
  antifraud_cents: 5,
};

describe("validateGatewayFeeSchedule", () => {
  it("aceita faixas contíguas de 1x a 12x", () => {
    expect(validateGatewayFeeSchedule(VALIDA)).toBeNull();
  });
  it("recusa buraco entre faixas", () => {
    const s = { ...VALIDA, card: [{ from: 1, to: 1, bps: 250 }, { from: 2, to: 5, bps: 300 }, { from: 7, to: 12, bps: 350 }] };
    expect(validateGatewayFeeSchedule(s)).toBe("Falta a parcela de 6x.");
  });
  it("recusa sobreposição", () => {
    const s = { ...VALIDA, card: [{ from: 1, to: 1, bps: 250 }, { from: 2, to: 7, bps: 300 }, { from: 7, to: 12, bps: 350 }] };
    expect(validateGatewayFeeSchedule(s)).toBe("A faixa que começa em 7x se sobrepõe à anterior.");
  });
  it("recusa faixa que não começa em 1x e faixa que passa de 12x", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 2, to: 12, bps: 300 }] })).toBe("A primeira faixa começa em 1x.");
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 13, bps: 300 }] })).toBe("As faixas passam de 12x.");
  });
  it("recusa quando falta o fim", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 6, bps: 300 }] })).toBe("Faltam as parcelas de 7x a 12x.");
  });
  it("recusa taxa fora de 0% a 20% e antifraude negativo", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, pix_bps: 2001 })).toBe("Taxa do Pix fora de 0% a 20%.");
    expect(validateGatewayFeeSchedule({ ...VALIDA, pix_bps: Number.NaN })).toBe("Taxa do Pix fora de 0% a 20%.");
    expect(validateGatewayFeeSchedule({ ...VALIDA, antifraud_cents: -1 })).toBe("Antifraude precisa ser um valor em reais não negativo.");
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 12, bps: -1 }] })).toBe("Taxa da faixa 1x a 12x fora de 0% a 20%.");
  });
});

describe("parseGatewayFeeSchedule", () => {
  it("lê o JSON do app_setting e ordena as faixas", () => {
    const raw = JSON.stringify({ ...VALIDA, card: [...VALIDA.card].reverse() });
    expect(parseGatewayFeeSchedule(raw)).toEqual(VALIDA);
  });
  it("chave ausente, JSON quebrado ou tabela inválida viram null (a tela diz 'não cadastrado')", () => {
    expect(parseGatewayFeeSchedule(undefined)).toBeNull();
    expect(parseGatewayFeeSchedule("{")).toBeNull();
    expect(parseGatewayFeeSchedule(JSON.stringify({ ...VALIDA, card: [] }))).toBeNull();
  });
});

describe("bandFor", () => {
  it("acha a faixa da venda", () => {
    expect(bandFor(VALIDA, 1)).toEqual({ from: 1, to: 1, bps: 250 });
    expect(bandFor(VALIDA, 4)).toEqual({ from: 2, to: 6, bps: 300 });
    expect(bandFor(null, 4)).toBeNull();
    expect(bandFor(VALIDA, 13)).toBeNull();
  });
});

const MEDIDO: GatewayFeeMeasured = {
  days: 90,
  rows: [
    { method: "card", installments: 1, sales: 2, charged_cents: 20000, fee_cents: 500, fraud_cents: 10 },
    { method: "card", installments: 3, sales: 1, charged_cents: 10000, fee_cents: 340, fraud_cents: 0 },
    { method: "card", installments: 4, sales: 1, charged_cents: 10000, fee_cents: 260, fraud_cents: 0 },
    { method: "pix", installments: 1, sales: 4, charged_cents: 40000, fee_cents: 320, fraud_cents: 0 },
  ],
  anticipation: { payables: 3, fee_cents: 57, base_cents_month: 2850, monthly_bps: 200 },
};

describe("medido nas vendas", () => {
  it("divide a soma das taxas pela soma do cobrado dentro da faixa", () => {
    expect(measuredForBand(MEDIDO, "card", 1, 1)).toEqual({ sales: 2, bps: 250 });
    expect(measuredForBand(MEDIDO, "card", 2, 6)).toEqual({ sales: 2, bps: 300 });
    expect(measuredForBand(MEDIDO, "pix", 1, 1)).toEqual({ sales: 4, bps: 80 });
  });
  it("faixa sem venda devolve bps nulo", () => {
    expect(measuredForBand(MEDIDO, "card", 7, 12)).toEqual({ sales: 0, bps: null });
    expect(measuredForBand(undefined, "card", 1, 1)).toEqual({ sales: 0, bps: null });
  });
  it("antifraude médio por venda, sobre todas as vendas", () => {
    expect(measuredAntifraudCents(MEDIDO)).toBe(1);
    expect(measuredAntifraudCents(undefined)).toBeNull();
  });
});

describe("differsFromContract", () => {
  it("só acusa acima de 0,05 ponto percentual", () => {
    expect(differsFromContract(305, 300)).toBe(false);
    expect(differsFromContract(305.01, 300)).toBe(true);
    expect(differsFromContract(294.9, 300)).toBe(true);
    expect(differsFromContract(null, 300)).toBe(false);
    expect(differsFromContract(300, null)).toBe(false);
  });
});

describe("formatação", () => {
  it("bps vira percentual com vírgula", () => {
    expect(formatBps(250)).toBe("2,50%");
    expect(formatBps(80.6)).toBe("0,81%");
    expect(formatBps(null)).toBe("-");
  });
  it("texto do formulário vira centésimos (bps ou centavos)", () => {
    expect(parseHundredths("2,5")).toBe(250);
    expect(parseHundredths("1.07")).toBe(107);
    expect(parseHundredths(" ")).toBeNaN();
    expect(parseHundredths("abc")).toBeNaN();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/gatewayFees.test.ts`
Expected: FAIL, "Failed to resolve import "./gatewayFees"".

- [ ] **Step 3: Write the implementation** (`src/lib/gatewayFees.ts`)

```ts
// Tabela de taxas do gateway (23/11/2026): o que foi contratado com a Pagar.me, cadastrado no
// Manager e guardado só no banco (`app_setting.gateway_fee_schedule`, is_public = false). O repo
// é público e a proposta comercial tem sigilo: nenhuma taxa real aparece aqui nem nos testes.
// Percentuais em bps inteiros (250 = 2,50%), para não carregar ponto flutuante.
// Spec: docs/specs/taxas-da-reserva.md

export interface FeeBand {
  from: number;
  to: number;
  bps: number;
}

export interface GatewayFeeSchedule {
  version: number;
  pix_bps: number;
  card: FeeBand[];
  antifraud_cents: number;
}

/** O que a RPC `gateway_fee_measured` devolve: somas por método e número de parcelas. */
export interface GatewayFeeMeasuredRow {
  method: string;
  installments: number;
  sales: number;
  charged_cents: number;
  fee_cents: number;
  fraud_cents: number;
}

export interface GatewayFeeMeasured {
  days: number;
  rows: GatewayFeeMeasuredRow[];
  anticipation: { payables: number; fee_cents: number; base_cents_month: number; monthly_bps: number | null };
}

export const MAX_FEE_BPS = 2000;
/** Diferença a partir da qual o efetivo "não bate" com o contratado: 0,05 ponto percentual. */
export const FEE_TOLERANCE_BPS = 5;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const faltam = (a: number, b: number) =>
  a === b ? `Falta a parcela de ${a}x.` : `Faltam as parcelas de ${a}x a ${b}x.`;

/** Por que a tabela não vale, ou null quando vale. A mesma regra serve ao formulário e à leitura. */
export function validateGatewayFeeSchedule(s: GatewayFeeSchedule): string | null {
  if (!isInt(s.pix_bps) || s.pix_bps < 0 || s.pix_bps > MAX_FEE_BPS) return "Taxa do Pix fora de 0% a 20%.";
  if (!isInt(s.antifraud_cents) || s.antifraud_cents < 0)
    return "Antifraude precisa ser um valor em reais não negativo.";
  if (!Array.isArray(s.card) || s.card.length === 0) return "Cadastre ao menos uma faixa do cartão.";
  let expected = 1;
  for (const b of s.card) {
    if (!isInt(b.from) || !isInt(b.to) || b.from > b.to) return `Faixa ${b.from}x a ${b.to}x inválida.`;
    if (expected === 1 && b.from !== 1) return "A primeira faixa começa em 1x.";
    if (b.from > expected) return faltam(expected, b.from - 1);
    if (b.from < expected) return `A faixa que começa em ${b.from}x se sobrepõe à anterior.`;
    if (b.to > 12) return "As faixas passam de 12x.";
    if (!isInt(b.bps) || b.bps < 0 || b.bps > MAX_FEE_BPS)
      return `Taxa da faixa ${b.from}x a ${b.to}x fora de 0% a 20%.`;
    expected = b.to + 1;
  }
  if (expected !== 13) return faltam(expected, 12);
  return null;
}

/** Lê `app_setting.gateway_fee_schedule`. Ausente, quebrado ou inválido: null ("não cadastrado"). */
export function parseGatewayFeeSchedule(raw: string | null | undefined): GatewayFeeSchedule | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const card = Array.isArray(o.card)
    ? (o.card as Record<string, unknown>[]).map((b) => ({ from: b?.from, to: b?.to, bps: b?.bps }) as FeeBand)
    : [];
  const s: GatewayFeeSchedule = {
    version: isInt(o.version) ? o.version : 1,
    pix_bps: o.pix_bps as number,
    card: [...card].sort((a, b) => Number(a.from) - Number(b.from)),
    antifraud_cents: o.antifraud_cents as number,
  };
  return validateGatewayFeeSchedule(s) ? null : s;
}

/** A faixa do cartão em que uma venda de N parcelas cai. */
export function bandFor(
  schedule: GatewayFeeSchedule | null,
  installments: number | null | undefined,
): FeeBand | null {
  if (!schedule || installments == null) return null;
  return schedule.card.find((b) => installments >= b.from && installments <= b.to) ?? null;
}

/** MDR efetivo medido numa faixa: soma das taxas sobre a soma do cobrado. Sem venda, bps nulo. */
export function measuredForBand(
  m: GatewayFeeMeasured | null | undefined,
  method: "card" | "pix",
  from: number,
  to: number,
): { sales: number; bps: number | null } {
  const rows = (m?.rows ?? []).filter(
    (r) => r.method === method && r.installments >= from && r.installments <= to,
  );
  const sales = rows.reduce((a, r) => a + r.sales, 0);
  const charged = rows.reduce((a, r) => a + r.charged_cents, 0);
  const fee = rows.reduce((a, r) => a + r.fee_cents, 0);
  return { sales, bps: sales > 0 && charged > 0 ? Math.round((fee * 1_000_000) / charged) / 100 : null };
}

/** Antifraude médio por venda medido, em centavos, sobre todas as vendas do período. */
export function measuredAntifraudCents(m: GatewayFeeMeasured | null | undefined): number | null {
  const rows = m?.rows ?? [];
  const sales = rows.reduce((a, r) => a + r.sales, 0);
  if (!sales) return null;
  return Math.round(rows.reduce((a, r) => a + r.fraud_cents, 0) / sales);
}

export function differsFromContract(measuredBps: number | null, contractBps: number | null): boolean {
  if (measuredBps == null || contractBps == null) return false;
  return Math.abs(measuredBps - contractBps) > FEE_TOLERANCE_BPS;
}

/** 250 → "2,50%". */
export function formatBps(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return "-";
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Texto do formulário ("2,5" ou "2.5") em centésimos: bps para percentual, centavos para reais. */
export function parseHundredths(v: string): number {
  const t = v.trim();
  const n = Number(t.replace(",", "."));
  return t === "" || !Number.isFinite(n) ? Number.NaN : Math.round(n * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/gatewayFees.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Gates e commit**

Run: `bun run typecheck && bun run lint`
Expected: sem erro.

```bash
git add src/lib/gatewayFees.ts src/lib/gatewayFees.test.ts
git commit -m "feat(taxas): tabela de taxas do gateway e leitura do medido (lógica pura)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: RPC `gateway_fee_measured`

**Files:**
- Create: `supabase/tests/gateway_fee_measured.test.sql`
- Create: `supabase/migrations/20261206100000_gateway_fee_measured.sql`

**Interfaces:**
- Produces: `public.gateway_fee_measured(p_days int default 90) returns jsonb`, no formato `GatewayFeeMeasured` da Tarefa 1: `{ "days": 90, "rows": [{ "method", "installments", "sales", "charged_cents", "fee_cents", "fraud_cents" }], "anticipation": { "payables", "fee_cents", "base_cents_month", "monthly_bps" } }`. Só `hub_admin`; os demais recebem `42501`.

- [ ] **Step 1: Monte o executor de pgTAP no vivo** (`$SCRATCH/tap.sh`, onde `SCRATCH` é o scratchpad da sessão)

```bash
#!/usr/bin/env bash
# Uso: tap.sh <teste.sql> [migration.sql]
# Roda um pgTAP contra o banco vivo numa transação que sempre volta e imprime o TAP como mensagem
# de erro, porque `supabase db query` só mostra a saída do último statement.
set -euo pipefail
TEST="$1"; MIG="${2:-}"
OUT="$(dirname "$0")/tap-run.sql"
{
  echo 'begin;'
  echo 'create extension if not exists pgtap;'
  echo 'create temp table _tap(n serial, line text);'
  echo 'grant insert, select on _tap to authenticated; grant usage on sequence _tap_n_seq to authenticated;'
  if [ -n "$MIG" ]; then cat "$MIG"; fi
  sed -E -e '/^begin;$/d' -e '/^rollback;$/d' -e '/finish\(\)/d' \
      -e 's/^select (plan|is|isnt|ok|throws_ok|lives_ok|has_function|cmp_ok|set_eq)\(/insert into _tap(line) select \1(/' "$TEST"
  echo "do \$\$ begin raise exception E'TAP\\n%', (select string_agg(line, E'\\n' order by n) from _tap); end \$\$;"
  echo 'rollback;'
} > "$OUT"
cd /Users/kallef/PhpstormProjects/orbital/FERA/movepark-hub && supabase db query --linked -f "$OUT" || true
```

Run: `chmod +x "$SCRATCH/tap.sh"`

- [ ] **Step 2: Write the failing test** (`supabase/tests/gateway_fee_measured.test.sql`)

```sql
-- pgTAP: taxa do gateway medida nas vendas (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
-- Só hub_admin lê. A medida sai do ÚLTIMO evento payables de cada pagamento pago, ignora recebível
-- de refund e pagamento pendente. O banco vivo tem vendas de verdade no período, então as
-- asserções comparam o antes e o depois da fixture (delta), nunca o número absoluto.
-- Taxas da fixture são inventadas (o repo é público). Transação com rollback.

begin;
select plan(14);

select has_function('public', 'gateway_fee_measured', array['integer'], 'gateway_fee_measured(int) existe');
select ok(not has_function_privilege('anon', 'public.gateway_fee_measured(integer)', 'execute'), 'anon não executa');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); opr uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-cust@ex.com',now(),now()),
           (opr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-opr@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (opr,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.company(id, name, slug) values (cid, 'GFM Empresa', 'gfm-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'GFM Loc', 'gfm-loc');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.opr', opr::text, false);
  perform set_config('test.loc', loc::text, false);
end $$;

-- ── quem não é hub_admin ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.gateway_fee_measured(90)$$, '42501', null, 'cliente recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.opr'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.gateway_fee_measured(90)$$, '42501', null, 'operador recebe 42501');

-- ── antes da fixture ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select lives_ok($$select set_config('test.before', public.gateway_fee_measured(90)::text, false)$$, 'hub_admin lê');
reset role;

-- ── fixture: cartão 2x pago, Pix pago, cartão pendente ──────────────────────
do $$
declare
  cust uuid := current_setting('test.cust')::uuid; loc uuid := current_setting('test.loc')::uuid;
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  card uuid := gen_random_uuid(); pix uuid := gen_random_uuid(); pend uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-GFM001',cust,loc,now() + interval '2 days',now() + interval '3 days','confirmed',100),
           (b2,'MP-GFM002',cust,loc,now() + interval '2 days',now() + interval '3 days','confirmed',50),
           (b3,'MP-GFM003',cust,loc,now() + interval '2 days',now() + interval '3 days','pending',100);
  insert into public.payment(id, booking_id, provider, method, kind, amount, status, paid_at, installments, provider_payment_id, provider_charge_id)
    values (card, b1, 'pagarme', 'card', 'booking', 100, 'paid', now(), 2, 'or_gfm1', 'ch_gfm1'),
           (pix,  b2, 'pagarme', 'pix',  'booking', 50,  'paid', now(), 1, 'or_gfm2', 'ch_gfm2'),
           (pend, b3, 'pagarme', 'card', 'booking', 100, 'pending', null, 2, 'or_gfm3', 'ch_gfm3');
  insert into public.payment_gateway_event(payment_id, booking_id, kind, http_status, request, response, created_at) values
    -- evento ANTIGO do cartão: a taxa 999 não pode entrar (vale o último)
    (card, b1, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":999,"amount":5000,"installment":1}]}', now() - interval '1 day'),
    -- último evento do cartão: duas parcelas, uma antecipada, e um recebível de refund
    (card, b1, 'payables', 200, '{}', jsonb_build_object('data', jsonb_build_array(
       jsonb_build_object('type','credit','fee',100,'fraud_coverage_fee',10,'amount',3000,'installment',1,
                          'anticipation_fee',0,'payment_date','2026-12-01T03:00:00Z'),
       jsonb_build_object('type','credit','fee',50,'fraud_coverage_fee',0,'amount',1000,'installment',2,
                          'anticipation_fee',19,'payment_date','2026-12-01T03:00:00Z',
                          'original_payment_date','2026-12-31T03:00:00Z'),
       jsonb_build_object('type','refund','fee',-100,'amount',-3000,'installment',1))), now()),
    (pix,  b2, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":40,"amount":5000}]}', now()),
    -- pendente: não pode entrar
    (pend, b3, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":777,"amount":10000,"installment":1}]}', now());
end $$;

-- ── depois da fixture ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select set_config('test.after', public.gateway_fee_measured(90)::text, false);
reset role;

create function pg_temp.gfm_row(j jsonb, m text, n int, f text) returns bigint language sql as $f$
  select coalesce((select (r ->> f)::bigint from jsonb_array_elements(j -> 'rows') r
                    where r ->> 'method' = m and (r ->> 'installments')::int = n), 0)
$f$;
create function pg_temp.gfm_delta(m text, n int, f text) returns bigint language sql as $f$
  select pg_temp.gfm_row(current_setting('test.after')::jsonb, m, n, f)
       - pg_temp.gfm_row(current_setting('test.before')::jsonb, m, n, f)
$f$;
create function pg_temp.gfm_ant(f text) returns bigint language sql as $f$
  select (current_setting('test.after')::jsonb -> 'anticipation' ->> f)::bigint
       - (current_setting('test.before')::jsonb -> 'anticipation' ->> f)::bigint
$f$;

select is(pg_temp.gfm_delta('card', 2, 'sales'), 1::bigint, 'o cartão pago entra uma vez; o pendente não');
select is(pg_temp.gfm_delta('card', 2, 'charged_cents'), 10000::bigint, 'valor cobrado em centavos');
select is(pg_temp.gfm_delta('card', 2, 'fee_cents'), 150::bigint, 'MDR do último evento, sem o antigo e sem o refund');
select is(pg_temp.gfm_delta('card', 2, 'fraud_cents'), 10::bigint, 'antifraude somado');
select is(pg_temp.gfm_delta('pix', 1, 'fee_cents'), 40::bigint, 'Pix medido na linha de 1 parcela');
select is(pg_temp.gfm_ant('payables'), 1::bigint, 'uma parcela antecipada');
select is(pg_temp.gfm_ant('fee_cents'), 19::bigint, 'taxa de antecipação somada');
select is(pg_temp.gfm_ant('base_cents_month'), 950::bigint, 'base ao mês: líquido de 950 por 30 dias');
select is((current_setting('test.after')::jsonb ->> 'days')::int, 90, 'janela devolvida');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `"$SCRATCH/tap.sh" supabase/tests/gateway_fee_measured.test.sql`
Expected: erro `function public.gateway_fee_measured(integer) does not exist`.

- [ ] **Step 4: Write the migration** (`supabase/migrations/20261206100000_gateway_fee_measured.sql`)

Antes: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` (vazio) e `ls supabase/migrations | tail -1` (o carimbo novo tem que ser o maior).

```sql
-- Taxa do gateway medida nas vendas (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
--
-- O Manager cadastra a tabela de taxas contratada com a Pagar.me em app_setting (nunca aqui: o
-- repo é público e a proposta comercial tem sigilo). Esta RPC mede o que a Pagar.me cobrou de
-- fato, a partir do último GET /payables gravado no rastro de cada pagamento, para a tela pôr o
-- contratado ao lado do medido. Devolve SOMAS por método e número de parcelas, e não a taxa por
-- faixa, porque as faixas são configuração: quem divide é o front, sobre a faixa cadastrada.
-- Só recebíveis de crédito (o refund devolve MDR e zeraria a conta, como em totalGatewayFeeCents).
-- Antecipação: taxa efetiva ao mês sobre o líquido do recebível, proporcional aos dias corridos
-- entre a data em que o dinheiro entrou e a data original.

create or replace function public.gateway_fee_measured(p_days int default 90)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_out jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  with pay as (
    select p.id, p.method,
           case when p.method = 'card' then greatest(coalesce(p.installments, 1), 1) else 1 end as installments,
           round(p.amount * 100)::bigint as charged_cents
      from public.payment p
     where p.provider = 'pagarme'
       and p.status in ('paid', 'refunded')
       and p.paid_at >= now() - make_interval(days => v_days)
  ),
  ev as (
    select distinct on (e.payment_id) e.payment_id, e.response
      from public.payment_gateway_event e
      join pay on pay.id = e.payment_id
     where e.kind = 'payables'
     order by e.payment_id, e.created_at desc
  ),
  item as (
    select ev.payment_id, x.r
      from ev
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(ev.response -> 'data') = 'array' then ev.response -> 'data' else '[]'::jsonb end
      ) as x(r)
     where coalesce(x.r ->> 'type', 'credit') = 'credit'
  ),
  per_pay as (
    select pay.id, pay.method, pay.installments, pay.charged_cents,
           sum(coalesce((i.r ->> 'fee')::bigint, 0)) as fee_cents,
           sum(coalesce((i.r ->> 'fraud_coverage_fee')::bigint, 0)) as fraud_cents
      from pay
      join item i on i.payment_id = pay.id
     group by pay.id, pay.method, pay.installments, pay.charged_cents
  ),
  grp as (
    select method, installments, count(*) as sales,
           sum(charged_cents) as charged_cents, sum(fee_cents) as fee_cents, sum(fraud_cents) as fraud_cents
      from per_pay
     group by method, installments
  ),
  ant as (
    select (i.r ->> 'anticipation_fee')::numeric as fee,
           ((i.r ->> 'amount')::numeric - coalesce((i.r ->> 'fee')::numeric, 0))
             * (extract(epoch from ((i.r ->> 'original_payment_date')::timestamptz
                                    - (i.r ->> 'payment_date')::timestamptz)) / 86400) / 30 as base_month
      from item i
     where coalesce((i.r ->> 'anticipation_fee')::numeric, 0) > 0
       and i.r ? 'original_payment_date'
       and (i.r ->> 'original_payment_date')::timestamptz > (i.r ->> 'payment_date')::timestamptz
  )
  select jsonb_build_object(
           'days', v_days,
           'rows', coalesce((select jsonb_agg(jsonb_build_object(
                       'method', g.method, 'installments', g.installments, 'sales', g.sales,
                       'charged_cents', g.charged_cents, 'fee_cents', g.fee_cents, 'fraud_cents', g.fraud_cents)
                       order by g.method, g.installments) from grp g), '[]'::jsonb),
           'anticipation', (select jsonb_build_object(
                       'payables', count(*),
                       'fee_cents', coalesce(sum(a.fee), 0)::bigint,
                       'base_cents_month', coalesce(round(sum(a.base_month)), 0)::bigint,
                       'monthly_bps', case when sum(a.base_month) > 0
                                           then round(sum(a.fee) * 10000 / sum(a.base_month), 2) end)
                       from ant a))
    into v_out;

  return v_out;
end;
$$;

revoke all on function public.gateway_fee_measured(int) from public, anon, authenticated;
grant execute on function public.gateway_fee_measured(int) to authenticated;

comment on function public.gateway_fee_measured(int) is
  'Taxa do gateway medida nas vendas: somas por método e parcelas e antecipação ao mês. Só hub_admin. Spec: docs/specs/taxas-da-reserva.md';
```

- [ ] **Step 5: Run test with the migration to verify it passes**

Run: `"$SCRATCH/tap.sh" supabase/tests/gateway_fee_measured.test.sql supabase/migrations/20261206100000_gateway_fee_measured.sql`
Expected: a mensagem do erro final traz `1..14` e `ok 1` a `ok 14`, nenhum `not ok`. Rode também `"$SCRATCH/tap.sh" supabase/tests/definer_grants_inventory.test.sql supabase/migrations/20261206100000_gateway_fee_measured.sql`: tudo `ok` (a função nova não entra na lista de `anon`).

- [ ] **Step 6: Aplicar no vivo, tipos e commit**

Aplique com `mcp__1f1d7cd0-403f-485f-8f09-f96e49482b16__apply_migration` (name `gateway_fee_measured`, query = conteúdo do arquivo). Confira: `select has_function_privilege('anon','public.gateway_fee_measured(integer)','execute')` devolve `false`.
Rode `bun run gen:types` e leia `git diff src/types/database.ts`: mantenha só se o diff acrescenta `gateway_fee_measured` e não remove nada; senão `git checkout src/types/database.ts`.

```bash
git add supabase/migrations/20261206100000_gateway_fee_measured.sql supabase/tests/gateway_fee_measured.test.sql src/types/database.ts
git commit -m "feat(taxas): RPC gateway_fee_measured mede a taxa do gateway nas vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Bloco "Taxas do gateway" em Configurações › Pagamentos

**Files:**
- Modify: `src/features/settings/api.ts` (fim do arquivo)
- Create: `src/features/settings/GatewayFeeScheduleSettings.tsx`
- Test: `src/features/settings/GatewayFeeScheduleSettings.test.tsx`
- Modify: `src/routes/manager/settings.tsx` (import no topo; `<GatewayFeeScheduleSettings />` depois de `<InstallmentPolicySettings />` no `TabsContent value="payments"`)

**Interfaces:**
- Consumes: Tarefa 1 (`parseGatewayFeeSchedule`, `validateGatewayFeeSchedule`, `measuredForBand`, `measuredAntifraudCents`, `differsFromContract`, `formatBps`, `parseHundredths`, `MAX_FEE_BPS`, tipos); Tarefa 2 (RPC).
- Produces: `useGatewayFeeMeasured(days?: number)` (TanStack Query de `GatewayFeeMeasured`); componente `GatewayFeeScheduleSettings()`. Grava `gateway_fee_schedule` (JSON), `card_anticipation_rate_monthly_bps` e `payout_withdrawal_fee_cents` (texto) pelo `useUpdateAppSettings`.

- [ ] **Step 1: Write the failing test** (`src/features/settings/GatewayFeeScheduleSettings.test.tsx`)

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { GatewayFeeMeasured } from "@/lib/gatewayFees";

// Taxas inventadas: o repo é público.
const SCHEDULE = {
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 6, bps: 300 },
    { from: 7, to: 12, bps: 350 },
  ],
  antifraud_cents: 5,
};
const MEDIDO: GatewayFeeMeasured = {
  days: 90,
  rows: [
    { method: "card", installments: 1, sales: 2, charged_cents: 20000, fee_cents: 500, fraud_cents: 10 },
    { method: "card", installments: 3, sales: 1, charged_cents: 10000, fee_cents: 340, fraud_cents: 0 },
    { method: "pix", installments: 1, sales: 4, charged_cents: 40000, fee_cents: 320, fraud_cents: 0 },
  ],
  anticipation: { payables: 3, fee_cents: 57, base_cents_month: 2850, monthly_bps: 200 },
};

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const settings = vi.hoisted(() => ({ data: {} as Record<string, string> }));
vi.mock("./api", () => ({
  useAppSettings: () => ({ data: settings.data, isLoading: false }),
  useUpdateAppSettings: () => ({ mutateAsync, isPending: false }),
  useGatewayFeeMeasured: () => ({ data: MEDIDO }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GatewayFeeScheduleSettings } from "./GatewayFeeScheduleSettings";

describe("GatewayFeeScheduleSettings", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    settings.data = {
      gateway_fee_schedule: JSON.stringify(SCHEDULE),
      card_anticipation_rate_monthly_bps: "200",
      payout_withdrawal_fee_cents: "150",
    };
  });

  it("mostra o contratado e o medido, com faixa sem venda e divergência", () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    expect((screen.getByLabelText("Pix (% sobre o valor)") as HTMLInputElement).value).toBe("0.80");
    expect((screen.getByLabelText("Faixa 2: taxa (%)") as HTMLInputElement).value).toBe("3.00");
    expect(within(screen.getByTestId("faixa-1")).getByText(/2,50% em 2 vendas/)).toBeInTheDocument();
    // 2x a 6x: só a venda de 3x, a 3,40%, contra 3,00% contratado
    expect(within(screen.getByTestId("faixa-2")).getByText(/diferente do contrato/)).toBeInTheDocument();
    expect(within(screen.getByTestId("faixa-3")).getByText("sem venda")).toBeInTheDocument();
    expect(screen.getByText(/2,00% ao mês em 3 parcelas/)).toBeInTheDocument();
  });

  it("sem tabela cadastrada avisa e não salva taxa vazia", async () => {
    settings.data = {};
    renderWithProviders(<GatewayFeeScheduleSettings />);
    expect(screen.getByText(/Tabela ainda não cadastrada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Taxa do Pix fora de 0% a 20%.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("recusa faixa com buraco", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 2: até"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta a parcela de 6x.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("recusa faixa sobreposta", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 2: até"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A faixa que começa em 7x se sobrepõe à anterior.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("salva a tabela em bps e as duas taxas que já existiam", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 1: taxa (%)"), { target: { value: "2,6" } });
    fireEvent.change(screen.getByLabelText("Antecipação (% ao mês)"), { target: { value: "2.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        gateway_fee_schedule: JSON.stringify({ ...SCHEDULE, card: [{ from: 1, to: 1, bps: 260 }, ...SCHEDULE.card.slice(1)] }),
        card_anticipation_rate_monthly_bps: "210",
        payout_withdrawal_fee_cents: "150",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/settings/GatewayFeeScheduleSettings.test.tsx`
Expected: FAIL, "Failed to resolve import "./GatewayFeeScheduleSettings"".

- [ ] **Step 3: Write the hook** (fim de `src/features/settings/api.ts`)

```ts
import type { GatewayFeeMeasured } from "@/lib/gatewayFees";

/**
 * Taxa do gateway medida nas vendas (RPC `gateway_fee_measured`, só hub_admin, 23/11/2026):
 * somas por método e parcelas e a antecipação ao mês, para pôr o medido ao lado do contratado.
 */
export function useGatewayFeeMeasured(days = 90) {
  return useQuery({
    queryKey: ["gateway-fee-measured", days] as const,
    queryFn: async (): Promise<GatewayFeeMeasured> => {
      // Mesmo cast de useBookingGatewayTrail: não depende do database.ts gerado.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "gateway_fee_measured",
        a: { p_days: number },
      ) => PromiseLike<{ data: GatewayFeeMeasured | null; error: { message: string } | null }>;
      const { data, error } = await rpc("gateway_fee_measured", { p_days: days });
      if (error) throw new Error(error.message);
      return (
        data ?? {
          days,
          rows: [],
          anticipation: { payables: 0, fee_cents: 0, base_cents_month: 0, monthly_bps: null },
        }
      );
    },
  });
}
```

(O `import type` vai para o topo do arquivo, junto dos outros imports.)

- [ ] **Step 4: Write the component** (`src/features/settings/GatewayFeeScheduleSettings.tsx`)

```tsx
import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import {
  MAX_FEE_BPS,
  differsFromContract,
  formatBps,
  measuredAntifraudCents,
  measuredForBand,
  parseGatewayFeeSchedule,
  parseHundredths,
  validateGatewayFeeSchedule,
  type GatewayFeeSchedule,
} from "@/lib/gatewayFees";
import { useAppSettings, useGatewayFeeMeasured, useUpdateAppSettings } from "./api";

type BandRow = { from: string; to: string; pct: string };
type Form = { pix: string; antifraud: string; anticipation: string; withdrawal: string; bands: BandRow[] };

const DEFAULT_BANDS: BandRow[] = [
  { from: "1", to: "1", pct: "" },
  { from: "2", to: "6", pct: "" },
  { from: "7", to: "12", pct: "" },
];

const hundredths = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "" : (n / 100).toFixed(2);

function formFrom(data: Record<string, string> | undefined): Form {
  const s = parseGatewayFeeSchedule(data?.gateway_fee_schedule);
  const ant = data?.card_anticipation_rate_monthly_bps;
  const wd = data?.payout_withdrawal_fee_cents;
  return {
    pix: s ? hundredths(s.pix_bps) : "",
    antifraud: s ? hundredths(s.antifraud_cents) : "",
    anticipation: ant ? hundredths(Number(ant)) : "",
    withdrawal: wd ? hundredths(Number(wd)) : "",
    bands: s
      ? s.card.map((b) => ({ from: String(b.from), to: String(b.to), pct: hundredths(b.bps) }))
      : DEFAULT_BANDS,
  };
}

function toSchedule(f: Form): GatewayFeeSchedule {
  return {
    version: 1,
    pix_bps: parseHundredths(f.pix),
    card: f.bands.map((b) => ({ from: Number(b.from), to: Number(b.to), bps: parseHundredths(b.pct) })),
    antifraud_cents: parseHundredths(f.antifraud),
  };
}

/** A coluna "medido": taxa efetiva, quantas vendas e se foge do contrato. */
function Medido({ bps, sales, contractBps }: { bps: number | null; sales: number; contractBps: number }) {
  if (!sales || bps == null) return <span className="text-caption text-muted">sem venda</span>;
  const foge = differsFromContract(bps, Number.isFinite(contractBps) ? contractBps : null);
  return (
    <span className={`text-caption tabular-nums ${foge ? "font-medium text-error" : "text-muted"}`}>
      {formatBps(bps)} em {sales} {sales === 1 ? "venda" : "vendas"}
      {foge ? " · diferente do contrato" : ""}
    </span>
  );
}

/**
 * Taxas do gateway (23/11/2026): a tabela contratada com a Pagar.me, ao lado do que as vendas dos
 * últimos 90 dias pagaram de fato. Mora só no banco (o repo é público). Spec:
 * docs/specs/taxas-da-reserva.md
 */
export function GatewayFeeScheduleSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const measured = useGatewayFeeMeasured(90).data;
  const [form, setForm] = React.useState<Form>(() => formFrom(undefined));
  const [ready, setReady] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data && !ready) {
      setForm(formFrom(data));
      setReady(true);
    }
  }, [data, ready]);

  const cadastrada = parseGatewayFeeSchedule(data?.gateway_fee_schedule) != null;
  const setBand = (i: number, patch: Partial<BandRow>) =>
    setForm((f) => ({ ...f, bands: f.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const antifraudeMedio = measuredAntifraudCents(measured);

  async function save() {
    const schedule = toSchedule(form);
    const ant = parseHundredths(form.anticipation);
    const wd = parseHundredths(form.withdrawal);
    const problema =
      validateGatewayFeeSchedule(schedule) ??
      (!Number.isInteger(ant) || ant < 0 || ant > MAX_FEE_BPS ? "Antecipação fora de 0% a 20% ao mês." : null) ??
      (!Number.isInteger(wd) || wd < 0 ? "Taxa de saque precisa ser um valor em reais não negativo." : null);
    setErro(problema);
    if (problema) return;
    try {
      await update.mutateAsync({
        gateway_fee_schedule: JSON.stringify(schedule),
        card_anticipation_rate_monthly_bps: String(ant),
        payout_withdrawal_fee_cents: String(wd),
      });
      toast.success("Tabela de taxas salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taxas do gateway (Pagar.me)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-caption text-muted text-pretty">
          O que foi contratado com a Pagar.me. Fica só no banco e aparece nas taxas de cada reserva.
          Ao lado, o que as vendas dos últimos 90 dias pagaram de fato.
          {!cadastrada && " Tabela ainda não cadastrada."}
        </p>

        <div className="grid gap-2 tablet:grid-cols-[1fr_8rem_1fr] tablet:items-center">
          <Label htmlFor="fee-pix">Pix (% sobre o valor)</Label>
          <Input
            id="fee-pix"
            inputMode="decimal"
            value={form.pix}
            onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
            disabled={isLoading}
          />
          <Medido {...measuredForBand(measured, "pix", 1, 1)} contractBps={parseHundredths(form.pix)} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink">Cartão por faixa de parcelas (% sobre o valor)</span>
          {form.bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`faixa-${i + 1}`}>
              <Input
                aria-label={`Faixa ${i + 1}: de`}
                className="w-16"
                inputMode="numeric"
                value={b.from}
                onChange={(e) => setBand(i, { from: e.target.value })}
              />
              <span className="text-caption text-muted">x a</span>
              <Input
                aria-label={`Faixa ${i + 1}: até`}
                className="w-16"
                inputMode="numeric"
                value={b.to}
                onChange={(e) => setBand(i, { to: e.target.value })}
              />
              <span className="text-caption text-muted">x</span>
              <Input
                aria-label={`Faixa ${i + 1}: taxa (%)`}
                className="w-24"
                inputMode="decimal"
                value={b.pct}
                onChange={(e) => setBand(i, { pct: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remover faixa ${i + 1}`}
                disabled={form.bands.length === 1}
                onClick={() => setForm((f) => ({ ...f, bands: f.bands.filter((_, j) => j !== i) }))}
              >
                <Trash />
              </Button>
              <Medido
                {...measuredForBand(measured, "card", Number(b.from), Number(b.to))}
                contractBps={parseHundredths(b.pct)}
              />
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForm((f) => ({ ...f, bands: [...f.bands, { from: "", to: "", pct: "" }] }))}
            >
              <Plus /> Adicionar faixa
            </Button>
          </div>
        </div>

        <div className="grid gap-2 tablet:grid-cols-[1fr_8rem_1fr] tablet:items-center">
          <Label htmlFor="fee-antifraud">Antifraude (R$ por transação)</Label>
          <Input
            id="fee-antifraud"
            inputMode="decimal"
            value={form.antifraud}
            onChange={(e) => setForm((f) => ({ ...f, antifraud: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted tabular-nums">
            {antifraudeMedio == null ? "sem venda" : `${formatBRL(antifraudeMedio / 100)} em média`}
          </span>

          <Label htmlFor="fee-anticipation">Antecipação (% ao mês)</Label>
          <Input
            id="fee-anticipation"
            inputMode="decimal"
            value={form.anticipation}
            onChange={(e) => setForm((f) => ({ ...f, anticipation: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted tabular-nums">
            {measured?.anticipation.payables
              ? `${formatBps(measured.anticipation.monthly_bps)} ao mês em ${measured.anticipation.payables} parcelas`
              : "sem antecipação"}
          </span>

          <Label htmlFor="fee-withdrawal">Saque para o banco (R$)</Label>
          <Input
            id="fee-withdrawal"
            inputMode="decimal"
            value={form.withdrawal}
            onChange={(e) => setForm((f) => ({ ...f, withdrawal: e.target.value }))}
            disabled={isLoading}
          />
          <span className="text-caption text-muted">não medido</span>
        </div>

        <p className="text-caption text-muted text-pretty">
          A taxa de antecipação também entra na estimativa que o split manda à Pagar.me quando a
          Movepark paga a antecipação do estacionamento.
        </p>

        {erro && (
          <p className="text-body-sm text-error" role="alert">
            {erro}
          </p>
        )}
        <div>
          <Button onClick={save} disabled={update.isPending || isLoading}>
            {update.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Encaixe na aba Pagamentos** (`src/routes/manager/settings.tsx`)

No topo: `import { GatewayFeeScheduleSettings } from "@/features/settings/GatewayFeeScheduleSettings";`
No `TabsContent value="payments"`, depois de `<InstallmentPolicySettings />`: `<GatewayFeeScheduleSettings />`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/features/settings/GatewayFeeScheduleSettings.test.tsx src/routes/manager`
Expected: PASS (os quatro testes de `settings.*.test.tsx` continuam verdes).

- [ ] **Step 7: Gates e commit**

Run: `bun run typecheck && bun run lint`
Expected: sem erro.

```bash
git add src/features/settings/api.ts src/features/settings/GatewayFeeScheduleSettings.tsx src/features/settings/GatewayFeeScheduleSettings.test.tsx src/routes/manager/settings.tsx
git commit -m "feat(taxas): tabela de taxas do gateway em Configurações, com o medido nas vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: A conta do modal (lógica pura)

**Files:**
- Create: `src/features/bookings/bookingFees.logic.ts`
- Test: `src/features/bookings/bookingFees.logic.test.ts`

**Interfaces:**
- Consumes: `buildMoneyBreakdown`/`MoneyBreakdown`/`MoneyPaymentLike` (`./bookingMoney.logic`); `applyInstallmentOverride`, `computeInstallmentPlan`, `InstallmentOption`, `InstallmentPolicy` (`@/lib/installments`); `bandFor`, `differsFromContract`, `FeeBand`, `GatewayFeeSchedule` (Tarefa 1).
- Produces:
  - `interface FeePayable { recipientId: string | null; amountCents: number; feeCents: number; anticipationFeeCents: number; fraudCoverageFeeCents: number; installment: number | null; paymentDate: string | null; originalPaymentDate: string | null }`
  - `parsePayables(raw: unknown): FeePayable[]`
  - `interface PayablesEventLike { payment_id: string | null; kind: string; response: unknown; created_at: string }`
  - `latestPayables(events: PayablesEventLike[] | null | undefined, paymentId: string): FeePayable[] | null`
  - `interface FeePaymentLike { method: string | null; amount: number; installments: number | null; gateway_fee_cents: number | null; anticipation_credit_cents?: number | null }`
  - `interface FeeBookingLike { total_amount: number; commission_channel?: string | null; commission_take_rate_bps?: number | null; commission_anticipation_payer?: string | null; commission_installments_max?: number | null; commission_installments_interest_free?: number | null }`
  - `type FeeLine` (união por `key`: `commission`, `interest`, `mdr`, `anticipation`, `antifraud`), `interface FeeInstallmentRow`, `interface FeeDetail` (campos abaixo)
  - `buildFeeDetail(args: { money: MoneyBreakdown; payment: FeePaymentLike; booking: FeeBookingLike; payables: FeePayable[] | null; schedule: GatewayFeeSchedule | null; policy: InstallmentPolicy; moveparkRecipientId: string | null }): FeeDetail`

- [ ] **Step 1: Write the failing test** (`src/features/bookings/bookingFees.logic.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { computeInstallmentPlan, type InstallmentPolicy } from "@/lib/installments";
import type { GatewayFeeSchedule } from "@/lib/gatewayFees";
import { buildMoneyBreakdown, type MoneyPaymentLike } from "./bookingMoney.logic";
import {
  buildFeeDetail,
  latestPayables,
  parsePayables,
  type FeeBookingLike,
  type FeePayable,
} from "./bookingFees.logic";

// Tudo inventado: o repo é público e as taxas da Pagar.me têm sigilo.
const POLICY: InstallmentPolicy = {
  version: 1,
  enabled: true,
  maxInstallments: 6,
  interestFreeUpTo: 2,
  monthlyInterestPct: 2,
  minInstallmentCents: 500,
  absorb: "customer",
};
const SCHEDULE = (cardBps: number): GatewayFeeSchedule => ({
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: cardBps },
    { from: 2, to: 6, bps: cardBps },
    { from: 7, to: 12, bps: cardBps },
  ],
  antifraud_cents: 5,
});

function payable(p: Partial<FeePayable> & { installment: number | null }): FeePayable {
  return {
    recipientId: "re_m",
    amountCents: 1000,
    feeCents: 0,
    anticipationFeeCents: 0,
    fraudCoverageFeeCents: 0,
    paymentDate: "2026-12-01T03:00:00Z",
    originalPaymentDate: "2026-12-01T03:00:00Z",
    ...p,
  };
}

// Cartão 2x de R$ 100: MDR 60 por parcela no recebedor da Movepark, a 2ª parcela antecipada
// (40 do estacionamento, 5 da Movepark) e antifraude 10. Total 175.
const CARTAO_2X: FeePayable[] = [
  payable({ installment: 1, recipientId: "re_p", amountCents: 4000 }),
  payable({ installment: 1, feeCents: 60, fraudCoverageFeeCents: 10 }),
  payable({
    installment: 2,
    recipientId: "re_p",
    amountCents: 4000,
    anticipationFeeCents: 40,
    paymentDate: "2026-11-05T03:00:00Z",
    originalPaymentDate: "2027-01-01T03:00:00Z",
  }),
  payable({
    installment: 2,
    feeCents: 60,
    anticipationFeeCents: 5,
    paymentDate: "2026-11-05T03:00:00Z",
    originalPaymentDate: "2027-01-01T03:00:00Z",
  }),
];

function cenario(o: {
  method?: "card" | "pix";
  chargedCents?: number;
  installments?: number;
  feeCents?: number | null;
  payables?: FeePayable[] | null;
  schedule?: GatewayFeeSchedule | null;
  booking?: Partial<FeeBookingLike>;
  custody?: boolean;
  refundedReais?: number | null;
} = {}) {
  const method = o.method ?? "card";
  const charged = o.chargedCents ?? 10000;
  const installments = o.installments ?? (method === "card" ? 2 : 1);
  const payment: MoneyPaymentLike = {
    status: "paid",
    method,
    amount: charged / 100,
    installments,
    split: [
      { role: "partner", amount: 8000, chargeProcessingFee: false },
      { role: "movepark", amount: charged - 8000, liable: true },
    ],
    split_sent_to_gateway: !o.custody,
    debt_recovered_cents: 0,
    gateway_fee_cents: o.feeCents === undefined ? 175 : o.feeCents,
    partner_release_at: null,
    paid_at: "2026-11-01T12:00:00Z",
    refunded_amount: o.refundedReais ?? null,
    refund_absorbed_by_master: false,
    refund_partner_cents: 0,
    created_at: "2026-11-01T12:00:00Z",
  };
  const money = buildMoneyBreakdown(
    { days: 1, total: 100, line_items: [{ kind: "parking", quantity: 1, subtotal: 100 }] },
    100,
    payment,
  );
  return buildFeeDetail({
    money,
    payment: {
      method,
      amount: charged / 100,
      installments,
      gateway_fee_cents: payment.gateway_fee_cents,
      anticipation_credit_cents: 40,
    },
    booking: {
      total_amount: 100,
      commission_channel: "hub",
      commission_take_rate_bps: 2000,
      commission_anticipation_payer: "movepark",
      ...o.booking,
    },
    payables: o.payables === undefined ? CARTAO_2X : o.payables,
    schedule: o.schedule === undefined ? SCHEDULE(118) : o.schedule,
    policy: POLICY,
    moveparkRecipientId: "re_m",
  });
}

describe("parsePayables", () => {
  it("lê o GET /payables cru, só crédito, com a data original caindo na de pagamento", () => {
    const raw = {
      data: [
        { type: "credit", recipient_id: "re_p", amount: 4000, fee: 0, anticipation_fee: 40, fraud_coverage_fee: 0, installment: 2, payment_date: "2026-11-05T03:00:00Z", original_payment_date: "2027-01-01T03:00:00Z" },
        { type: "credit", recipient_id: "re_m", amount: 1000, fee: 60, installment: 1, payment_date: "2026-12-01T03:00:00Z" },
        { type: "refund", recipient_id: "re_m", amount: -1000, fee: -60, installment: 1 },
      ],
      paging: {},
    };
    expect(parsePayables(raw)).toEqual([
      { recipientId: "re_p", amountCents: 4000, feeCents: 0, anticipationFeeCents: 40, fraudCoverageFeeCents: 0, installment: 2, paymentDate: "2026-11-05T03:00:00Z", originalPaymentDate: "2027-01-01T03:00:00Z" },
      { recipientId: "re_m", amountCents: 1000, feeCents: 60, anticipationFeeCents: 0, fraudCoverageFeeCents: 0, installment: 1, paymentDate: "2026-12-01T03:00:00Z", originalPaymentDate: "2026-12-01T03:00:00Z" },
    ]);
    expect(parsePayables(null)).toEqual([]);
    expect(parsePayables({ data: "x" })).toEqual([]);
  });
});

describe("latestPayables", () => {
  const ev = (payment_id: string, created_at: string, fee: number) => ({
    payment_id,
    kind: "payables",
    created_at,
    response: { data: [{ type: "credit", fee, amount: 1000, installment: 1 }] },
  });
  it("usa o último evento payables do pagamento", () => {
    const events = [
      ev("p1", "2026-11-01T10:00:00Z", 999),
      ev("p1", "2026-11-02T10:00:00Z", 60),
      ev("p2", "2026-11-03T10:00:00Z", 7),
      { payment_id: "p1", kind: "refund", created_at: "2026-11-04T10:00:00Z", response: {} },
    ];
    expect(latestPayables(events, "p1")?.map((p) => p.feeCents)).toEqual([60]);
  });
  it("sem evento, ou com evento vazio, devolve null", () => {
    expect(latestPayables([], "p1")).toBeNull();
    expect(latestPayables([{ payment_id: "p1", kind: "payables", created_at: "x", response: { data: [] } }], "p1")).toBeNull();
  });
});

describe("buildFeeDetail", () => {
  it("cartão 2x: resumo, linhas, total batendo com o pagamento e parcelas", () => {
    const d = cenario();
    expect(d.summary).toEqual({
      method: "card",
      chargedCents: 10000,
      installments: 2,
      firstInstallmentCents: 5000,
      installmentCents: 5000,
      partnerNetCents: 8000,
      moveparkNetCents: 1825,
      custody: false,
      refundedCents: 0,
    });
    expect(d.lines.map((l) => l.key)).toEqual(["commission", "mdr", "anticipation", "antifraud"]);
    expect(d.lines[0]).toEqual({ key: "commission", cents: 2000, rateBps: 2000, channel: "hub", payer: "partner" });
    expect(d.lines[1]).toEqual({ key: "mdr", method: "card", cents: 120, effectiveBps: 120, contractBps: 118, differs: false, payer: "movepark" });
    expect(d.lines[2]).toEqual({ key: "anticipation", cents: 45, partnerCents: 40, moveparkCents: 5, anticipatedAt: "2026-11-05T03:00:00Z", creditCents: 40, payer: "movepark" });
    expect(d.lines[3]).toEqual({ key: "antifraud", cents: 10, payer: "movepark" });
    expect(d.gateway).toEqual({ linesCents: 175, recordedCents: 175, pending: false, stale: false, detailed: true });
    expect(d.installments).toEqual([
      { installment: 1, customerCents: 5000, originalDate: "2026-12-01T03:00:00Z", receivedDate: "2026-12-01T03:00:00Z", mdrCents: 60, anticipationCents: 0 },
      { installment: 2, customerCents: 5000, originalDate: "2027-01-01T03:00:00Z", receivedDate: "2026-11-05T03:00:00Z", mdrCents: 60, anticipationCents: 45 },
    ]);
    expect(d.band).toEqual({ from: 2, to: 6, bps: 118 });
    expect(d.plan.chosen).toBe(2);
    expect(d.plan.reproduces).toBe(true);
  });

  it("recebíveis que não fecham com o pagamento acusam desatualizado", () => {
    expect(cenario({ feeCents: 176 }).gateway).toMatchObject({ linesCents: 175, recordedCents: 176, stale: true });
  });

  it("taxa ainda não apurada: pendente, sem acusar diferença", () => {
    expect(cenario({ feeCents: null }).gateway).toMatchObject({ pending: true, stale: false });
  });

  it("sem evento payables: só o total, sem detalhe por parcela", () => {
    const d = cenario({ payables: null });
    expect(d.gateway).toEqual({ linesCents: null, recordedCents: 175, pending: false, stale: false, detailed: false });
    expect(d.lines.find((l) => l.key === "mdr")).toMatchObject({ cents: null, effectiveBps: null });
    expect(d.installments.map((p) => [p.customerCents, p.mdrCents])).toEqual([[5000, null], [5000, null]]);
  });

  it("resto de centavos vai na primeira parcela", () => {
    const d = cenario({ installments: 3 });
    expect(d.installments.map((p) => p.customerCents)).toEqual([3334, 3333, 3333]);
    expect(d.summary).toMatchObject({ firstInstallmentCents: 3334, installmentCents: 3333 });
  });

  it("acusa diferente do contrato só acima de 0,05 p.p.", () => {
    const mdr = (bps: number) => cenario({ schedule: SCHEDULE(bps) }).lines.find((l) => l.key === "mdr");
    expect(mdr(125)).toMatchObject({ differs: false });
    expect(mdr(126)).toMatchObject({ differs: true });
    expect(cenario({ schedule: null }).lines.find((l) => l.key === "mdr")).toMatchObject({ contractBps: null, differs: false });
  });

  it("juros com a regra quando a política de hoje reproduz o cobrado", () => {
    const quatro = computeInstallmentPlan(10000, POLICY).find((o) => o.installments === 4)!;
    const d = cenario({ installments: 4, chargedCents: quatro.totalCents });
    expect(d.lines.find((l) => l.key === "interest")).toEqual({
      key: "interest",
      cents: quatro.totalCents - 10000,
      rule: { monthlyPct: 2, freeUpTo: 2 },
      payer: "customer",
    });
    expect(d.plan.reproduces).toBe(true);
  });

  it("juros sem percentual quando a venda seguiu outra condição", () => {
    const quatro = computeInstallmentPlan(10000, POLICY).find((o) => o.installments === 4)!;
    const d = cenario({ installments: 4, chargedCents: quatro.totalCents + 1 });
    expect(d.lines.find((l) => l.key === "interest")).toMatchObject({ rule: null });
    expect(d.plan.reproduces).toBe(false);
  });

  it("aplica o parcelamento congelado na reserva antes de comparar", () => {
    const d = cenario({ installments: 4, booking: { commission_installments_max: 4, commission_installments_interest_free: 4 } });
    expect(d.lines.some((l) => l.key === "interest")).toBe(false);
    expect(d.plan.reproduces).toBe(true);
    expect(d.plan.options.map((o) => o.installments)).toEqual([1, 2, 3, 4]);
  });

  it("Pix: sem parcelas e sem antecipação, contrato do Pix", () => {
    const d = cenario({
      method: "pix",
      feeCents: 80,
      payables: [payable({ installment: null, feeCents: 80, amountCents: 2000 })],
    });
    expect(d.lines.map((l) => l.key)).toEqual(["commission", "mdr", "antifraud"]);
    expect(d.lines[1]).toMatchObject({ method: "pix", cents: 80, effectiveBps: 80, contractBps: 80, differs: false });
    expect(d.installments).toEqual([]);
    expect(d.band).toBeNull();
    expect(d.summary).toMatchObject({ method: "pix", installments: 1 });
  });

  it("antecipação ainda não feita fica em zero", () => {
    const d = cenario({ payables: CARTAO_2X.map((p) => ({ ...p, anticipationFeeCents: 0 })), feeCents: 130 });
    expect(d.lines.find((l) => l.key === "anticipation")).toMatchObject({ cents: 0, anticipatedAt: null });
  });

  it("sem split e com estorno aparecem no resumo", () => {
    expect(cenario({ custody: true }).summary.custody).toBe(true);
    expect(cenario({ refundedReais: 100 }).summary.refundedCents).toBe(10000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/bookings/bookingFees.logic.test.ts`
Expected: FAIL, "Failed to resolve import "./bookingFees.logic"".

- [ ] **Step 3: Write the implementation** (`src/features/bookings/bookingFees.logic.ts`)

```ts
// Taxas da reserva destrinchadas (23/11/2026): o que a Pagar.me cobrou parcela por parcela, a
// comissão e os juros, comparados com a tabela contratada. Lógica pura; o modal só desenha.
// Os recebíveis vêm do último evento `payables` do rastro (`booking_gateway_trail`), o mesmo
// GET /payables que a Edge reconcile-gateway-fees soma em `payment.gateway_fee_cents`. Só
// `parsePayables` conhece o formato da Pagar.me; o resto opera no formato da interface (ADR-004).
// Spec: docs/specs/taxas-da-reserva.md

import {
  applyInstallmentOverride,
  computeInstallmentPlan,
  type InstallmentOption,
  type InstallmentPolicy,
} from "@/lib/installments";
import { bandFor, differsFromContract, type FeeBand, type GatewayFeeSchedule } from "@/lib/gatewayFees";
import type { MoneyBreakdown } from "./bookingMoney.logic";

/** Recebível no formato de `GatewayPayable` (_shared/payments) mais a data original. */
export interface FeePayable {
  recipientId: string | null;
  amountCents: number;
  feeCents: number;
  anticipationFeeCents: number;
  fraudCoverageFeeCents: number;
  installment: number | null;
  paymentDate: string | null;
  /** Vencimento original. Sem antecipação a Pagar.me nem manda, e vale a `paymentDate`. */
  originalPaymentDate: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Lê o `response` cru de um evento `payables`. Só crédito: o refund é a conta do estorno. */
export function parsePayables(raw: unknown): FeePayable[] {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null;
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .filter((r) => r && (r.type == null || r.type === "credit"))
    .map((r) => {
      const paymentDate = str(r.payment_date);
      return {
        recipientId: str(r.recipient_id),
        amountCents: num(r.amount),
        feeCents: num(r.fee),
        anticipationFeeCents: num(r.anticipation_fee),
        fraudCoverageFeeCents: num(r.fraud_coverage_fee),
        installment: typeof r.installment === "number" ? r.installment : null,
        paymentDate,
        originalPaymentDate: str(r.original_payment_date) ?? paymentDate,
      };
    });
}

export interface PayablesEventLike {
  payment_id: string | null;
  kind: string;
  response: unknown;
  created_at: string;
}

/** Recebíveis do último evento `payables` do pagamento; null sem evento ou sem recebível. */
export function latestPayables(
  events: PayablesEventLike[] | null | undefined,
  paymentId: string,
): FeePayable[] | null {
  const last = (events ?? [])
    .filter((e) => e.kind === "payables" && e.payment_id === paymentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!last) return null;
  const rows = parsePayables(last.response);
  return rows.length ? rows : null;
}

export interface FeePaymentLike {
  method: string | null;
  /** Valor cobrado, em reais. */
  amount: number;
  installments: number | null;
  gateway_fee_cents: number | null;
  anticipation_credit_cents?: number | null;
}

export interface FeeBookingLike {
  total_amount: number;
  commission_channel?: string | null;
  commission_take_rate_bps?: number | null;
  commission_anticipation_payer?: string | null;
  commission_installments_max?: number | null;
  commission_installments_interest_free?: number | null;
}

type Payer = "partner" | "movepark";

export type FeeLine =
  | { key: "commission"; cents: number | null; rateBps: number | null; channel: string | null; payer: "partner" }
  | { key: "interest"; cents: number; rule: { monthlyPct: number; freeUpTo: number } | null; payer: "customer" }
  | {
      key: "mdr";
      method: "card" | "pix";
      cents: number | null;
      effectiveBps: number | null;
      contractBps: number | null;
      differs: boolean;
      payer: Payer;
    }
  | {
      key: "anticipation";
      cents: number | null;
      partnerCents: number;
      moveparkCents: number;
      anticipatedAt: string | null;
      creditCents: number;
      payer: Payer;
    }
  | { key: "antifraud"; cents: number | null; payer: Payer };

export interface FeeInstallmentRow {
  installment: number;
  /** O que o cliente vê na fatura: cobrado dividido pelas parcelas, resto na primeira. */
  customerCents: number;
  originalDate: string | null;
  receivedDate: string | null;
  mdrCents: number | null;
  anticipationCents: number | null;
}

export interface FeeDetail {
  summary: {
    method: "card" | "pix";
    chargedCents: number;
    installments: number;
    firstInstallmentCents: number;
    installmentCents: number;
    partnerNetCents: number | null;
    moveparkNetCents: number | null;
    custody: boolean;
    refundedCents: number;
  };
  lines: FeeLine[];
  gateway: {
    linesCents: number | null;
    recordedCents: number | null;
    pending: boolean;
    stale: boolean;
    detailed: boolean;
  };
  installments: FeeInstallmentRow[];
  plan: { options: InstallmentOption[]; chosen: number; reproduces: boolean };
  band: FeeBand | null;
  schedule: GatewayFeeSchedule | null;
}

const total = (rows: FeePayable[], f: (p: FeePayable) => number) => rows.reduce((a, p) => a + f(p), 0);
const earliest = (dates: (string | null)[]) =>
  dates.filter((d): d is string => !!d).sort()[0] ?? null;

export function buildFeeDetail(args: {
  money: MoneyBreakdown;
  payment: FeePaymentLike;
  booking: FeeBookingLike;
  payables: FeePayable[] | null;
  schedule: GatewayFeeSchedule | null;
  policy: InstallmentPolicy;
  moveparkRecipientId: string | null;
}): FeeDetail {
  const { money, payment, booking, payables, schedule, policy, moveparkRecipientId } = args;
  const method: "card" | "pix" = payment.method === "card" ? "card" : "pix";
  const chargedCents = money.customer.chargedCents ?? Math.round(Number(payment.amount) * 100);
  const totalCents = money.customer.totalCents;
  const n = method === "card" ? Math.max(1, payment.installments ?? 1) : 1;
  const base = Math.floor(chargedCents / n);
  const first = chargedCents - base * (n - 1);
  const split = money.split;
  const feePayer: Payer = split?.feePayer ?? "movepark";
  const rows = payables ?? [];

  // A política de hoje com o parcelamento congelado na reserva. Se ela não reproduz o valor
  // cobrado, a venda seguiu outra condição e a tela não inventa percentual.
  const effectivePolicy = applyInstallmentOverride(policy, {
    max: booking.commission_installments_max,
    interestFree: booking.commission_installments_interest_free,
  });
  const options = computeInstallmentPlan(totalCents, effectivePolicy);
  const reproduces = options.find((o) => o.installments === n)?.totalCents === chargedCents;

  const lines: FeeLine[] = [
    {
      key: "commission",
      cents: split ? split.movepark.commissionCents : null,
      rateBps: booking.commission_take_rate_bps ?? null,
      channel: booking.commission_channel ?? null,
      payer: "partner",
    },
  ];

  const interestCents = Math.max(0, chargedCents - totalCents);
  if (interestCents > 0)
    lines.push({
      key: "interest",
      cents: interestCents,
      rule: reproduces
        ? { monthlyPct: effectivePolicy.monthlyInterestPct, freeUpTo: effectivePolicy.interestFreeUpTo }
        : null,
      payer: "customer",
    });

  const mdrCents = payables ? total(rows, (p) => p.feeCents) : null;
  const effectiveBps =
    mdrCents != null && chargedCents > 0 ? Math.round((mdrCents * 1_000_000) / chargedCents) / 100 : null;
  const band = method === "card" ? bandFor(schedule, n) : null;
  const contractBps = method === "card" ? (band?.bps ?? null) : (schedule?.pix_bps ?? null);
  lines.push({
    key: "mdr",
    method,
    cents: mdrCents,
    effectiveBps,
    contractBps,
    differs: differsFromContract(effectiveBps, contractBps),
    payer: feePayer,
  });

  if (method === "card") {
    const anticipated = rows.filter((p) => p.anticipationFeeCents > 0);
    const all = total(anticipated, (p) => p.anticipationFeeCents);
    const moveparkCents = total(
      anticipated.filter((p) => moveparkRecipientId != null && p.recipientId === moveparkRecipientId),
      (p) => p.anticipationFeeCents,
    );
    lines.push({
      key: "anticipation",
      cents: payables ? all : null,
      partnerCents: all - moveparkCents,
      moveparkCents,
      anticipatedAt: earliest(anticipated.map((p) => p.paymentDate)),
      creditCents: Math.max(0, payment.anticipation_credit_cents ?? 0),
      payer: booking.commission_anticipation_payer === "partner" ? "partner" : "movepark",
    });
  }

  lines.push({ key: "antifraud", cents: payables ? total(rows, (p) => p.fraudCoverageFeeCents) : null, payer: feePayer });

  const linesCents = payables
    ? total(rows, (p) => p.feeCents + p.anticipationFeeCents + p.fraudCoverageFeeCents)
    : null;
  const recordedCents = payment.gateway_fee_cents;

  const installments: FeeInstallmentRow[] =
    method === "card"
      ? Array.from({ length: n }, (_, i) => {
          const k = i + 1;
          const deste = rows.filter((p) => p.installment === k);
          return {
            installment: k,
            customerCents: k === 1 ? first : base,
            originalDate: earliest(deste.map((p) => p.originalPaymentDate)),
            receivedDate: earliest(deste.map((p) => p.paymentDate)),
            mdrCents: payables ? total(deste, (p) => p.feeCents) : null,
            anticipationCents: payables ? total(deste, (p) => p.anticipationFeeCents) : null,
          };
        })
      : [];

  return {
    summary: {
      method,
      chargedCents,
      installments: n,
      firstInstallmentCents: first,
      installmentCents: base,
      partnerNetCents: split ? split.partner.netCents : null,
      moveparkNetCents: split ? split.movepark.netCents : null,
      custody: split?.custody ?? false,
      refundedCents: money.refund?.totalCents ?? 0,
    },
    lines,
    gateway: {
      linesCents,
      recordedCents,
      pending: recordedCents == null,
      stale: linesCents != null && recordedCents != null && linesCents !== recordedCents,
      detailed: payables != null,
    },
    installments,
    plan: { options, chosen: n, reproduces },
    band,
    schedule,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/features/bookings/bookingFees.logic.test.ts`
Expected: PASS. (Se o `toEqual` do primeiro caso falhar só por causa do campo `schedule`, ele não faz parte do `expect`: confira o caso que quebrou antes de mexer no código.)

- [ ] **Step 5: Gates e commit**

Run: `bun run typecheck && bun run lint`
Expected: sem erro.

```bash
git add src/features/bookings/bookingFees.logic.ts src/features/bookings/bookingFees.logic.test.ts
git commit -m "feat(taxas): conta das taxas da reserva a partir dos recebíveis do rastro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: O modal e o botão "Ver taxas"

**Files:**
- Create: `src/features/bookings/BookingFeesDialog.tsx`
- Test: `src/features/bookings/BookingFeesDialog.test.tsx`
- Modify: `src/features/bookings/BookingMoneyCard.tsx` (exportar `Linha` e `Bloco`; prop `onShowFees`)
- Modify: `src/features/bookings/BookingDetailView.tsx` (estado, condição e montagem do modal)
- Test: `src/features/bookings/BookingDetailView.test.tsx` (três casos novos)

**Interfaces:**
- Consumes: Tarefa 4 (`buildFeeDetail`, `latestPayables`, `FeeDetail`, `FeeLine`, `FeePaymentLike`, `FeeBookingLike`); Tarefa 1 (`formatBps`, `parseGatewayFeeSchedule`); `useBookingGatewayTrail(bookingId, enabled)` (`./api`); `useAppSettings` (`@/features/settings/api`); `parseInstallmentPolicy` (`@/lib/installments`).
- Produces: `BookingFeesDialog({ open, onOpenChange, bookingId, money, payment, booking })` com `payment: FeePaymentLike & { id: string }`; `BookingMoneyCard` aceita `onShowFees?: () => void` e só desenha o botão quando recebe.

- [ ] **Step 1: Write the failing tests**

`src/features/bookings/BookingFeesDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { buildMoneyBreakdown, type MoneyPaymentLike } from "./bookingMoney.logic";

// Tudo inventado: o repo é público.
const state = vi.hoisted(() => ({ cardBps: 118, events: [] as unknown[] }));
vi.mock("./api", () => ({
  useBookingGatewayTrail: () => ({ data: { payments: [], events: state.events }, isLoading: false }),
}));
vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => ({
    isLoading: false,
    data: {
      gateway_fee_schedule: JSON.stringify({
        version: 1,
        pix_bps: 80,
        card: [
          { from: 1, to: 1, bps: state.cardBps },
          { from: 2, to: 6, bps: state.cardBps },
          { from: 7, to: 12, bps: state.cardBps },
        ],
        antifraud_cents: 5,
      }),
      card_installment_policy: JSON.stringify({ version: 1, enabled: true, maxInstallments: 6, interestFreeUpTo: 2, monthlyInterestPct: 2, minInstallmentCents: 500, absorb: "customer" }),
      pagarme_movepark_recipient_id: "re_m",
    },
  }),
}));

import { BookingFeesDialog } from "./BookingFeesDialog";

const payables = (method: "card" | "pix") => ({
  payment_id: "p1",
  kind: "payables",
  created_at: "2026-11-02T10:00:00Z",
  response: {
    data:
      method === "card"
        ? [
            { type: "credit", recipient_id: "re_p", amount: 4000, fee: 0, installment: 1, payment_date: "2026-12-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_m", amount: 1000, fee: 60, fraud_coverage_fee: 10, installment: 1, payment_date: "2026-12-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_p", amount: 4000, fee: 0, anticipation_fee: 40, installment: 2, payment_date: "2026-11-05T03:00:00Z", original_payment_date: "2027-01-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_m", amount: 1000, fee: 60, anticipation_fee: 5, installment: 2, payment_date: "2026-11-05T03:00:00Z", original_payment_date: "2027-01-01T03:00:00Z" },
          ]
        : [{ type: "credit", recipient_id: "re_m", amount: 2000, fee: 80 }],
  },
});

function abre(method: "card" | "pix") {
  state.events = [payables(method)];
  const fee = method === "card" ? 175 : 80;
  const pay: MoneyPaymentLike = {
    status: "paid", method, amount: 100, installments: method === "card" ? 2 : 1,
    split: [{ role: "partner", amount: 8000, chargeProcessingFee: false }, { role: "movepark", amount: 2000, liable: true }],
    split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: fee, partner_release_at: null,
    paid_at: "2026-11-01T12:00:00Z", refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0,
    created_at: "2026-11-01T12:00:00Z",
  };
  const money = buildMoneyBreakdown({ days: 1, total: 100, line_items: [{ kind: "parking", quantity: 1, subtotal: 100 }] }, 100, pay);
  return renderWithProviders(
    <BookingFeesDialog
      open
      onOpenChange={() => {}}
      bookingId="bk-1"
      money={money}
      payment={{ id: "p1", method, amount: 100, installments: pay.installments, gateway_fee_cents: fee, anticipation_credit_cents: 40 }}
      booking={{ total_amount: 100, commission_channel: "hub", commission_take_rate_bps: 2000, commission_anticipation_payer: "movepark" }}
    />,
  );
}

describe("BookingFeesDialog", () => {
  it("cartão: os quatro blocos, a taxa efetiva ao lado do contrato e o total do gateway", () => {
    state.cardBps = 118;
    abre("card");
    for (const t of ["Resumo", "Taxas cobradas nesta venda", "Parcelas", "Tabela de taxas"])
      expect(screen.getByText(t)).toBeInTheDocument();
    const mdr = screen.getByTestId("taxa-mdr");
    expect(mdr).toHaveTextContent("Cartão (Pagar.me)");
    expect(mdr).toHaveTextContent(/1,20% nesta venda · contrato 1,18%/);
    expect(mdr).not.toHaveTextContent("diferente do contrato");
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(/1,75/);
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent(/devolveu/);
    expect(within(screen.getByTestId("taxas-parcelas")).getAllByRole("row")).toHaveLength(3);
    expect(within(screen.getByTestId("tabela-parcelamento")).getByText(/2x de/).closest("[aria-current]")).not.toBeNull();
  });

  it("cartão fora do contrato ganha o aviso", () => {
    state.cardBps = 126;
    abre("card");
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent("diferente do contrato");
  });

  it("Pix: sem bloco de parcelas e sem antecipação", () => {
    state.cardBps = 118;
    abre("pix");
    expect(screen.queryByText("Parcelas")).toBeNull();
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/Pix \(Pagar.me\)/);
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/0,80% nesta venda · contrato 0,80%/);
  });
});
```

Em `src/features/bookings/BookingDetailView.test.tsx`, dentro do `describe("BookingDetailView", ...)`, acrescente:

```tsx
  it("o Manager vê o botão Ver taxas numa reserva paga", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("manager");
    expect(screen.getByRole("button", { name: "Ver taxas" })).toBeInTheDocument();
  });

  it("o Operator não vê o botão Ver taxas", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("operator");
    expect(screen.queryByRole("button", { name: "Ver taxas" })).toBeNull();
  });

  it("sem pagamento pago não há taxas a ver", () => {
    state.booking = booking("pending", []);
    state.trail = { events: [], payments: [] };
    abre("manager");
    expect(screen.queryByRole("button", { name: "Ver taxas" })).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/bookings/BookingFeesDialog.test.tsx src/features/bookings/BookingDetailView.test.tsx`
Expected: FAIL (import de `./BookingFeesDialog` não resolve; botão "Ver taxas" não existe).

- [ ] **Step 3: Exporte os blocos e acrescente o botão** (`src/features/bookings/BookingMoneyCard.tsx`)

1. Troque `function Linha(` por `export function Linha(` e `function Bloco(` por `export function Bloco(`.
2. No topo: `import { Button } from "@/components/ui/button";`
3. Na assinatura de `BookingMoneyCard`, acrescente a prop e o tipo:

```tsx
export function BookingMoneyCard({
  money,
  audience = "manager",
  paymentState = "paid",
  bookingStatus = "confirmed",
  onShowFees,
}: {
  money: MoneyBreakdown;
  audience?: "manager" | "operator";
  /** Estado do pagamento visto pelo cliente (02/10/2026): "O cliente pagou" só quando pagou. */
  paymentState?: CustomerPaymentState;
  bookingStatus?: string;
  /** Abre o modal de taxas (23/11/2026). Só o Manager passa, e só com pagamento pago. */
  onShowFees?: () => void;
}) {
```

4. No ramo do Manager (o `return` final), troque o `CardHeader` por:

```tsx
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>Valores</CardTitle>
        {onShowFees && (
          <Button variant="outline" size="sm" onClick={onShowFees}>
            Ver taxas
          </Button>
        )}
      </CardHeader>
```

- [ ] **Step 4: Write the dialog** (`src/features/bookings/BookingFeesDialog.tsx`)

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate } from "@/lib/format";
import { parseInstallmentPolicy } from "@/lib/installments";
import { formatBps, parseGatewayFeeSchedule } from "@/lib/gatewayFees";
import { useAppSettings } from "@/features/settings/api";
import { useBookingGatewayTrail } from "./api";
import { Bloco, Linha } from "./BookingMoneyCard";
import type { MoneyBreakdown } from "./bookingMoney.logic";
import {
  buildFeeDetail,
  latestPayables,
  type FeeBookingLike,
  type FeeDetail,
  type FeeLine,
  type FeePaymentLike,
} from "./bookingFees.logic";

const brl = (cents: number) => formatBRL(cents / 100);
const PAGADOR = { partner: "estacionamento", movepark: "Movepark", customer: "cliente" } as const;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function TaxaLinha({
  label,
  regra,
  pagador,
  valor,
  aviso,
  forte,
  testId,
}: {
  label: string;
  regra: string | null;
  pagador: string | null;
  valor: string;
  aviso: string | null;
  forte?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-2 ${forte ? "border-t border-hairline font-medium" : ""}`}
      data-testid={testId}
    >
      <div className="flex flex-col">
        <span className="text-body-sm text-ink">{label}</span>
        {regra && <span className="text-caption text-muted text-pretty">{regra}</span>}
        {pagador && <span className="text-caption text-muted">pago por {pagador}</span>}
        {aviso && <span className="text-caption font-medium text-error">{aviso}</span>}
      </div>
      <span className="text-body-sm tabular-nums">{valor}</span>
    </div>
  );
}

function descreve(l: FeeLine, pending: boolean) {
  const v = (c: number | null) => (c != null ? brl(c) : pending ? "apurando" : "-");
  switch (l.key) {
    case "commission":
      return {
        label: "Comissão Movepark",
        regra:
          l.rateBps != null
            ? `${formatBps(l.rateBps)} sobre as diárias${l.channel ? ` · canal ${l.channel}` : ""}`
            : null,
        valor: l.cents != null ? brl(l.cents) : "-",
        aviso: null,
      };
    case "interest":
      return {
        label: "Juros do parcelamento",
        regra: l.rule ? `${pct(l.rule.monthlyPct)} ao mês acima de ${l.rule.freeUpTo}x` : "condição da época da compra",
        valor: brl(l.cents),
        aviso: null,
      };
    case "mdr":
      return {
        label: l.method === "card" ? "Cartão (Pagar.me)" : "Pix (Pagar.me)",
        regra:
          l.effectiveBps == null
            ? "sem detalhe por parcela"
            : `${formatBps(l.effectiveBps)} nesta venda · contrato ${l.contractBps != null ? formatBps(l.contractBps) : "não cadastrado"}`,
        valor: v(l.cents),
        aviso: l.differs ? "diferente do contrato" : null,
      };
    case "anticipation": {
      let regra = "sem detalhe por parcela";
      if (l.cents === 0) regra = "ainda não antecipado";
      else if (l.cents != null) {
        regra = `estacionamento ${brl(l.partnerCents)} · Movepark ${brl(l.moveparkCents)}`;
        if (l.anticipatedAt) regra += ` · antecipado em ${formatDate(l.anticipatedAt)}`;
        if (l.payer === "movepark" && l.creditCents > 0)
          regra += ` · a Movepark devolveu ${brl(l.creditCents)} ao estacionamento`;
      }
      return { label: "Antecipação (Pagar.me)", regra, valor: v(l.cents), aviso: null };
    }
    case "antifraud":
      return { label: "Antifraude (Pagar.me)", regra: null, valor: v(l.cents), aviso: null };
  }
}

function LinhaTabela({ rotulo, valor, atual }: { rotulo: string; valor: string; atual: boolean }) {
  return (
    <div
      aria-current={atual ? "true" : undefined}
      className={`flex justify-between gap-4 rounded px-2 py-1 text-body-sm ${atual ? "bg-canvas font-medium text-primary" : "text-body"}`}
    >
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Conteudo({ d }: { d: FeeDetail }) {
  const s = d.summary;
  const cartao = s.method === "card";
  const comoPagou = cartao
    ? ` em ${s.installments}x de ${brl(s.installmentCents)}${s.firstInstallmentCents !== s.installmentCents ? ` (a 1ª de ${brl(s.firstInstallmentCents)})` : ""}`
    : " no Pix";
  const notas = [
    s.custody ? "sem split: o valor ficou com a Movepark" : null,
    s.refundedCents > 0 ? `estornado ao cliente: ${brl(s.refundedCents)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const g = d.gateway;
  const totalGateway = g.linesCents ?? g.recordedCents;

  return (
    <div className="flex flex-col gap-4">
      <Bloco title="Resumo" hint={notas || undefined}>
        <Linha label={`O cliente pagou${comoPagou}`} value={brl(s.chargedCents)} testId="taxas-cobrado" />
        <Linha label="O estacionamento recebe" value={s.partnerNetCents != null ? brl(s.partnerNetCents) : "-"} />
        <Linha label="A Movepark fica com" value={s.moveparkNetCents != null ? brl(s.moveparkNetCents) : "-"} strong />
      </Bloco>

      <Bloco title="Taxas cobradas nesta venda">
        <div className="flex flex-col">
          {d.lines.map((l) => (
            <TaxaLinha key={l.key} {...descreve(l, g.pending)} pagador={PAGADOR[l.payer]} testId={`taxa-${l.key}`} />
          ))}
          <TaxaLinha
            label="Total do gateway"
            regra={!g.detailed && g.recordedCents != null ? "sem detalhe por parcela" : null}
            pagador={null}
            valor={totalGateway != null ? brl(totalGateway) : "apurando"}
            aviso={g.stale && g.recordedCents != null ? `recebíveis desatualizados: o pagamento registra ${brl(g.recordedCents)}` : null}
            forte
            testId="taxa-total"
          />
        </div>
      </Bloco>

      {cartao && (
        <Bloco title="Parcelas" hint={g.detailed ? undefined : "sem detalhe por parcela"}>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm tabular-nums" data-testid="taxas-parcelas">
              <thead className="text-caption text-muted">
                <tr>
                  <th className="py-1 text-left font-normal">Parcela</th>
                  <th className="text-right font-normal">Valor</th>
                  <th className="text-right font-normal">Vencimento</th>
                  <th className="text-right font-normal">Entrou</th>
                  <th className="text-right font-normal">Taxas</th>
                </tr>
              </thead>
              <tbody>
                {d.installments.map((p) => (
                  <tr key={p.installment} className="border-t border-hairline">
                    <td className="py-1">{p.installment}ª</td>
                    <td className="text-right">{brl(p.customerCents)}</td>
                    <td className="text-right">{p.originalDate ? formatDate(p.originalDate) : "-"}</td>
                    <td className="text-right">{p.receivedDate ? formatDate(p.receivedDate) : "-"}</td>
                    <td className="text-right">
                      {p.mdrCents != null && p.anticipationCents != null ? brl(p.mdrCents + p.anticipationCents) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      <Bloco title="Tabela de taxas">
        <div className="grid gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1" data-testid="tabela-parcelamento">
            <span className="text-body-sm font-medium text-ink">Parcelamento desta reserva</span>
            {!d.plan.reproduces && (
              <span className="text-caption text-muted text-pretty">
                pela política de hoje; a venda seguiu outra condição
              </span>
            )}
            {d.plan.options.map((o) => (
              <LinhaTabela
                key={o.installments}
                rotulo={`${o.installments}x de ${brl(o.installmentCents)}`}
                valor={o.hasInterest ? `total ${brl(o.totalCents)}` : "sem juros"}
                atual={cartao && o.installments === d.plan.chosen}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1" data-testid="tabela-gateway">
            <span className="text-body-sm font-medium text-ink">Taxas do gateway</span>
            {d.schedule ? (
              <>
                <LinhaTabela rotulo="Pix" valor={formatBps(d.schedule.pix_bps)} atual={!cartao} />
                {d.schedule.card.map((b) => (
                  <LinhaTabela
                    key={b.from}
                    rotulo={b.from === b.to ? `Cartão ${b.from}x` : `Cartão ${b.from}x a ${b.to}x`}
                    valor={formatBps(b.bps)}
                    atual={cartao && d.band?.from === b.from}
                  />
                ))}
                <LinhaTabela rotulo="Antifraude" valor={brl(d.schedule.antifraud_cents)} atual={false} />
              </>
            ) : (
              <span className="text-caption text-muted text-pretty">
                Tabela não cadastrada. Cadastre em Configurações, aba Pagamentos.
              </span>
            )}
          </div>
        </div>
      </Bloco>
    </div>
  );
}

/**
 * Taxas da reserva (23/11/2026): resumo, cada taxa com regra e quem pagou, as parcelas e a tabela
 * que valeu para a venda. Só o Manager abre. Spec: docs/specs/taxas-da-reserva.md
 */
export function BookingFeesDialog({
  open,
  onOpenChange,
  bookingId,
  money,
  payment,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  money: MoneyBreakdown;
  payment: FeePaymentLike & { id: string };
  booking: FeeBookingLike;
}) {
  const trail = useBookingGatewayTrail(bookingId, open);
  const settings = useAppSettings();
  const d =
    trail.isLoading || settings.isLoading
      ? null
      : buildFeeDetail({
          money,
          payment,
          booking,
          payables: latestPayables(trail.data?.events, payment.id),
          schedule: parseGatewayFeeSchedule(settings.data?.gateway_fee_schedule),
          policy: parseInstallmentPolicy(settings.data?.card_installment_policy),
          moveparkRecipientId: settings.data?.pagarme_movepark_recipient_id ?? null,
        });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="taxas-da-reserva">
        <DialogHeader>
          <DialogTitle>Taxas da reserva</DialogTitle>
          <DialogDescription>O que cada um pagou nesta venda e a tabela que valeu para ela.</DialogDescription>
        </DialogHeader>
        {d ? <Conteudo d={d} /> : <Skeleton className="h-64 w-full" />}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Monte o modal na reserva** (`src/features/bookings/BookingDetailView.tsx`)

1. Imports, junto dos outros de `./`:

```tsx
import { BookingFeesDialog } from "./BookingFeesDialog";
import type { FeeBookingLike } from "./bookingFees.logic";
```

2. Estado, logo depois de `const [flightCheckoutOpen, setFlightCheckoutOpen] = React.useState(false);` (antes de qualquer `return`):

```tsx
  const [feesOpen, setFeesOpen] = React.useState(false);
```

3. Depois de `const money = buildMoneyBreakdown(...)`:

```tsx
  // Taxas da reserva (23/11/2026): só o Manager (hub_admin, que lê o rastro) e só com pagamento pago.
  const podeVerTaxas =
    audience === "manager" &&
    effectiveRole === "hub_admin" &&
    !!pagamento &&
    (pagamento.status === "paid" || pagamento.status === "refunded");
```

4. Troque o `<BookingMoneyCard ... />` por:

```tsx
      <BookingMoneyCard
        money={money}
        audience={audience}
        paymentState={estado.payment}
        bookingStatus={booking.status}
        onShowFees={podeVerTaxas ? () => setFeesOpen(true) : undefined}
      />
      {podeVerTaxas && feesOpen && pagamento && (
        <BookingFeesDialog
          open
          onOpenChange={setFeesOpen}
          bookingId={booking.id}
          money={money}
          payment={{
            id: (pagamento as unknown as { id: string }).id,
            method: pagamento.method,
            amount: Number(pagamento.amount),
            installments: pagamento.installments,
            gateway_fee_cents: pagamento.gateway_fee_cents,
            anticipation_credit_cents:
              (pagamento as unknown as { anticipation_credit_cents?: number | null }).anticipation_credit_cents ?? null,
          }}
          booking={booking as unknown as FeeBookingLike}
        />
      )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/features/bookings`
Expected: PASS, incluindo os testes antigos de `BookingDetailView.test.tsx`.

- [ ] **Step 7: Gates e commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

```bash
git add src/features/bookings/BookingFeesDialog.tsx src/features/bookings/BookingFeesDialog.test.tsx src/features/bookings/BookingMoneyCard.tsx src/features/bookings/BookingDetailView.tsx src/features/bookings/BookingDetailView.test.tsx
git commit -m "feat(taxas): modal Ver taxas na reserva do Manager

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Spec, catálogo, segurança e conferência em produção

**Files:**
- Modify: `docs/specs/taxas-da-reserva.md`
- Modify: `docs/specs/README.md`

- [ ] **Step 1: Atualize a spec** (`docs/specs/taxas-da-reserva.md`)

1. Linha `**Estado:**` → `**Estado:** implementado em DD/MM/AAAA (commits ...).`, com a data do dia e os hashes curtos das Tarefas 1 a 5 (`git log --oneline -6`).
2. Na seção da RPC, troque a frase que diz que ela devolve o MDR efetivo por faixa por: "devolve **somas** por método e número de parcelas (`sales`, `charged_cents`, `fee_cents`, `fraud_cents`) e a antecipação (`payables`, `fee_cents`, `base_cents_month`, `monthly_bps`). A taxa por faixa é calculada no front (`measuredForBand`), porque as faixas são configuração."
3. Em **Arquitetura**: `parseGatewayFeeSchedule`, `bandFor` e a leitura do medido moram em `src/lib/gatewayFees.ts` (a tela de Configurações e o modal usam os dois); o bloco de Configurações é `src/features/settings/GatewayFeeScheduleSettings.tsx`; o botão vem por `onShowFees` no `BookingMoneyCard`.
4. Passada final por "—" e "–": `grep -n "[—–]" docs/specs/taxas-da-reserva.md` sem resultado.

- [ ] **Step 2: Catálogo** (`docs/specs/README.md`)

Acrescente na tabela de migrations, logo abaixo da linha de `20261205200000_vaga_max_pare_seguro.sql`:

```markdown
| `20261206100000_gateway_fee_measured.sql` | **Taxa do gateway medida nas vendas (23/11/2026):** RPC `gateway_fee_measured(p_days)` (só hub_admin, `42501` para os demais, revoke nominal de anon e authenticated) com as somas de MDR, antifraude e valor cobrado por método e parcelas, lidas do último `payables` de cada pagamento pago ou estornado, e a antecipação ao mês. A tabela contratada fica em `app_setting.gateway_fee_schedule`, nunca em migration. pgTAP `gateway_fee_measured.test.sql` (14). Ver [taxas-da-reserva.md](./taxas-da-reserva.md) |
```

E na linha de `taxas-da-reserva.md` no índice de specs, troque o estado para implementado.

- [ ] **Step 3: Gates completos**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

- [ ] **Step 4: Segurança**

Rode a skill `security-review` sobre o diff. Rode `mcp__1f1d7cd0-403f-485f-8f09-f96e49482b16__get_advisors` (project `mgaigbezdalbyuqiofcf`, type `security`) e compare com o que já existia: nenhuma regressão ligada a `gateway_fee_measured` (função exposta a `anon`, `search_path` mutável). Achado novo vira correção antes do commit.

- [ ] **Step 5: Commit da documentação**

```bash
git add docs/specs/taxas-da-reserva.md docs/specs/README.md
git commit -m "docs(specs): taxas da reserva implementadas e migration no catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Pré-preencher a tabela contratada (só no banco)**

Leia `docs/privado/pagarme-taxas-proposta-vs-medido.md` (fora do git). Se ele trouxer a tabela contratada (Pix, cartão por faixa, antifraude), grave direto no banco, sem migration e sem arquivo versionado:

```sql
insert into public.app_setting(key, value, is_public)
values ('gateway_fee_schedule', '<JSON no formato da spec, com os valores do documento>', false)
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Confira que `is_public` ficou `false`: `select key, is_public from public.app_setting where key = 'gateway_fee_schedule';`. Se o documento não trouxer a tabela, não invente: o bloco mostra "Tabela ainda não cadastrada" e o relatório final diz isso.

- [ ] **Step 7: Conferir em produção** (depois do build da Cloudflare, ~2 min depois do último push)

No Arc, pela extensão Claude in Chrome, numa aba criada com `tabs_create_mcp`:
1. `https://movepark.co/manager/settings`, aba Pagamentos: o bloco "Taxas do gateway (Pagar.me)" aparece, com a coluna do medido preenchida.
2. Escolha uma reserva paga no cartão parcelado e antecipada: `select b.code from booking b join payment p on p.booking_id = b.id where p.method = 'card' and p.installments > 1 and p.status = 'paid' and p.anticipation_fee_partner_cents > 0 order by p.paid_at desc limit 1;`. Abra `https://movepark.co/manager/bookings/<code>`, clique "Ver taxas" e confira com `get_page_text` que o "Total do gateway" é igual ao `gateway_fee_cents` do pagamento (consulte pelo SQL) e que não aparece "recebíveis desatualizados". Repita com uma reserva paga no Pix.
3. Feche a aba que abriu. Nenhum número dessa conferência vai para arquivo.
