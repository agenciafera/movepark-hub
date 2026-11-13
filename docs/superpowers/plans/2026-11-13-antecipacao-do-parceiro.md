# Antecipação do cartão do parceiro (E0.3.14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber o cartão do parceiro em 30 dias pela antecipação automática da Pagar.me, ligada empresa a empresa no Manager, com quem paga a taxa configurável (Movepark por padrão) e compensado no split, mais o botão "Antecipar agora" e o crédito de toda taxa da Movepark que cair no estacionamento.

**Architecture:** O pagador congela na reserva junto com o pacote de comissão (`resolve_commission`). Na cobrança de cartão, se o recebedor do parceiro antecipa e o pagador é a Movepark, `splitForGateway` move a estimativa da taxa da perna da Movepark para a do parceiro (`estimateAnticipationCompCents`). O que não couber, a falta medida na releitura dos recebíveis (~D+31) e a taxa das antecipações pontuais pagas pela Movepark viram crédito no `payout_fee_credit_cents`, que já volta no split da venda seguinte. A antecipação pontual vive numa Edge nova (`recipient-anticipation`) atrás da interface `PaymentGateway` (ADR-004).

**Tech Stack:** Supabase (Postgres, pgTAP, Edge Functions Deno), React 18 + TanStack Query + Testing Library, Pagar.me Core v5.

**Spec:** [`docs/specs/antecipacao-do-parceiro.md`](../../specs/antecipacao-do-parceiro.md)

## Global Constraints

- Trabalho direto na `main`, `commit` + `git push origin main` ao fim de cada tarefa (CLAUDE.md).
- Migration aplicada pelo MCP `apply_migration` no projeto `mgaigbezdalbyuqiofcf`, nunca `supabase db push`; arquivo com `HHMMSS` real e único (`ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` vazio).
- `bun run gen:types` sai incompleto: leia o diff de `src/types/database.ts` e descarte se remover tabela/função que existe; nesse caso use cast localizado e comentado.
- Função nova no `public`: `revoke all ... from public, anon, authenticated` nominal + `grant` explícito.
- Coluna nova em `company`: `grant select (col)` + entrar em `COMPANY_COLUMNS` + `company_column_privileges.test.sql`.
- Nada de Supabase local (`supabase start`); pgTAP roda no vivo com `begin; create extension pgtap; ... rollback;` via `supabase db query --linked -f`.
- Repo é PÚBLICO: nenhuma condição comercial da Pagar.me (taxas da proposta, CET) em código, migration ou doc. A taxa de antecipação entra no banco por `update app_setting` executado direto, não por migration.
- Sem travessão (— ou –) em texto, comentário, doc ou commit.
- Gates: typecheck, lint, `bun run test`, `bun run test:edge` verdes; `/security-review` + advisors de segurança no fim (diff toca migration, RLS, SECURITY DEFINER e Edge).
- Edges públicas: `--no-verify-jwt` só nas que já são (`recipient-anticipation` valida JWT de hub_admin ou chave do Vault dentro do código, então também vai com `--no-verify-jwt`, como `reconcile-gateway-fees`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/payments/anticipation.ts` (novo) | Estimativa pura da compensação e leitura dos recebíveis antecipados |
| `supabase/functions/_shared/payments/anticipation.test.ts` (novo) | Testes Deno da estimativa |
| `supabase/functions/_shared/payments/split.ts` | `splitForGateway` aplica a compensação depois do crédito |
| `supabase/functions/_shared/payments/types.ts`, `pagarme.ts`, `mock.ts` | Métodos de antecipação pontual e leitura das configurações do recebedor |
| `supabase/functions/_shared/payments/commission.ts` | Pacote ganha `anticipationPayer` |
| `supabase/migrations/20261203150000_antecipacao_do_parceiro.sql` (novo) | Colunas, tabela, RPCs, resolução, crédito generalizado |
| `supabase/tests/antecipacao_do_parceiro.test.sql` (novo) | pgTAP |
| `supabase/functions/recipient-anticipation/index.ts` + `logic.ts` + `index.test.ts` (novos) | Configuração lida, limites, simulação, criação e sincronização da pontual |
| `supabase/functions/create-card-charge/index.ts` | Aplica a compensação e grava `anticipation_comp_cents`/`anticipation_credit_cents` |
| `supabase/functions/reconcile-gateway-fees/index.ts` + `logic.ts` | Releitura única depois da antecipação e acerto do crédito |
| `src/features/payouts/AnticipationSection.tsx` (novo) + `anticipation.logic.ts` (novo) | Interruptor, pagador e custo de referência no diálogo de repasse |
| `src/features/payouts/AnticipateNowDialog.tsx` (novo) | Botão "Antecipar agora" |
| `src/features/payouts/PayoutSettingsDialog.tsx`, `api.ts` | Encaixe da seção e hooks |
| `src/features/commission/rule.logic.ts`, `CommissionRulesCard.tsx`, `BookingCommissionCard.tsx` | Campo e coluna "Antecipação paga por" |
| `docs/specs/antecipacao-do-parceiro.md`, `docs/specs/README.md`, `docs/specs/payment-split.md` | Estado, migration no catálogo |

---

### Task 1: Estimativa da compensação (lógica pura)

**Files:**
- Create: `supabase/functions/_shared/payments/anticipation.ts`
- Test: `supabase/functions/_shared/payments/anticipation.test.ts`

**Interfaces:**
- Produces: `estimateAnticipationCompCents(args: { installments: number; partnerLegCents: number; partnerMdrCents: number; monthlyRateBps: number; marginDays: number }): number` e `anticipationFeesByRecipient(payables: GatewayPayable[], moveparkRecipientId: string): { partnerCents: number; moveparkCents: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/payments/anticipation.test.ts
import { assertEquals } from "jsr:@std/assert";
import { anticipationFeesByRecipient, estimateAnticipationCompCents } from "./anticipation.ts";

const base = { partnerMdrCents: 0, monthlyRateBps: 310, marginDays: 4 };

Deno.test("3x de R$ 120 com 3,1% ao mês: compensação de R$ 4,37 (exemplo da spec)", () => {
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 }), 437);
});

Deno.test("à vista: só a margem de dias", () => {
  // f = 0,031/30 × 4 = 0,4133%; δ = ceil(10000 × f / (1 − f)) = 42
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 1, partnerLegCents: 10000 }), 42);
});

Deno.test("MDR na perna do parceiro sai da base antecipada", () => {
  const sem = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 });
  const com = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000, partnerMdrCents: 1000 });
  assertEquals(com < sem, true);
});

Deno.test("entrada inválida devolve zero (nunca compensação negativa)", () => {
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 0, partnerLegCents: 12000 }), 0);
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 0 }), 0);
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000, monthlyRateBps: 0 }), 0);
});

Deno.test("12x cresce com o número de parcelas", () => {
  const tres = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 });
  const doze = estimateAnticipationCompCents({ ...base, installments: 12, partnerLegCents: 12000 });
  assertEquals(doze > tres, true);
});

