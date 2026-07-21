/**
 * T-16 do roteiro E1.3: assinar o contrato grava o aceite.
 *
 * Depende do T-15: o contrato só aparece depois que a conta de recebimento
 * existe. Em vez de repetir o wizard inteiro, o caso semeia a conta direto no
 * banco, que é o estado que o T-15 já cobre pela UI.
 *
 * NOTA sobre o T-17: o roteiro diz que assinar apenas grava o aceite. Não é
 * mais verdade, o botão também dispara `sync-recipient` e cria o recebedor na
 * Pagar.me (`src/routes/operator/recebimento.tsx`). Este caso assere só o
 * aceite, que é o escopo do T-16.
 *
 * ESCREVE em produção: semeia company e conta de repasse, e grava o aceite.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getCompany, seedFixtureCompany } from "../support/db";
import { admin } from "../support/supabaseAdmin";

test.setTimeout(90_000);

let companyId: string;

test.beforeEach(async () => {
  await cleanupFixture();
  companyId = await seedFixtureCompany("approved");

  // Estado de entrada do T-16: conta de recebimento já salva, contrato pendente.
  const { error } = await admin.from("company_payout_account").insert({
    company_id: companyId,
    bank_code: "341",
    branch_number: "1234",
    account_number: "567890",
    account_check_digit: "1",
    account_type: "checking",
    holder_name: "Mercy Estacionamentos",
    holder_document: "11222333000181",
  });
  if (error) throw error;
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-16: aceitar o contrato grava contract_accepted_at e a versão", async ({ page }) => {
  // Pré-condição do roteiro: sem aceite registrado.
  const before = await getCompany();
  expect(before!.contract_accepted_at).toBeNull();

  await page.goto("/operator/recebimento");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Contrato de parceria" })).toBeVisible({
    timeout: 20_000,
  });

  // O botão só libera depois do aceite explícito.
  const assinar = page.getByRole("button", { name: "Assinar contrato" });
  await expect(assinar, "assinar deveria estar travado antes do aceite").toBeDisabled();

  await page
    .locator("label")
    .filter({ hasText: "Li e concordo com o contrato de parceria" })
    .getByRole("checkbox")
    .check();

  await expect(assinar).toBeEnabled();
  await assinar.click();

  // O estado no banco é a prova: a RPC grava o aceite e a versão.
  await expect
    .poll(async () => (await getCompany())?.contract_accepted_at, {
      timeout: 30_000,
      intervals: [500, 1000, 2000],
      message: "a RPC operator_accept_contract deveria ter gravado o aceite",
    })
    .not.toBeNull();

  const after = await getCompany();
  expect(after!.contract_version).toBe("v1");
});
