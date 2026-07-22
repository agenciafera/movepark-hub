/**
 * C-24 do roteiro do consumidor: cupom PROMO10 por querystring e aplicado à mão.
 *
 * Só LÊ. A validação do cupom é anônima e server-side (`validate_coupon_public`),
 * então este caso NÃO cria reserva nem cobrança. Fica no project de leitura.
 *
 * O que o caso protege, além do desconto em si:
 *   - o ESCOPO do cupom é por EMPRESA (`coupon.company_id = abbapark`), não por
 *     tipo de vaga. Quem procurar o vínculo em `coupon_parking_type` acha a tabela
 *     vazia e conclui, errado, que o cupom é global. Vazio ali significa "todos os
 *     tipos daquela empresa" (a checagem só roda `if exists`,
 *     `20260611000000_coupon_engine.sql:110`);
 *   - a recusa em outra empresa devolve `invalid`, que parece "cupom não existe" e
 *     é escopo;
 *   - existem DOIS nomes de parâmetro, `?cupom=` e `?coupon=` (`parseCouponParam`,
 *     `src/lib/coupon.ts:15`). Testar só um deixa metade sem cobertura.
 *
 * Armadilha ao rodar em sequência: o cupom é guardado na sessão (`getStoredCoupon`)
 * de propósito, para sobreviver ao round-trip de login. Cada teste aqui abre
 * contexto limpo via `page`, mas se alguém reaproveitar a mesma aba, um cupom
 * anterior reaparece sozinho e parece bug.
 */
import { test, expect, type Page } from "@playwright/test";
import { ABBAPARK, MOTION_PARK, listingUrl, oneNightRange } from "../support/consumer";
import { admin } from "../support/supabaseAdmin";

const CODE = "PROMO10";

/**
 * O detalhe monta o `ReservationCard` DUAS vezes: o card do desktop e o CTA fixo
 * do mobile (`listing.tsx:269` e `:349`). Só um está visível por vez, mas os dois
 * existem no DOM, então `getByTestId` sozinho estoura o strict mode do Playwright.
 * Todo seletor do cupom aqui filtra pelo visível.
 */
function couponEl(page: Page, id: string) {
  return page.locator(`[data-testid="${id}"]:visible`);
}

/** Estado do cupom no banco. O caso assume 10% e sem limite de uso. */
async function loadCoupon() {
  const { data, error } = await admin
    .from("coupon")
    .select("code, discount_type, discount_value, is_active, max_uses, per_user_limit, company_id")
    .ilike("code", CODE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

test.describe("C-24", () => {
  test("C-24a: o cupom existe, é percentual e pertence ao Abbapark", async () => {
    const coupon = await loadCoupon();
    expect(coupon, `cupom ${CODE} não existe no banco`).toBeTruthy();
    expect(coupon!.is_active).toBe(true);
    expect(coupon!.discount_type).toBe("percent");
    expect(Number(coupon!.discount_value)).toBe(10);

    // O escopo mora AQUI, não em coupon_parking_type.
    const { data: owner } = await admin
      .from("company")
      .select("slug")
      .eq("id", coupon!.company_id)
      .maybeSingle();
    expect(owner?.slug, "PROMO10 deveria pertencer ao Abbapark").toBe(ABBAPARK.operatorSlug);
  });

  /**
   * Quando o cupom valida, o bloco "aplicado" SUBSTITUI o campo de digitação: o
   * JSX é um ternário (`applied ? <chip> : <input>`, ReservationCard). Por isso
   * aqui não dá para assertar o valor do input, ele deixou de existir. O sinal de
   * que a querystring funcionou é o chip aparecer já com o código.
   */
  test("C-24b: querystring ?cupom= aplica 10% no Abbapark", async ({ page }) => {
    const range = oneNightRange();
    await page.goto(`${listingUrl(ABBAPARK, "uncovered", range)}&cupom=${CODE}`);

    const applied = couponEl(page, "coupon-applied");
    await expect(applied).toBeVisible({ timeout: 30_000 });
    await expect(applied).toContainText(CODE);
    // O desconto precisa estar explícito, não só o código do cupom.
    await expect(applied).toContainText(/R\$|%/);
  });

  test("C-24c: o alias ?coupon= funciona igual", async ({ page }) => {
    const range = oneNightRange();
    await page.goto(`${listingUrl(ABBAPARK, "uncovered", range)}&coupon=${CODE}`);

    const applied = couponEl(page, "coupon-applied");
    await expect(applied).toBeVisible({ timeout: 30_000 });
    await expect(applied).toContainText(CODE);
  });

  test("C-24d: aplicar à mão dá o mesmo resultado da querystring", async ({ page }) => {
    const range = oneNightRange();
    await page.goto(listingUrl(ABBAPARK, "uncovered", range));

    const input = couponEl(page, "coupon-input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill(CODE);
    await couponEl(page, "coupon-apply").click();

    await expect(couponEl(page, "coupon-applied")).toBeVisible({ timeout: 30_000 });
  });

  test("C-24e: o mesmo cupom é recusado em unidade de outra empresa", async ({ page }) => {
    const range = oneNightRange();
    await page.goto(`${listingUrl(MOTION_PARK, "uncovered", range)}&cupom=${CODE}`);

    await expect(couponEl(page, "coupon-input")).toHaveValue(CODE, { timeout: 30_000 });
    // Recusa é o comportamento CORRETO: o cupom é do Abbapark. Não é cupom quebrado.
    await expect(couponEl(page, "coupon-applied")).toHaveCount(0);
    await expect(couponEl(page, "coupon-error")).toBeVisible({ timeout: 30_000 });
  });
});