Deno.test("taxa real por perna: soma só recebíveis de crédito", () => {
  const p = (recipientId: string, ant: number, type = "credit") => ({
    id: null, chargeId: null, recipientId, amountCents: 1000, feeCents: 0, anticipationFeeCents: ant,
    fraudCoverageFeeCents: 0, type, status: "paid", installment: 1, paymentDate: null,
  });
  assertEquals(
    anticipationFeesByRecipient([p("re_mp", 2), p("re_mp", 19), p("re_parc", 55), p("re_parc", -55, "refund")], "re_mp"),
    { partnerCents: 55, moveparkCents: 21 },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/anticipation.test.ts`
Expected: FAIL com "Module not found" para `./anticipation.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/_shared/payments/anticipation.ts
// Antecipação do cartão do parceiro (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
//
// A Pagar.me desconta a taxa de antecipação do recebedor antecipado e o split não tem campo para
// mudar isso. Quando quem paga é a Movepark, a perna do parceiro recebe a estimativa a mais, com
// folga de dias, para ele nunca terminar abaixo do prometido. O que a estimativa não cobrir vira
// crédito na releitura (reconcile-gateway-fees).

import type { GatewayPayable } from "./types.ts";

export type AnticipationEstimateArgs = {
  installments: number;
  /** Perna do parceiro no split, em centavos. */
  partnerLegCents: number;
  /** MDR descontado da perna do parceiro (zero quando a Movepark paga o MDR). */
  partnerMdrCents: number;
  /** Taxa mensal de antecipação em basis points (310 = 3,10% ao mês). */
  monthlyRateBps: number;
  /** Folga em dias somada a cada parcela. */
  marginDays: number;
};

/**
 * δ tal que (L + δ − m) × (1 − f) ≥ L − m, com f = taxa/30 × média dos dias antecipados.
 * A parcela i (1..n) é antecipada por volta de 30 × (i − 1) dias, mais a folga.
 */
export function estimateAnticipationCompCents(a: AnticipationEstimateArgs): number {
  const n = Math.floor(a.installments);
  const net = Math.floor(a.partnerLegCents) - Math.max(0, Math.floor(a.partnerMdrCents));
  if (n < 1 || net <= 0 || a.monthlyRateBps <= 0) return 0;
  let sumDays = 0;
  for (let i = 1; i <= n; i++) sumDays += 30 * (i - 1) + Math.max(0, a.marginDays);
  const f = (a.monthlyRateBps / 10000 / 30) * (sumDays / n);
  if (f <= 0 || f >= 1) return 0;
  return Math.ceil((net * f) / (1 - f) - 1e-9);
}

/** Taxa de antecipação real por perna, só dos recebíveis de crédito (a venda). */
export function anticipationFeesByRecipient(
  payables: GatewayPayable[],
  moveparkRecipientId: string,
): { partnerCents: number; moveparkCents: number } {
  let partnerCents = 0;
  let moveparkCents = 0;
  for (const p of payables) {
    if (p.type && p.type !== "credit") continue;
    const fee = Math.max(0, p.anticipationFeeCents ?? 0);
    if (p.recipientId === moveparkRecipientId) moveparkCents += fee;
    else partnerCents += fee;
  }
  return { partnerCents, moveparkCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/anticipation.test.ts`
Expected: PASS, 6 testes. Se o caso "R$ 4,37" der 436 ou 438, confira a conta: Σd = 4 + 34 + 64 = 102; f = 0,031/30 × 34 = 0,0351333; 12000 × f / (1 − f) = 436,95 → 437.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/payments/anticipation.ts supabase/functions/_shared/payments/anticipation.test.ts
git commit -m "feat(antecipacao): estimativa da compensação no split (E0.3.14)"
```

---

### Task 2: Compensação no split que vai ao gateway

**Files:**
- Modify: `supabase/functions/_shared/payments/split.ts` (fim de `splitForGateway`, depois do crédito)
- Test: `supabase/functions/_shared/payments/split.test.ts`

**Interfaces:**
- Consumes: nada da Task 1 (o valor chega pronto).
- Produces: `appliedAnticipationCompCents(rules: SplitRule[], debtRecoveryCents: number, feeCreditCents: number, compCents: number): number` e `splitForGateway(rules, debtRecoveryCents, moveparkRecipientId, feeCreditCents = 0, anticipationCompCents = 0)`.

- [ ] **Step 1: Write the failing test** (acrescente ao fim de `split.test.ts` e importe `appliedAnticipationCompCents`)

```ts
Deno.test("compensação de antecipação: perna da Movepark cede ao parceiro, total intacto", () => {
  const rules = buildSplit({ chargedCents: 15000, baseCents: 15000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p", method: "card" });
  const out = splitForGateway(rules, 0, "re_mp", 0, 437)!;
  assertEquals(partnerRule(out)!.amount, 12000 + 437);
  assertEquals(out.reduce((a, r) => a + r.amount, 0), 15000);
});

Deno.test("compensação vem depois do crédito e respeita o piso de R$ 1,00", () => {
  const rules = buildSplit({ chargedCents: 15000, baseCents: 15000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p", method: "card" });
  // perna Movepark 3000; crédito 2500 deixa 500; piso 100 → cabem 400 de compensação
  assertEquals(appliedAnticipationCompCents(rules, 0, 2500, 437), 400);
  const out = splitForGateway(rules, 0, "re_mp", 2500, 437)!;
  assertEquals(out.find((r) => r.role === "movepark")!.amount, 100);
});

Deno.test("sem compensação o split é o mesmo de antes", () => {
  const rules = buildSplit({ chargedCents: 15000, baseCents: 15000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p", method: "card" });
  assertEquals(splitForGateway(rules, 0, "re_mp", 0, 0), splitForGateway(rules, 0, "re_mp", 0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/split.test.ts`
Expected: FAIL, `appliedAnticipationCompCents` não exportado.

- [ ] **Step 3: Write minimal implementation** (substitua `splitForGateway` inteiro e acrescente a função nova logo acima dele)

```ts
/**
 * Quanto da compensação de antecipação (E0.3.14) cabe nesta venda: o que sobra da perna da
 * Movepark depois do abatimento e do crédito da taxa, respeitando o piso. O resto vira crédito.
 */
export function appliedAnticipationCompCents(
  rules: SplitRule[],
  debtRecoveryCents: number,
  feeCreditCents: number,
  compCents: number,
): number {
  const comp = Math.max(0, Math.floor(compCents || 0));
  if (comp === 0) return 0;
  let after: SplitRule[] | undefined;
  try {
    after = splitAfterDebt(rules, debtRecoveryCents, null);
  } catch {
    return 0;
  }
  if (!after) return 0;
  const partner = partnerRule(after);
  const movepark = after.find((r) => r !== partner);
  if (!movepark) return 0;
  const credit = appliedFeeCreditCents(rules, debtRecoveryCents, feeCreditCents);
  return Math.max(0, Math.min(comp, movepark.amount - credit - MOVEPARK_LEG_FLOOR_CENTS));
}

/**
 * O que VAI ao gateway: perna do parceiro menos abatimento de dívida (E0.3.5), MAIS o crédito da
 * taxa do repasse automático (E0.3.13), MAIS a compensação da antecipação paga pela Movepark
 * (E0.3.14). Total intacto.
 */
export function splitForGateway(
  rules: SplitRule[],
  debtRecoveryCents: number,
  moveparkRecipientId: string | null,
  feeCreditCents = 0,
  anticipationCompCents = 0,
): SplitRule[] | undefined {
  const base = splitAfterDebt(rules, debtRecoveryCents, moveparkRecipientId);
  const applied =
    appliedFeeCreditCents(rules, debtRecoveryCents, feeCreditCents) +
    appliedAnticipationCompCents(rules, debtRecoveryCents, feeCreditCents, anticipationCompCents);
  if (!base || applied === 0) return base;
  const partner = partnerRule(base);
  const movepark = base.find((r) => r !== partner);
  if (!partner || !movepark) return base;
  const out = base.map((r) =>
    r === partner ? { ...r, amount: r.amount + applied } : { ...r, amount: r.amount - applied },
  );
  const total = rules.reduce((a, r) => a + r.amount, 0);
  const soma = out.reduce((a, r) => a + r.amount, 0);
  if (soma !== total) throw new Error(`Split com crédito não fecha: soma ${soma} != total ${total}.`);
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/`
Expected: PASS (os testes antigos do split também).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/payments/split.ts supabase/functions/_shared/payments/split.test.ts
git commit -m "feat(antecipacao): compensação da antecipação no split do gateway"
```

---

### Task 3: Gateway, antecipação pontual e configuração do recebedor

**Files:**
- Modify: `supabase/functions/_shared/payments/types.ts` (tipos novos + 4 métodos na interface)
- Modify: `supabase/functions/_shared/payments/pagarme.ts` (builders + métodos)
- Modify: `supabase/functions/_shared/payments/mock.ts`
- Test: `supabase/functions/_shared/payments/pagarme.test.ts`

**Interfaces:**
- Produces (em `types.ts`):

```ts
/** Antecipação pontual (bulk_anticipations) ou automática, normalizada. */
export interface AnticipationResult {
  id: string | null;
  status: string | null; // pending | pre_approved | approved | refused | canceled
  type: string | null; // spot | automatic
  amountCents: number | null;
  anticipationFeeCents: number | null;
  feeCents: number | null;
  paymentDate: string | null;
  timeframe: string | null;
  raw: unknown;
  httpStatus: number | null;
}
export interface AnticipationLimits {
  maxAmountCents: number | null;
  maxAnticipationFeeCents: number | null;
  raw: unknown;
  httpStatus: number | null;
}
export interface AnticipationRequest {
  recipientId: string;
  requestedCents: number;
  timeframe: "start" | "end";
  paymentDate?: string; // ISO yyyy-mm-dd; ausente = próximo dia útil (o gateway decide)
}
```

e na `PaymentGateway`:

```ts
  /** Máximo antecipável agora (GET bulk_anticipations/limits). */
  getAnticipationLimits(recipientId: string): Promise<AnticipationLimits>;
  /** Simula uma antecipação pontual sem criar (POST bulk_anticipations/simulate). */
  simulateAnticipation(input: AnticipationRequest): Promise<AnticipationResult>;
  /** Cria a antecipação pontual (POST bulk_anticipations). */
  createAnticipation(input: AnticipationRequest): Promise<AnticipationResult>;
  /** Lista as antecipações do recebedor (para conciliar status). */
  listAnticipations(recipientId: string): Promise<AnticipationResult[]>;
```

e `RecipientResult` ganha `anticipationSettings: AnticipationSettings | null` (lido de `automatic_anticipation_settings` na resposta do `GET /recipients/{id}`).

- [ ] **Step 1: Write the failing test** (em `pagarme.test.ts`)

```ts
import { buildAnticipationLimits, buildAnticipationResult, readAnticipationSettings } from "./pagarme.ts";

Deno.test("antecipação pontual: normaliza a resposta da Pagar.me", () => {
  const r = buildAnticipationResult(200, {
    id: "ba_1", status: "approved", amount: 100000, fee: 5000, anticipation_fee: 3000,
    type: "spot", timeframe: "start", payment_date: "2026-11-16T00:00:00.000Z",
  });
  assertEquals(r.id, "ba_1");
  assertEquals(r.anticipationFeeCents, 3000);
  assertEquals(r.paymentDate, "2026-11-16T00:00:00.000Z");
});

Deno.test("limites: lê só o máximo (o mínimo foi descontinuado)", () => {
  const l = buildAnticipationLimits(200, { maximum: { amount: 79652, anticipation_fee: 2953, fee: 0 } });
  assertEquals(l.maxAmountCents, 79652);
  assertEquals(l.maxAnticipationFeeCents, 2953);
});

Deno.test("configuração do recebedor: enabled/type/volume/delay", () => {
  assertEquals(
    readAnticipationSettings({ automatic_anticipation_settings: { enabled: false, type: "full", volume_percentage: 0, delay: 365 } }),
    { enabled: false, type: "full", volumePercentage: 0, delay: 365, days: null },
  );
  assertEquals(readAnticipationSettings({}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/pagarme.test.ts`
Expected: FAIL, funções não exportadas.

- [ ] **Step 3: Implement** (em `pagarme.ts`, perto de `buildPayablesResult`; e use `readAnticipationSettings(body)` dentro de `buildRecipientResult` para preencher `anticipationSettings`)

```ts
// ── Antecipação (E0.3.14) ───────────────────────────────────────────────────

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function buildAnticipationResult(httpStatus: number, body: unknown): AnticipationResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    id: strOrNull(b.id),
    status: strOrNull(b.status),
    type: strOrNull(b.type),
    amountCents: numOrNull(b.amount),
    anticipationFeeCents: numOrNull(b.anticipation_fee),
    feeCents: numOrNull(b.fee),
    paymentDate: strOrNull(b.payment_date),
    timeframe: strOrNull(b.timeframe),
    raw: body,
    httpStatus,
  };
}

export function buildAnticipationLimits(httpStatus: number, body: unknown): AnticipationLimits {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const max = (b.maximum && typeof b.maximum === "object" ? b.maximum : {}) as Record<string, unknown>;
  return { maxAmountCents: numOrNull(max.amount), maxAnticipationFeeCents: numOrNull(max.anticipation_fee), raw: body, httpStatus };
}

export function readAnticipationSettings(body: unknown): AnticipationSettings | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = b.automatic_anticipation_settings as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return null;
  const days = Array.isArray(s.days) ? (s.days as unknown[]).filter((d): d is number => typeof d === "number") : null;
  return {
    enabled: s.enabled === true || s.enabled === "true",
    type: strOrNull(s.type) ?? "full",
    volumePercentage: Number(s.volume_percentage ?? 0) || 0,
    delay: s.delay == null || s.delay === "null" ? null : Number(s.delay),
    days: days && days.length ? days : null,
  };
}
```

Métodos na classe `PagarmeGateway` (perto de `listPayables`):

```ts
  async getAnticipationLimits(recipientId: string): Promise<AnticipationLimits> {
    const { httpStatus, parsed } = await this.rawFetch(
      "GET",
      `/recipients/${encodeURIComponent(recipientId)}/bulk_anticipations/limits`,
    );
    return buildAnticipationLimits(httpStatus, parsed);
  }

  async simulateAnticipation(input: AnticipationRequest): Promise<AnticipationResult> {
    const { httpStatus, parsed } = await this.rawFetch(
      "POST",
      `/recipients/${encodeURIComponent(input.recipientId)}/bulk_anticipations/simulate`,
      { timeframe: input.timeframe, requested_amount: input.requestedCents },
    );
    return buildAnticipationResult(httpStatus, parsed);
  }

  async createAnticipation(input: AnticipationRequest): Promise<AnticipationResult> {
    const body: Record<string, unknown> = {
      timeframe: input.timeframe,
      requested_amount: input.requestedCents,
      automatic_transfer: false,
    };
    if (input.paymentDate) body.payment_date = input.paymentDate;
    const { httpStatus, parsed } = await this.rawFetch(
      "POST",
      `/recipients/${encodeURIComponent(input.recipientId)}/bulk_anticipations`,
      body,
    );
    return buildAnticipationResult(httpStatus, parsed);
  }

  async listAnticipations(recipientId: string): Promise<AnticipationResult[]> {
    const { httpStatus, parsed } = await this.rawFetch(
      "GET",
      `/recipients/${encodeURIComponent(recipientId)}/bulk_anticipations?size=100`,
    );
    const b = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const rows = Array.isArray(b.data) ? (b.data as unknown[]) : [];
    return rows.map((r) => buildAnticipationResult(httpStatus, r));
  }
```

`createAnticipation` exige `payment_date` na doc; se o G1/G3 mostrar que sem ela o gateway recusa, a Edge (Task 5) passa o próximo dia útil calculado em `logic.ts`.

Mock (`mock.ts`): `getAnticipationLimits` devolve `{ maxAmountCents: 0, maxAnticipationFeeCents: 0, raw: { mock: true }, httpStatus: 200 }`; `simulateAnticipation`/`createAnticipation` devolvem `status: "approved"`, `anticipationFeeCents: 0`, `amountCents: input.requestedCents`, `id: "mock_ba"`; `listAnticipations` devolve `[]`; `getRecipient` preenche `anticipationSettings: null`.

- [ ] **Step 4: Run tests + typecheck das Edges**

Run: `bun run test:edge`
Expected: PASS. Qualquer implementação de `PaymentGateway` que falte método aparece como erro no `deno check` (rode `deno check supabase/functions/_shared/payments/index.ts`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/payments/
git commit -m "feat(antecipacao): antecipação pontual e leitura da configuração no adapter Pagar.me"
```

---

### Task 4: Migration e pgTAP

**Files:**
- Create: `supabase/migrations/20261203150000_antecipacao_do_parceiro.sql`
- Create: `supabase/tests/antecipacao_do_parceiro.test.sql`
- Modify: `supabase/tests/company_column_privileges.test.sql` (lista de colunas de `authenticated` ganha `anticipation_fee_payer`)
- Modify: `src/features/companies/api.ts` (`COMPANY_COLUMNS` ganha `, anticipation_fee_payer`)

**Interfaces:**
- Produces: colunas `company.anticipation_fee_payer`, `commission_rule.anticipation_fee_payer`, `booking.commission_anticipation_payer`, `payment.anticipation_comp_cents`, `payment.anticipation_credit_cents` (int not null default 0), `payment.anticipation_fee_partner_cents`, `payment.anticipation_fee_movepark_cents`, `payment.anticipation_reread_at`; tabela `payout_anticipation`; `resolve_commission`/`booking_apply_commission`/`admin_set_booking_commission` devolvendo `anticipation_payer`; RPC `set_company_anticipation(p_company_id uuid, p_fee_payer text) returns jsonb`; `payout_fee_credit_cents` somando antecipação; RPC `recipient_anticipation_expected_key()` (Vault).

- [ ] **Step 1: Write the failing pgTAP** (`supabase/tests/antecipacao_do_parceiro.test.sql`; fixture no mesmo molde de `parcelamento_por_regra.test.sql`, com empresas `a`/`b`, unidade `la`, cliente e hub_admin)

```sql
-- pgTAP: antecipação do cartão do parceiro (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
begin;
select plan(12);

do $$
declare
  cust uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  a uuid := gen_random_uuid(); la uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ant-cust@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','ant-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do update set role = 'customer';
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.company(id, name, slug, take_rate_bps) values (a, 'Ant A', 'ant-a', 2000);
  insert into public.location(id, company_id, name, slug) values (la, a, 'Ant Loc A', 'ant-loc-a');
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.a', a::text, false);
end $$;

-- 1-2 padrão do Hub é Movepark; empresa sobrepõe
select is((public.resolve_commission(current_setting('test.a')::uuid, 'web', null, null) ->> 'anticipation_payer'),
  'movepark', 'sem regra e sem padrão da empresa: Movepark paga a antecipação');
update public.company set anticipation_fee_payer = 'partner' where id = current_setting('test.a')::uuid;
select is((public.resolve_commission(current_setting('test.a')::uuid, 'web', null, null) ->> 'anticipation_payer'),
  'partner', 'padrão da empresa vale sem regra');

-- 3 regra vence a empresa
insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer, anticipation_fee_payer)
  values (current_setting('test.a')::uuid, 'Site Ant', array['ant'], 1000, 'movepark', 'each', 'movepark');
select is((public.resolve_commission(current_setting('test.a')::uuid, 'web', 'ant', now()) ->> 'anticipation_payer'),
  'movepark', 'regra vence a empresa');

-- 4 regra sem pagador herda a empresa
update public.commission_rule set anticipation_fee_payer = null where name = 'Site Ant';
select is((public.resolve_commission(current_setting('test.a')::uuid, 'web', 'ant', now()) ->> 'anticipation_payer'),
  'partner', 'regra sem pagador herda a empresa');

-- 5 CHECK
select throws_ok(format($$ update public.company set anticipation_fee_payer = 'cliente' where id = %L $$, current_setting('test.a')),
  '23514', null, 'pagador fora de movepark/partner é recusado');

-- 6-7 RPC só hub_admin
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(format($$ select public.set_company_anticipation(%L, 'movepark') $$, current_setting('test.a')),
  '42501', null, 'cliente não define o pagador');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((public.set_company_anticipation(current_setting('test.a')::uuid, null) ->> 'anticipation_fee_payer'),
  null, 'hub_admin volta a herdar');
reset role;

-- 8 congelamento na reserva + trava do PATCH do cliente
do $$
declare bk uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, location_id, user_id, status, total_amount, check_in_at, check_out_at)
    values (bk, 'MP-ANT001', current_setting('test.la', true)::uuid, current_setting('test.cust')::uuid, 'pending', 100, now() + interval '2 days', now() + interval '4 days');
  perform public.booking_apply_commission(bk);
  perform set_config('test.bk', bk::text, false);
end $$;
select is((select commission_anticipation_payer from public.booking where id = current_setting('test.bk')::uuid),
  'movepark', 'pagador congelado na reserva');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(format($$ update public.booking set commission_anticipation_payer = 'partner' where id = %L $$, current_setting('test.bk')),
  '42501', null, 'cliente não muda o pagador da reserva');
reset role;

-- 10-11 crédito: pontual paga pela Movepark e falta da releitura entram como gerado
insert into public.payout_anticipation(company_id, provider, external_id, requested_cents, anticipation_fee_cents, status, fee_borne_by)
  values (current_setting('test.a')::uuid, 'pagarme', 'ba_test1', 10000, 300, 'approved', 'movepark'),
         (current_setting('test.a')::uuid, 'pagarme', 'ba_test2', 10000, 999, 'approved', 'partner');
select is(public.payout_fee_credit_cents(current_setting('test.a')::uuid), 300::bigint,
  'pontual da Movepark vira crédito; a do parceiro não');
select throws_ok($$ insert into public.payout_anticipation(company_id, provider, external_id, requested_cents, status, fee_borne_by)
  values (current_setting('test.a')::uuid, 'pagarme', 'ba_test1', 1, 'pending', 'movepark') $$,
  '23505', null, 'uma linha por antecipação (idempotência por external_id)');

-- 12 RLS: cliente não lê payout_anticipation
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select is((select count(*) from public.payout_anticipation)::int, 0, 'cliente não vê antecipações');
reset role;

select * from finish();
rollback;
```

Ajuste os campos obrigatórios do `insert into public.booking` ao schema vivo (confira com `select column_name, is_nullable, column_default from information_schema.columns where table_name='booking' and is_nullable='NO' and column_default is null`); se faltar coluna, copie o insert de reserva de `supabase/tests/parcelamento_por_regra.test.sql`. Passe `test.la` no `do $$` da fixture.

- [ ] **Step 2: Rode no vivo e veja falhar**

Monte `tap.sh` no scratchpad pela receita da memória `project_migrations_via_mcp_not_dbpush` (`begin; create extension if not exists pgtap;` + corpo sem `begin/rollback/finish` + temp table `_tap` + `raise exception` com o TAP). Run: `supabase db query --linked -f <arquivo>`.
Expected: erro "column anticipation_payer/anticipation_fee_payer does not exist".

- [ ] **Step 3: Write the migration** (`supabase/migrations/20261203150000_antecipacao_do_parceiro.sql`)

```sql
-- Antecipação do cartão do parceiro (E0.3.14, 13/11/2026). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- A Pagar.me antecipa por recebedor e desconta a taxa do recebedor antecipado; o split não tem
-- campo para isso. Decisões do Kallef: quem paga é configurável (empresa e regra de origem),
-- Movepark por padrão, congelado na reserva; a Movepark paga mandando a estimativa a mais no split,
-- e toda taxa dela que cair no estacionamento vira crédito. As condições comerciais NÃO entram aqui
-- (repo público): a taxa de antecipação é gravada direto em app_setting.

-- ── 1. Configuração ──────────────────────────────────────────────────────────
insert into public.app_setting(key, value) values
  ('commission_default_anticipation_payer', 'movepark'),
  ('card_anticipation_margin_days', '4'),
  ('card_anticipation_rate_monthly_bps', '')
on conflict (key) do nothing;

alter table public.company add column if not exists anticipation_fee_payer text
  check (anticipation_fee_payer in ('movepark', 'partner'));
grant select (anticipation_fee_payer) on public.company to authenticated;
comment on column public.company.anticipation_fee_payer is
  'Quem paga a antecipação da parte do parceiro nas vendas sem regra. Nulo = commission_default_anticipation_payer.';

alter table public.commission_rule add column if not exists anticipation_fee_payer text
  check (anticipation_fee_payer in ('movepark', 'partner'));
comment on column public.commission_rule.anticipation_fee_payer is
  'Quem paga a antecipação nesta origem. Nulo = herda a empresa.';

alter table public.booking add column if not exists commission_anticipation_payer text
  check (commission_anticipation_payer in ('movepark', 'partner'));
comment on column public.booking.commission_anticipation_payer is
  'Pagador da antecipação congelado na reserva (regra > empresa > padrão). Nulo = movepark.';

alter table public.payment
  add column if not exists anticipation_comp_cents integer,
  add column if not exists anticipation_credit_cents integer not null default 0,
  add column if not exists anticipation_fee_partner_cents integer,
  add column if not exists anticipation_fee_movepark_cents integer,
  add column if not exists anticipation_reread_at timestamptz;
comment on column public.payment.anticipation_comp_cents is
  'Quanto a perna da Movepark cedeu ao parceiro na cobrança para cobrir a antecipação (E0.3.14).';
comment on column public.payment.anticipation_credit_cents is
  'Taxa de antecipação da Movepark que caiu no parceiro e vira crédito: o que não coube no split mais a falta medida na releitura.';

create index if not exists payment_anticipation_reread_idx on public.payment (paid_at)
  where provider = 'pagarme' and method = 'card' and status = 'paid' and anticipation_reread_at is null;

-- ── 2. Antecipação pontual ───────────────────────────────────────────────────
create table if not exists public.payout_anticipation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id),
  provider text not null default 'pagarme',
  external_id text,
  requested_cents bigint not null check (requested_cents > 0),
  amount_cents bigint,
  anticipation_fee_cents bigint,
  fee_cents bigint,
  timeframe text not null default 'start' check (timeframe in ('start', 'end')),
  status text not null check (status in ('pending', 'pre_approved', 'approved', 'refused', 'canceled')),
  fee_borne_by text not null check (fee_borne_by in ('movepark', 'partner')),
  payment_date timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists payout_anticipation_external_uq
  on public.payout_anticipation (provider, external_id) where external_id is not null;
create trigger payout_anticipation_set_updated_at before update on public.payout_anticipation
  for each row execute function public.set_updated_at();
alter table public.payout_anticipation enable row level security;
create policy payout_anticipation_admin_all on public.payout_anticipation
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
revoke all on public.payout_anticipation from anon;

-- ── 3. Resolução, congelamento, correção e guarda ────────────────────────────
-- Recrie as quatro funções a partir de 20261201232000_parcelamento_por_regra.sql, copiando o corpo
-- inteiro e fazendo SÓ estas mudanças:
--   resolve_commission: v_co também lê c.anticipation_fee_payer; o jsonb da regra ganha
--     'anticipation_payer', coalesce(v_rule.anticipation_fee_payer, v_co.anticipation_fee_payer,
--       <padrão>), e o do Hub ganha 'anticipation_payer', coalesce(v_co.anticipation_fee_payer, <padrão>),
--     com <padrão> = coalesce((select nullif(trim(value), '') from public.app_setting
--       where key = 'commission_default_anticipation_payer'), 'movepark').
--   booking_apply_commission: o select de v_b ganha b.commission_anticipation_payer; o retorno do
--     ramo travado ganha 'anticipation_payer', v_b.commission_anticipation_payer; o update ganha
--     commission_anticipation_payer = v_pkg ->> 'anticipation_payer'.
--   admin_set_booking_commission: v_from ganha 'anticipation_payer'; v_co lê anticipation_fee_payer;
--     os dois v_to ganham 'anticipation_payer' com a mesma regra do resolve; o update grava a coluna.
--   booking_guard_commission: a tupla comparada ganha commission_anticipation_payer (new e old).

-- ── 4. Padrão da empresa: só hub_admin grava ─────────────────────────────────
create or replace function public.set_company_anticipation(p_company_id uuid, p_fee_payer text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_row record;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark define quem paga a antecipação.' using errcode = '42501';
  end if;
  if p_fee_payer is not null and p_fee_payer not in ('movepark', 'partner') then
    raise exception 'Quem paga a antecipação é movepark ou partner.' using errcode = '22023';
  end if;
  update public.company set anticipation_fee_payer = p_fee_payer
   where id = p_company_id and deleted_at is null
  returning id, anticipation_fee_payer into v_row;
  if v_row.id is null then raise exception 'Empresa não encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', v_row.id, 'anticipation_fee_payer', v_row.anticipation_fee_payer);
end $function$;
revoke all on function public.set_company_anticipation(uuid, text) from public, anon, authenticated;
grant execute on function public.set_company_anticipation(uuid, text) to authenticated, service_role;

-- ── 5. Crédito generalizado ──────────────────────────────────────────────────
-- Recrie payout_fee_credit_cents de 20261127090000_repasse_automatico_mensal.sql trocando o CTE
-- `gerada` por:
--   gerada as (
--     select (
--       coalesce((select sum(w.fee_cents) from public.payout_withdrawal w
--                  where w.company_id = p_company_id and w.provider = p_provider and w.deleted_at is null
--                    and w.fee_borne_by = 'movepark' and w.status in ('created', 'processing', 'paid')), 0)
--     + coalesce((select sum(a.anticipation_fee_cents) from public.payout_anticipation a
--                  where a.company_id = p_company_id and a.provider = p_provider and a.deleted_at is null
--                    and a.fee_borne_by = 'movepark' and a.status = 'approved'), 0)
--     + coalesce((select sum(p.anticipation_credit_cents) from public.payment p
--                  join public.booking b on b.id = p.booking_id
--                  join public.location l on l.id = b.location_id
--                  where p.provider = p_provider and l.company_id = p_company_id
--                    and p.status in ('paid', 'refunded')), 0)
--     )::bigint as cents
--   ),
-- e mantendo o resto (devolvida, reservada, greatest) e os grants iguais.

-- ── 6. Chave interna da Edge recipient-anticipation (cron de status) ─────────
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'recipient_anticipation_key',
  'Chave interna da Edge recipient-anticipation (cron envia no header; Edge lê via RPC).'
);
create or replace function public.recipient_anticipation_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'recipient_anticipation_key' limit 1;
$$;
revoke all on function public.recipient_anticipation_expected_key() from public, anon, authenticated;
grant execute on function public.recipient_anticipation_expected_key() to service_role;
```

Os blocos 3 e 5 são `create or replace` com o corpo COMPLETO no arquivo (não comentários): o executor copia as funções do arquivo citado e aplica só as mudanças listadas. Antes de copiar, confirme que a definição viva é a mesma do arquivo: `supabase db query --linked "select pg_get_functiondef('public.resolve_commission(uuid,text,text,timestamptz,timestamptz)'::regprocedure)"` (idem para as outras três e `payout_fee_credit_cents(uuid,text)`); se diferir, parta da viva.

- [ ] **Step 4: Rode o pgTAP com a migration na mesma transação**

Monte o arquivo: `begin; create extension if not exists pgtap;` + migration + corpo do teste + `raise exception` com o TAP. Run: `supabase db query --linked -f <arquivo>`.
Expected: `ok 1` a `ok 12`. Rode também `parcelamento_por_regra.test.sql`, `commission_rule.test.sql`, `payout_auto.test.sql` e `company_column_privileges.test.sql` com a migration na frente: tudo `ok` (falha que acontece também SEM a migration é dado do vivo, não regressão).

- [ ] **Step 5: Aplicar, tipos e commit**

Aplique com `mcp__1f1d7cd0-403f-485f-8f09-f96e49482b16__apply_migration` (name `antecipacao_do_parceiro`). Depois `bun run gen:types` e leia o diff: mantenha só o que esta migration acrescenta. Grave a taxa medida direto no banco (não em migration): `update public.app_setting set value = '310' where key = 'card_anticipation_rate_monthly_bps';`.

```bash
git add supabase/migrations/20261203150000_antecipacao_do_parceiro.sql supabase/tests/antecipacao_do_parceiro.test.sql supabase/tests/company_column_privileges.test.sql src/features/companies/api.ts src/types/database.ts
git commit -m "feat(antecipacao): pagador no pacote de comissão, antecipação pontual e crédito generalizado"
git push origin main
```

---

### Task 5: Edge `recipient-anticipation`

**Files:**
- Create: `supabase/functions/recipient-anticipation/logic.ts`
- Create: `supabase/functions/recipient-anticipation/index.ts`
- Test: `supabase/functions/recipient-anticipation/index.test.ts`
- Modify: `supabase/config.toml` (`[functions.recipient-anticipation] verify_jwt = false`)

**Interfaces:**
- Consumes: `getGateway("pagarme")` com os métodos da Task 3; tabela `payout_anticipation` e RPC `recipient_anticipation_expected_key` da Task 4.
- Produces: `POST /functions/v1/recipient-anticipation` com `{ action: "settings", recipient: "master" | <company_id> }` → `{ settings }`; `{ action: "limits", company_id }` → `{ max_amount_cents, max_anticipation_fee_cents }`; `{ action: "simulate", company_id, requested_cents, timeframe }` → `{ amount_cents, anticipation_fee_cents, payment_date }`; `{ action: "create", company_id, requested_cents, timeframe }` → `{ id, status, anticipation_fee_cents }`; `{ action: "sync" }` (só pela chave do Vault) → `{ checked, updated }`.
- `logic.ts` exporta `parseAnticipationInput(body: unknown): { input: AnticipationInput | null; error?: string }` e `feeBorneBy(companyPayer: string | null, defaultPayer: string | null): "movepark" | "partner"`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/recipient-anticipation/index.test.ts
import { assertEquals } from "jsr:@std/assert";
import { feeBorneBy, parseAnticipationInput } from "./logic.ts";

Deno.test("ações válidas", () => {
  assertEquals(parseAnticipationInput({ action: "limits", company_id: "c1" }).input?.action, "limits");
  assertEquals(parseAnticipationInput({ action: "settings", recipient: "master" }).input?.recipient, "master");
  assertEquals(parseAnticipationInput({ action: "sync" }).input?.action, "sync");
});

Deno.test("simular e criar exigem valor inteiro positivo e timeframe start/end", () => {
  assertEquals(parseAnticipationInput({ action: "simulate", company_id: "c1", requested_cents: 0, timeframe: "start" }).input, null);
  assertEquals(parseAnticipationInput({ action: "create", company_id: "c1", requested_cents: 1000, timeframe: "meio" }).input, null);
  assertEquals(parseAnticipationInput({ action: "create", company_id: "c1", requested_cents: 1000, timeframe: "end" }).input?.requestedCents, 1000);
});

Deno.test("ação desconhecida e corpo vazio são recusados", () => {
  assertEquals(parseAnticipationInput({ action: "apagar" }).input, null);
  assertEquals(parseAnticipationInput(null).input, null);
});

Deno.test("pagador da pontual: empresa, senão padrão, senão Movepark", () => {
  assertEquals(feeBorneBy("partner", "movepark"), "partner");
  assertEquals(feeBorneBy(null, "partner"), "partner");
  assertEquals(feeBorneBy(null, null), "movepark");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/recipient-anticipation/`
Expected: FAIL, módulo `./logic.ts` ausente.

- [ ] **Step 3: Implement `logic.ts`**

```ts
// Validação pura da Edge recipient-anticipation (E0.3.14).
export type AnticipationAction = "settings" | "limits" | "simulate" | "create" | "sync";
export type AnticipationInput = {
  action: AnticipationAction;
  companyId: string | null;
  recipient: "master" | null;
  requestedCents: number | null;
  timeframe: "start" | "end";
};

const ACTIONS: AnticipationAction[] = ["settings", "limits", "simulate", "create", "sync"];

export function parseAnticipationInput(body: unknown): { input: AnticipationInput | null; error?: string } {
  if (!body || typeof body !== "object") return { input: null, error: "Corpo inválido." };
  const b = body as Record<string, unknown>;
  const action = b.action as AnticipationAction;
  if (!ACTIONS.includes(action)) return { input: null, error: "Ação inválida." };
  const companyId = typeof b.company_id === "string" && b.company_id ? b.company_id : null;
  const recipient = b.recipient === "master" ? "master" : null;
  const timeframe = b.timeframe === "end" ? "end" : b.timeframe === undefined || b.timeframe === "start" ? "start" : null;
  if (!timeframe) return { input: null, error: "timeframe é start ou end." };
  const cents = typeof b.requested_cents === "number" && Number.isInteger(b.requested_cents) ? b.requested_cents : null;
  if ((action === "limits" || action === "simulate" || action === "create") && !companyId) {
    return { input: null, error: "company_id é obrigatório." };
  }
  if (action === "settings" && !companyId && !recipient) return { input: null, error: "Informe company_id ou recipient." };
  if ((action === "simulate" || action === "create") && (!cents || cents <= 0)) {
    return { input: null, error: "requested_cents deve ser inteiro positivo." };
  }
  return { input: { action, companyId, recipient, requestedCents: cents, timeframe } };
}

export function feeBorneBy(companyPayer: string | null, defaultPayer: string | null): "movepark" | "partner" {
  const v = companyPayer ?? defaultPayer;
  return v === "partner" ? "partner" : "movepark";
}
```

- [ ] **Step 4: Implement `index.ts`**

Copie o esqueleto de `supabase/functions/reconcile-gateway-fees/index.ts` (CORS, `json`, `ehHubAdmin`, `admin` com service role) e troque o corpo por:

```ts
// Edge Function: /recipient-anticipation (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
// Antecipação pontual do recebedor de um parceiro e leitura da configuração de antecipação.
// Porta 1: JWT de hub_admin (Manager). Porta 2: header x-recipient-anticipation-key (Vault), só
// para { action: "sync" } e { action: "settings" } (gates G1 a G3 e cron de status).
// POST { action, company_id?, recipient?, requested_cents?, timeframe? }

  const { data: expected } = await admin.rpc("recipient_anticipation_expected_key");
  const pelaChave = !!expected && req.headers.get("x-recipient-anticipation-key") === expected;
  const isAdmin = !pelaChave && (await ehHubAdmin(req));
  const { input, error } = parseAnticipationInput(await req.json().catch(() => null));
  if (!input) return json({ error }, 400);
  if (!isAdmin && !(pelaChave && (input.action === "sync" || input.action === "settings"))) {
    return json({ error: "unauthorized" }, 401);
  }
  const gateway = getGateway("pagarme");

  async function recipientOf(companyId: string): Promise<string | null> {
    const { data } = await admin.from("payout_recipient").select("external_recipient_id")
      .eq("company_id", companyId).eq("provider", "pagarme").is("deleted_at", null).maybeSingle();
    return data?.external_recipient_id ?? null;
  }

  if (input.action === "settings") {
    let rid: string | null = null;
    if (input.recipient === "master") {
      const { data } = await admin.from("app_setting").select("value").eq("key", "pagarme_movepark_recipient_id").maybeSingle();
      rid = (data?.value ?? "").trim() || null;
    } else rid = await recipientOf(input.companyId!);
    if (!rid) return json({ error: "Recebedor não encontrado." }, 404);
    const r = await gateway.getRecipient(rid, { kycLink: false });
    return json({ recipient_id: rid, settings: r.anticipationSettings, http_status: r.httpStatus });
  }

  if (input.action === "sync") {
    const { data: abertas } = await admin.from("payout_anticipation")
      .select("id, company_id, external_id").in("status", ["pending", "pre_approved"]).is("deleted_at", null);
    let updated = 0;
    const porEmpresa = new Map<string, { id: string; external_id: string | null }[]>();
    for (const a of abertas ?? []) porEmpresa.set(a.company_id, [...(porEmpresa.get(a.company_id) ?? []), a]);
    for (const [companyId, lista] of porEmpresa) {
      const rid = await recipientOf(companyId);
      if (!rid) continue;
      const remotas = await gateway.listAnticipations(rid);
      for (const a of lista) {
        const r = remotas.find((x) => x.id === a.external_id);
        if (!r?.status) continue;
        await admin.from("payout_anticipation").update({
          status: r.status, amount_cents: r.amountCents, anticipation_fee_cents: r.anticipationFeeCents,
          fee_cents: r.feeCents, payment_date: r.paymentDate,
        }).eq("id", a.id);
        updated += 1;
      }
    }
    return json({ ok: true, checked: abertas?.length ?? 0, updated });
  }

  const rid = await recipientOf(input.companyId!);
  if (!rid) return json({ error: "O estacionamento não tem recebedor no gateway." }, 409);

  if (input.action === "limits") {
    const l = await gateway.getAnticipationLimits(rid);
    await logGatewayEvent(admin, { paymentId: null, bookingId: null, kind: "anticipation:limits", httpStatus: l.httpStatus, request: { recipient_id: rid }, response: l.raw, note: `máximo ${l.maxAmountCents ?? "?"} c` });
    return json({ max_amount_cents: l.maxAmountCents, max_anticipation_fee_cents: l.maxAnticipationFeeCents });
  }

  const req2 = { recipientId: rid, requestedCents: input.requestedCents!, timeframe: input.timeframe };
  if (input.action === "simulate") {
    const s = await gateway.simulateAnticipation(req2);
    await logGatewayEvent(admin, { paymentId: null, bookingId: null, kind: "anticipation:simulate", httpStatus: s.httpStatus, request: req2, response: s.raw, note: `taxa ${s.anticipationFeeCents ?? "?"} c` });
    if (!s.httpStatus || s.httpStatus >= 400) return json({ error: "A Pagar.me recusou a simulação.", detail: s.raw }, 502);
    return json({ amount_cents: s.amountCents, anticipation_fee_cents: s.anticipationFeeCents, payment_date: s.paymentDate });
  }

  // create
  const { data: co } = await admin.from("company").select("anticipation_fee_payer").eq("id", input.companyId!).maybeSingle();
  const { data: padrao } = await admin.from("app_setting").select("value").eq("key", "commission_default_anticipation_payer").maybeSingle();
  const c = await gateway.createAnticipation(req2);
  await logGatewayEvent(admin, { paymentId: null, bookingId: null, kind: "anticipation:create", httpStatus: c.httpStatus, request: req2, response: c.raw, note: `antecipação ${c.id ?? "?"} ${c.status ?? "?"}` });
  if (!c.id || !c.httpStatus || c.httpStatus >= 400) return json({ error: "A Pagar.me recusou a antecipação.", detail: c.raw }, 502);
  const { error: insErr } = await admin.from("payout_anticipation").insert({
    company_id: input.companyId, provider: "pagarme", external_id: c.id, requested_cents: input.requestedCents,
    amount_cents: c.amountCents, anticipation_fee_cents: c.anticipationFeeCents, fee_cents: c.feeCents,
    timeframe: input.timeframe, status: c.status ?? "pending", payment_date: c.paymentDate,
    fee_borne_by: feeBorneBy(co?.anticipation_fee_payer ?? null, padrao?.value ?? null),
  });
  if (insErr) console.error("[recipient-anticipation] insert falhou:", insErr.message);
  return json({ id: c.id, status: c.status, anticipation_fee_cents: c.anticipationFeeCents }, 201);
```

Antes de usar `kind: "anticipation:*"` em `logGatewayEvent`, confira se `payment_gateway_event.kind` tem `CHECK` (`select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.payment_gateway_event'::regclass`). Se tiver, acrescente os três valores no CHECK numa migration `20261203153000_evento_antecipacao.sql` dentro desta tarefa, e confira se `logGatewayEvent` aceita `paymentId: null`.

- [ ] **Step 5: Deploy e cron**

Run: `supabase functions deploy recipient-anticipation --no-verify-jwt`. Cron de status (migration `20261203154000_cron_antecipacao.sql`, mesmo molde do cron do `reconcile-gateway-fees`): `select cron.schedule('recipient-anticipation-sync', '15 14-18 * * 1-5', $$ select net.http_post(url := '<SUPABASE_URL>/functions/v1/recipient-anticipation', headers := jsonb_build_object('Content-Type','application/json','x-recipient-anticipation-key', public.recipient_anticipation_expected_key()), body := '{"action":"sync"}'::jsonb) $$);` (14h a 18h UTC = 11h a 15h BRT, janela da aprovação). Copie a URL do cron do `reconcile-gateway-fees` (`select command from cron.job where jobname like '%gateway-fees%'`).

- [ ] **Step 6: Run tests and commit**

Run: `bun run test:edge`
Expected: PASS.

```bash
git add supabase/functions/recipient-anticipation supabase/config.toml supabase/migrations/2026120315*.sql
git commit -m "feat(antecipacao): Edge recipient-anticipation (limites, simulação, criação e status)"
git push origin main
```

---

### Task 6: Gates G1 a G3 na Agência Fera

Operacional, sem código novo. Tudo pela Edge da Task 5 com a chave do Vault (`net.http_post` via `execute_sql`) ou pela `update-recipient-payout` com JWT de hub_admin. Registre cada resposta na spec, seção "Gates".

- [ ] **Step 1 (G2):** `select net.http_post(url := '<SUPABASE_URL>/functions/v1/recipient-anticipation', headers := jsonb_build_object('Content-Type','application/json','x-recipient-anticipation-key', public.recipient_anticipation_expected_key()), body := '{"action":"settings","recipient":"master"}'::jsonb);` e leia em `net._http_response`. Anote `type`, `delay`, `volume_percentage` do recebedor da Movepark.
- [ ] **Step 2 (G1):** ligue na Agência Fera (`company.name = 'Agência Fera'`) com o mesmo `type`/`delay` e `volume_percentage = 100`, chamando a Edge `update-recipient-payout` com `{ company_id, anticipation: { enabled: true, type, volume_percentage: 100, delay } }` (JWT de hub_admin gerado por `admin generate_link` para `developer@fera.ag`, nunca senha). Leia `payout_recipient_event` (kind `update`): HTTP 200 e `automatic_anticipation_settings.enabled = true` na resposta fecha o G1. Recusa da Pagar.me: pare e reporte ao Kallef o texto exato (precisa do relacionamento@pagar.me).
- [ ] **Step 3 (G3):** com o G1 aberto, a próxima venda de teste da Agência Fera no cartão (R$ 18, 3x, cartão do Kallef por ele) é relida no dia seguinte e em D+31 pelo `reconcile-gateway-fees`; recebível antigo pendente da Fera, se existir, mostra se foi antecipado. Registre.
- [ ] **Step 4:** se `delay` do master não estiver claro, use `delay = 29` (o padrão observado: tudo um dia útil antes da 1ª parcela) e anote na spec.
- [ ] **Step 5: Commit** da spec com os gates preenchidos.

```bash
git add docs/specs/antecipacao-do-parceiro.md
git commit -m "docs(spec): gates G1 a G3 da antecipação medidos na Agência Fera"
git push origin main
```

---

### Task 7: Cobrança de cartão aplica a compensação

**Files:**
- Modify: `supabase/functions/_shared/payments/commission.ts` (`anticipationPayer` no pacote)
- Modify: `supabase/functions/_shared/payments/commission.test.ts`
- Modify: `supabase/functions/create-card-charge/index.ts` (select de `payout_recipient`, app_settings, `splitForGateway`, inserts de `payment`)

**Interfaces:**
- Consumes: `estimateAnticipationCompCents` (Task 1), `appliedAnticipationCompCents`/`splitForGateway` (Task 2), `booking.commission_anticipation_payer` (Task 4).
- Produces: `CommissionPackage.anticipationPayer: "movepark" | "partner"`; `BookingCommissionColumns.commission_anticipation_payer?: string | null`; `payment.anticipation_comp_cents` e `payment.anticipation_credit_cents` gravados.

- [ ] **Step 1: Failing test** (`commission.test.ts`)

```ts
Deno.test("pagador da antecipação: gravado vale, ausente é Movepark", () => {
  const cols = { commission_channel: "hub", commission_take_rate_bps: 2000, commission_anticipation_payer: "partner" };
  assertEquals(commissionForCharge(cols, 2000).anticipationPayer, "partner");
  assertEquals(commissionForCharge({ ...cols, commission_anticipation_payer: null }, 2000).anticipationPayer, "movepark");
  assertEquals(commissionForCharge({}, 2000).anticipationPayer, "movepark");
});
```

- [ ] **Step 2:** Run `deno test ... supabase/functions/_shared/payments/commission.test.ts` → FAIL (`anticipationPayer` undefined).

- [ ] **Step 3: Implement** em `commission.ts`: acrescente `anticipationPayer: FeePayer;` ao tipo `CommissionPackage`, `commission_anticipation_payer?: string | null;` a `BookingCommissionColumns`, `anticipationPayer: "movepark"` no ramo sem pacote e `anticipationPayer: feePayer(b.commission_anticipation_payer)` no ramo gravado. Confira `columnsFromRpc` (mesmo arquivo) e acrescente `commission_anticipation_payer: o.anticipation_payer ?? null`.

- [ ] **Step 4: Edge.** Em `create-card-charge/index.ts`:
  1. o select de `payout_recipient` ganha `anticipation_enabled`;
  2. o `.in("key", [...])` dos settings ganha `"card_anticipation_rate_monthly_bps", "card_anticipation_margin_days"`;
  3. o select da reserva (procure `commission_installments_max`) ganha `commission_anticipation_payer`;
  4. logo antes de `gatewaySplit = splitForGateway(...)`:

```ts
    // 4d. Antecipação paga pela Movepark (E0.3.14): o recebedor do parceiro antecipa em 30 dias e a
    // Pagar.me desconta a taxa dele. A estimativa com folga vai a mais na perna dele; o que não
    // couber na perna da Movepark vira crédito (anticipation_credit_cents).
    const rateBps = Number(settingMap.card_anticipation_rate_monthly_bps || 0) || 0;
    const marginDays = Number(settingMap.card_anticipation_margin_days || 4) || 4;
    const partnerLeg = partnerRule(split);
    if (recipient?.anticipation_enabled && commission.anticipationPayer === "movepark" && partnerLeg && rateBps > 0) {
      anticipationCompCents = estimateAnticipationCompCents({
        installments: input.installments,
        partnerLegCents: partnerLeg.amount,
        // MDR zero de propósito: com a perna do parceiro pagando o MDR a base antecipada é menor, e
        // ignorar isso só aumenta a folga (o parceiro nunca termina abaixo do prometido).
        partnerMdrCents: 0,
        monthlyRateBps: rateBps,
        marginDays,
      });
      anticipationAppliedCents = appliedAnticipationCompCents(split, debtRecoveryCents, feeCreditCents, anticipationCompCents);
    }
```

  com `let anticipationCompCents = 0; let anticipationAppliedCents = 0;` declarados junto de `feeCreditCents`, e a chamada passando a ser `splitForGateway(split, debtRecoveryCents, moveparkRecipientId, feeCreditCents, anticipationCompCents)`. O `0.0469` é a estimativa de MDR do parcelado que já é pública no repo (o mesmo número medido em `payment-split.md`); se preferir, leia `gateway_fee_cents` médio, mas não invente constante nova.
  5. nos três inserts/updates de `payment` (failed, pending, paid; procure `fee_credit_returned_cents: feeCreditCents`) acrescente:

```ts
      anticipation_comp_cents: anticipationAppliedCents || null,
      anticipation_credit_cents: Math.max(0, anticipationCompCents - anticipationAppliedCents),
```

  e no `logGatewayEvent` da cobrança, `anticipation: { comp_cents: anticipationCompCents, applied_cents: anticipationAppliedCents }`. Nenhuma constante de taxa no código: só `card_anticipation_rate_monthly_bps` do banco.
  6. imports: `estimateAnticipationCompCents` de `../_shared/payments/anticipation.ts` e `appliedAnticipationCompCents` de `../_shared/payments/split.ts`.

- [ ] **Step 5:** `bun run test:edge` → PASS. `deno check supabase/functions/create-card-charge/index.ts` → sem erro. Deploy: `supabase functions deploy create-card-charge`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/payments/commission.ts supabase/functions/_shared/payments/commission.test.ts supabase/functions/create-card-charge/index.ts
git commit -m "feat(antecipacao): cobrança no cartão compensa a antecipação paga pela Movepark"
git push origin main
```

---

### Task 8: Releitura depois da antecipação e acerto do crédito

**Files:**
- Modify: `supabase/functions/reconcile-gateway-fees/logic.ts` (janela da releitura)
- Modify: `supabase/functions/reconcile-gateway-fees/index.ts` (segunda fase)
- Test: `supabase/functions/reconcile-gateway-fees/logic.test.ts` (ou o arquivo de teste que já existe ao lado)

**Interfaces:**
- Consumes: `anticipationFeesByRecipient` (Task 1); colunas da Task 4.
- Produces: `rereadCutoffIso(nowMs: number): string` (agora menos 31 dias) e `anticipationShortfallCents(args: { payer: "movepark" | "partner"; partnerFeeCents: number; compCents: number | null }): number`.

- [ ] **Step 1: Failing test**

```ts
import { anticipationShortfallCents, rereadCutoffIso } from "./logic.ts";

Deno.test("releitura: só cobrança paga há mais de 31 dias", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  assertEquals(rereadCutoffIso(now), "2026-10-13T12:00:00.000Z");
});

Deno.test("falta da compensação vira crédito só com pagador Movepark", () => {
  assertEquals(anticipationShortfallCents({ payer: "movepark", partnerFeeCents: 450, compCents: 437 }), 13);
  assertEquals(anticipationShortfallCents({ payer: "movepark", partnerFeeCents: 400, compCents: 437 }), 0);
  assertEquals(anticipationShortfallCents({ payer: "movepark", partnerFeeCents: 55, compCents: null }), 55);
  assertEquals(anticipationShortfallCents({ payer: "partner", partnerFeeCents: 450, compCents: null }), 0);
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** em `logic.ts`:

```ts
/** A antecipação de 30 dias acontece um dia útil antes da 1ª parcela (~D+29); 31 dias dá folga. */
export function rereadCutoffIso(nowMs: number): string {
  return new Date(nowMs - 31 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Crédito que a releitura lança (regra de 13/11/2026): toda taxa de antecipação da Movepark que
 * caiu no estacionamento e a compensação do split não cobriu.
 */
export function anticipationShortfallCents(a: { payer: "movepark" | "partner"; partnerFeeCents: number; compCents: number | null }): number {
  if (a.payer !== "movepark") return 0;
  return Math.max(0, Math.floor(a.partnerFeeCents) - Math.max(0, Math.floor(a.compCents ?? 0)));
}
```

E em `index.ts`, depois do laço atual e só na porta do cron (`pelaChave`):

```ts
  // Fase 2 (E0.3.14): releitura única depois da antecipação. A primeira leitura acontece segundos
  // depois do pagamento, antes de a Pagar.me antecipar (~D+29), e por isso não traz a taxa.
  let reread = 0;
  if (pelaChave) {
    const { data: masterRow } = await admin.from("app_setting").select("value").eq("key", "pagarme_movepark_recipient_id").maybeSingle();
    const masterId = (masterRow?.value ?? "").trim();
    const { data: antigas } = await admin
      .from("payment")
      .select("id, booking_id, provider_charge_id, anticipation_comp_cents, anticipation_credit_cents, booking:booking_id(commission_anticipation_payer)")
      .eq("provider", "pagarme").eq("method", "card").eq("status", "paid")
      .is("anticipation_reread_at", null).not("provider_charge_id", "is", null)
      .lt("paid_at", rereadCutoffIso(Date.now()))
      .order("paid_at", { ascending: true }).limit(BATCH_LIMIT);
    for (const p of antigas ?? []) {
      try {
        const result = await gateway.listPayables(p.provider_charge_id!);
        const fee = totalGatewayFeeCents(result.payables);
        const ant = anticipationFeesByRecipient(result.payables, masterId);
        const payer = (p.booking as { commission_anticipation_payer?: string } | null)?.commission_anticipation_payer === "partner" ? "partner" : "movepark";
        const falta = anticipationShortfallCents({ payer, partnerFeeCents: ant.partnerCents, compCents: p.anticipation_comp_cents });
        await logGatewayEvent(admin, { paymentId: p.id, bookingId: p.booking_id ?? null, kind: "payables", httpStatus: result.httpStatus,
          request: { charge_id: p.provider_charge_id, reread: true }, response: result.raw,
          note: `releitura · antecipação parceiro ${ant.partnerCents} c, Movepark ${ant.moveparkCents} c, crédito ${falta} c` });
        await admin.from("payment").update({
          ...(fee == null ? {} : { gateway_fee_cents: fee }),
          anticipation_fee_partner_cents: ant.partnerCents,
          anticipation_fee_movepark_cents: ant.moveparkCents,
          // Soma à parte que não coube no split na cobrança (já gravada); idempotente pela trava de reread_at.
          anticipation_credit_cents: (p.anticipation_credit_cents ?? 0) + falta,
          anticipation_reread_at: new Date().toISOString(),
        }).eq("id", p.id).is("anticipation_reread_at", null);
        reread += 1;
      } catch (e) {
        console.error("[reconcile-gateway-fees] releitura falhou em", p.provider_charge_id, e);
      }
    }
  }
  return json({ ok: true, checked: payments?.length ?? 0, updated, reread });
```

(substitua o `return` atual por este). Imports: `anticipationFeesByRecipient` de `../_shared/payments/anticipation.ts`; `rereadCutoffIso`, `anticipationShortfallCents` de `./logic.ts`. Confira se `payment_gateway_event` aceita dois `kind = 'payables'` por cobrança (não há unique; a primeira leitura já convive com outras).

- [ ] **Step 4:** `bun run test:edge` → PASS. Deploy: `supabase functions deploy reconcile-gateway-fees --no-verify-jwt`. Verifique no vivo, depois de 30 min: `select count(*) from payment where anticipation_reread_at is not null;` > 0, e as cinco vendas de 3x lidas em 13/11 com `anticipation_fee_movepark_cents` > 0 e `anticipation_credit_cents = 0` (pagador Movepark, mas parceiro não antecipado: taxa do parceiro 0, falta 0).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/reconcile-gateway-fees
git commit -m "feat(antecipacao): releitura dos recebíveis depois da antecipação e crédito da falta"
git push origin main
```

---

### Task 9: Manager, repasse da empresa e "Antecipar agora"

**Files:**
- Create: `src/features/payouts/anticipation.logic.ts` + `anticipation.logic.test.ts`
- Create: `src/features/payouts/AnticipationSection.tsx` + `AnticipationSection.test.tsx`
- Create: `src/features/payouts/AnticipateNowDialog.tsx` + `AnticipateNowDialog.test.tsx`
- Modify: `src/features/payouts/api.ts` (hooks), `src/features/payouts/PayoutSettingsDialog.tsx` (encaixe), `src/features/payouts/RecipientPanel.tsx` (botão)

**Interfaces:**
- Consumes: RPC `set_company_anticipation` (Task 4); Edges `update-recipient-payout` (existente) e `recipient-anticipation` (Task 5).
- Produces (em `api.ts`): `useCompanyAnticipation(companyId)` → `{ enabled: boolean | null, feePayer: "movepark" | "partner" | null }` (lê `payout_recipient.anticipation_enabled` e `company.anticipation_fee_payer`); `useSetCompanyAnticipation()` → `mutateAsync({ company_id, enabled: boolean, fee_payer: "movepark" | "partner" | null, delay: number })`; `useAnticipationLimits(companyId)`; `useSimulateAnticipation()`; `useCreateAnticipation()`.
- `anticipation.logic.ts` exporta `referenceCostLine(rateBps: number): string` e `payerLabel(v: "movepark" | "partner" | null): string`.

- [ ] **Step 1: Failing tests**

```ts
// src/features/payouts/anticipation.logic.test.ts
import { describe, expect, it } from "vitest";
import { payerLabel, referenceCostLine } from "./anticipation.logic";

describe("antecipação no repasse", () => {
  it("custo de referência de um 3x a partir da taxa mensal", () => {
    // 3x: parcelas adiantadas 0, 30 e 60 dias, média de 30 dias = 1 mês de taxa
    expect(referenceCostLine(310)).toBe("Num 3x, receber tudo em 30 dias custa cerca de 3,10% da parte do estacionamento.");
  });
  it("sem taxa cadastrada não promete número", () => {
    expect(referenceCostLine(0)).toBe("Taxa de antecipação não cadastrada em Configurações.");
  });
  it("rótulos do pagador", () => {
    expect(payerLabel(null)).toBe("Herda o padrão (Movepark)");
    expect(payerLabel("partner")).toBe("Estacionamento");
  });
});
```

```tsx
// src/features/payouts/AnticipationSection.test.tsx
// Renderiza com MSW: GET payout_recipient → anticipation_enabled false; GET company → anticipation_fee_payer null.
// 1. mostra "Desligada" e "Herda o padrão (Movepark)";
// 2. ligar + salvar chama POST /rpc/set_company_anticipation com { p_fee_payer: null } e
//    POST /functions/v1/update-recipient-payout com anticipation.enabled = true, volume_percentage 100;
// 3. erro da Edge aparece em toast e o interruptor volta para desligado.
```

Escreva os três casos do `AnticipationSection.test.tsx` com o mesmo molde de `src/features/payouts/PayoutSettingsDialog.test.tsx` (abra esse arquivo e copie o setup de MSW e `renderWithClient`). `AnticipateNowDialog.test.tsx`: (1) carrega o máximo de `limits` e preenche o campo; (2) "Simular" mostra taxa e data; (3) "Confirmar" só aparece depois da simulação e chama `create`.

- [ ] **Step 2:** `bun run test src/features/payouts` → FAIL.

- [ ] **Step 3: Implement `anticipation.logic.ts`**

```ts
const pct = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

/** A taxa vem do banco (`card_anticipation_rate_monthly_bps`); o repo é público e não guarda condição comercial. */
export function referenceCostLine(rateBps: number): string {
  if (!rateBps || rateBps <= 0) return "Taxa de antecipação não cadastrada em Configurações.";
  return `Num 3x, receber tudo em 30 dias custa cerca de ${pct(rateBps / 100)} da parte do estacionamento.`;
}

export function payerLabel(v: "movepark" | "partner" | null): string {
  if (v === "partner") return "Estacionamento";
  if (v === "movepark") return "Movepark";
  return "Herda o padrão (Movepark)";
}
```

O componente lê `card_anticipation_rate_monthly_bps` pelo hook de settings já usado em Configurações › Pagamentos.

- [ ] **Step 4: Implement hooks e componentes**

`api.ts` (perto de `useSetCompanyPayoutSchedule`, mesmo padrão de RPC com cast localizado):

```ts
export function useSetCompanyAnticipation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; enabled: boolean; fee_payer: "movepark" | "partner" | null; delay: number }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "set_company_anticipation", a: { p_company_id: string; p_fee_payer: string | null },
      ) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await rpc("set_company_anticipation", { p_company_id: args.company_id, p_fee_payer: args.fee_payer });
      if (error) throw new Error(error.message);
      const { data, error: fnErr } = await supabase.functions.invoke("update-recipient-payout", {
        body: { company_id: args.company_id, anticipation: args.enabled
          ? { enabled: true, type: "full", volume_percentage: 100, delay: args.delay }
          : { enabled: false, type: "full", volume_percentage: 0, delay: null } },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(String(data.error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: payoutKeys.all });
    },
  });
}
```

`useAnticipationLimits`, `useSimulateAnticipation`, `useCreateAnticipation`: `supabase.functions.invoke("recipient-anticipation", { body: { action, company_id, requested_cents, timeframe: "start" } })`, `throw` em `error` ou `data.error`, `invalidateQueries({ queryKey: payoutKeys.all })` no create. O `delay` vem do G2 (Task 6): grave-o em `app_setting.payout_anticipation_delay` e leia-o no componente pelo hook de settings já usado em Configurações › Pagamentos.

`AnticipationSection.tsx`: bloco "Cartão em 30 dias" dentro do `PayoutSettingsDialog`, com `Select` "Desligada / Ligada" e `Select` "Quem paga a antecipação" (Herda o padrão / Movepark / Estacionamento), a linha `referenceCostLine` em `text-caption text-muted`, e salva junto do botão Salvar do diálogo (o `save()` do diálogo chama `setAnticipation.mutateAsync` só se algo mudou). Copy curta, sem travessão, passada pela skill `revisar-texto`.

`AnticipateNowDialog.tsx`: aberto por botão "Antecipar agora" em `RecipientPanel.tsx` (só `hub_admin`, ao lado de "Repasse"). Mostra "Dá para antecipar até R$ X", campo de valor (padrão = máximo), botão "Simular", resultado "Taxa R$ Y, cai em DD/MM. Paga por: Movepark (volta ao estacionamento como crédito na próxima venda)" ou "Estacionamento", e "Confirmar antecipação" (ação irreversível: diálogo de confirmação com valor e taxa). Lista as antecipações da empresa (`payout_anticipation`, select direto, RLS de hub_admin) com status.

- [ ] **Step 5:** `bun run test src/features/payouts` → PASS; `bun run typecheck`; `bun run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/features/payouts
git commit -m "feat(antecipacao): cartão em 30 dias e Antecipar agora no repasse da empresa"
git push origin main
```

---

### Task 10: Regra de origem, reserva e extrato

**Files:**
- Modify: `src/features/commission/rule.logic.ts` + `rule.logic.test.ts`
- Modify: `src/features/commission/CommissionRulesCard.tsx` + `CommissionRulesCard.test.tsx`
- Modify: `src/features/commission/BookingCommissionCard.tsx` + `bookingCommission.logic.ts` + testes

**Interfaces:**
- Consumes: `commission_rule.anticipation_fee_payer`, `booking.commission_anticipation_payer`, `payment.anticipation_*` (Task 4).
- Produces: `RuleForm.anticipationPayer: "inherit" | FeePayer`; payload `anticipation_fee_payer: FeePayer | null`.

- [ ] **Step 1: Failing test** (`rule.logic.test.ts`)

```ts
it("pagador da antecipação: herdar vira null no payload e volta como herdar", () => {
  const form = { ...EMPTY_RULE_FORM, name: "Site", utmSources: "site", takeRatePct: "10", anticipationPayer: "inherit" as const };
  expect(toRulePayload(form).anticipation_fee_payer).toBeNull();
  expect(toRulePayload({ ...form, anticipationPayer: "partner" }).anticipation_fee_payer).toBe("partner");
  expect(fromRuleRow({ ...ROW, anticipation_fee_payer: null }).anticipationPayer).toBe("inherit");
});
```

Use os nomes reais das funções e constantes do arquivo (`rule.logic.ts` linhas 32, 52, 80, 130, 152: o form tem `feePayer`, o payload `gateway_fee_payer`). Se as funções se chamarem diferente de `toRulePayload`/`fromRuleRow`/`EMPTY_RULE_FORM`, ajuste o teste aos nomes exportados.

- [ ] **Step 2:** `bun run test src/features/commission` → FAIL.

- [ ] **Step 3: Implement:** `anticipationPayer` no tipo do form (default `"inherit"`), no payload (`anticipation_fee_payer: f.anticipationPayer === "inherit" ? null : f.anticipationPayer`) e na leitura da linha. Em `CommissionRulesCard.tsx`: `Select` "Antecipação paga por" (Herda a empresa / Movepark / Estacionamento) logo abaixo do de taxa do gateway, e coluna na tabela com `payerLabel` adaptado ("Herda a empresa"). Em `BookingCommissionCard.tsx`: linha "Antecipação paga por: X", e quando o pagamento tiver, "Compensação enviada R$ a · Taxa real R$ b · Crédito R$ c" (de `payment.anticipation_comp_cents`, `anticipation_fee_partner_cents`, `anticipation_credit_cents`).

- [ ] **Step 3b: Extrato do parceiro.** Leia a definição viva de `partner_account_statement` (`supabase db query --linked "select pg_get_functiondef('public.partner_account_statement'::regproc)"`; se houver sobrecarga, use `regprocedure` com a assinatura de `\df`). Numa migration `20261203160000_extrato_antecipacao.sql`, recrie-a acrescentando às movimentações: (a) `kind 'anticipation_credit'`, "Crédito de antecipação", valor = `payment.anticipation_credit_cents` (> 0) na data de `anticipation_reread_at` ou do pagamento, e = `payout_anticipation.anticipation_fee_cents` das pontuais `approved` com `fee_borne_by = 'movepark'`; (b) `kind 'anticipation_fee'`, "Antecipação", valor negativo = `payment.anticipation_fee_partner_cents` quando `booking.commission_anticipation_payer = 'partner'`, e a taxa das pontuais com `fee_borne_by = 'partner'`. pgTAP no `antecipacao_do_parceiro.test.sql` (+2 casos: crédito aparece com pagador Movepark; taxa aparece descontada com pagador parceiro; atualize `plan(14)`). No front, o rótulo dos dois kinds no componente do extrato (procure o mapa de rótulos de `fee_credit` em `src/features/payouts/`).

- [ ] **Step 4:** testes de componente: a regra salva `anticipation_fee_payer` no POST/PATCH (molde de `api.test.tsx`); o card da reserva mostra as três cifras quando existem e some quando nulas. `bun run test src/features/commission` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/commission
git commit -m "feat(antecipacao): pagador da antecipação na regra de origem e na reserva"
git push origin main
```

---

### Task 11: Documentação, verificação e segurança

**Files:**
- Modify: `docs/specs/antecipacao-do-parceiro.md` (Estado: implementado; seção "Como ficou implementado" com arquivos e testes)
- Modify: `docs/specs/README.md` (catálogo de migrations: `20261203150000_antecipacao_do_parceiro.sql` e as auxiliares)
- Modify: `docs/specs/payment-split.md` (parágrafo apontando para a spec nova na seção do split e no crédito)

- [ ] **Step 1:** Atualize as três docs. Passe `grep -n "—\|–"` nelas e no diff inteiro (`git diff origin/main~12 | grep -n "^+.*[—–]"`): zero.
- [ ] **Step 2:** `bun run typecheck && bun run lint && bun run test && bun run test:edge` → todos verdes.
- [ ] **Step 3:** `/security-review` no diff e `supabase db advisors --linked --type security --output-format json`: nenhuma regressão (função nova executável por `anon`, tabela sem RLS). Confira `select grantee from information_schema.role_routine_grants where routine_name in ('set_company_anticipation','recipient_anticipation_expected_key')`.
- [ ] **Step 4:** `git status` limpo (nenhum untracked referenciado).
- [ ] **Step 5: Commit e push**

```bash
git add docs/specs
git commit -m "docs(antecipacao): spec implementada, catálogo de migrations e payment-split"
git push origin main
```

- [ ] **Step 6:** Ligar de verdade numa empresa só com a ordem do Kallef (regra "não publicar sem ordem" vale para dinheiro também). O plano termina com a Agência Fera ligada (G1) e todo o resto desligado.
