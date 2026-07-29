/**
 * Passos do modal "Seja parceiro", compartilhados por T-01, T-02 e T-03.
 *
 * Fica aqui para os specs falarem de intenção ("preencha o passo 1") em vez de
 * seletor. Quando o modal mudar, muda só este arquivo.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { FIXTURE_COMPANY_NAME, FIXTURE_EMAIL } from "./fixtures";

/** Só os dígitos: o PhoneField cuida do país e da máscara. */
export const FIXTURE_PHONE_DIGITS = "11987727182";

/** Abre a página pública e o modal, devolvendo o dialog. */
export async function openLeadModal(page: Page): Promise<Locator> {
  await page.goto("/seja-parceiro");
  await page.getByRole("button", { name: "Quero ser parceiro" }).first().click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Passo 1 de 2")).toBeVisible();
  return modal;
}

/** Preenche o passo 1 e avança. Ao voltar, o modal está no passo 2. */
export async function fillStep1(modal: Locator, email = FIXTURE_EMAIL) {
  await modal.locator("#pl-name").fill(`Teste ${FIXTURE_COMPANY_NAME}`);
  await modal.locator("#pl-email").fill(email);
  await modal.locator("#pl-phone").fill(FIXTURE_PHONE_DIGITS);
  await modal.getByRole("button", { name: "Continuar" }).click();
  await expect(modal.getByText("Passo 2 de 2")).toBeVisible();
}

/** Preenche o passo 2 e envia. Ao voltar, a tela de agradecimento está na tela. */
export async function fillStep2AndSubmit(modal: Locator, spots = "50") {
  await modal.locator("#pl-company").fill(FIXTURE_COMPANY_NAME);
  await modal.locator("#pl-spots").fill(spots);
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: "Quero ser parceiro" }).click();
}

/** Faz o funil inteiro, do zero até a tela de agradecimento. */
export async function submitFullLead(page: Page, email = FIXTURE_EMAIL) {
  const modal = await openLeadModal(page);
  await fillStep1(modal, email);
  await fillStep2AndSubmit(modal);
  return modal;
}
