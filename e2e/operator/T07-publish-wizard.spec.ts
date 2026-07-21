/**
 * T-07 do roteiro E1.3: o wizard de publicação cria a unidade e leva ao preview.
 *
 * COBERTURA PARCIAL, por decisão de projeto. O dev server da suíte sobe sem
 * `VITE_GOOGLE_MAPS_API_KEY` (ver `playwright.config.ts`), então o passo 1 cai
 * nos campos manuais de latitude e longitude. O autocomplete do Google, que é
 * o caminho real de quem usa, NÃO tem cobertura E2E. A alternativa era chamar
 * a API paga do Google a cada rodada e herdar a instabilidade dela.
 *
 * DIVERGÊNCIAS DO ROTEIRO encontradas ao escrever este caso:
 *   - T-08 afirma que não existe step de fotos no onboarding. Existe: é o
 *     passo 4, e publicar exige ao menos uma foto.
 *   - T-09 afirma que não existe sugestão de preço 10% menor. Existe, aparece
 *     abaixo do preço de balcão assim que ele é preenchido. O que de fato não
 *     existe é a tela de aceite da proposta.
 *
 * ESCREVE em produção: cria location, location_parking_type e sobe uma imagem
 * para o Storage. A limpeza cobre os três.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, seedFixtureCompany } from "../support/db";
import { admin } from "../support/supabaseAdmin";

// PNG 1x1 transparente. Serve só para satisfazer a trava de "pelo menos 1 foto".
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Upload de imagem e publicação passam por Edge Function, então este caso é
// mais lento que o padrão de 30s da suíte.
test.setTimeout(90_000);

let companyId: string;

test.beforeEach(async () => {
  await cleanupFixture();
  // O wizard só aparece com a company aprovada (ver src/routes/onboarding.tsx).
  companyId = await seedFixtureCompany("approved");
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-07: os 4 passos publicam a unidade e levam ao preview", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  // Passo 1: endereço. Sem a chave do Google, lat e lng são campos manuais.
  await expect(page.getByRole("heading", { name: "Onde fica seu estacionamento?" })).toBeVisible();
  await page.locator("#unit-name").fill("Unidade E2E Mercy");
  await page.locator("#unit-address").fill("Rua Teste, 100, São Paulo, SP");
  await page.locator("#lat").fill("-23.5505");
  await page.locator("#lng").fill("-46.6333");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 2: um tipo de vaga, com preço de balcão e capacidade.
  await expect(page.getByRole("heading", { name: "Suas vagas e o preço de balcão" })).toBeVisible();
  const row = page.locator('[data-testid^="pt-row-"]').first();
  await row.getByRole("checkbox").check();
  await row.getByRole("textbox").fill("100");
  await row.getByRole("spinbutton").fill("30");

  // A sugestão de 10% menor aparece aqui, o que o roteiro dá como inexistente.
  await expect(page.getByText("10% menor que o balcão")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 3: transfer.
  await expect(page.getByRole("heading", { name: "Você oferece transfer?" })).toBeVisible();
  await page.getByRole("button", { name: "Não ofereço" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 4: foto, que é obrigatória para publicar.
  await expect(page.getByRole("heading", { name: "As fotos do seu estacionamento" })).toBeVisible();

  // O upload é assíncrono e passa pela Edge `upload-asset`. Publicar antes de
  // ele terminar esbarra na trava de "pelo menos 1 foto", sem navegar.
  const uploadDone = page.waitForResponse(
    (r) => r.url().includes("/functions/v1/upload-asset") && r.status() < 400,
    { timeout: 45_000 },
  );
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "unidade-e2e.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await uploadDone;

  await page.getByRole("button", { name: "Concluir preview" }).click();

  // Publicou: a rota vira o preview travado da unidade.
  await page.waitForURL(/\/operator\/preview\/[0-9a-f-]+\?published=1/, { timeout: 30_000 });

  // E o estado no banco acompanha.
  const { data: locations, error } = await admin
    .from("location")
    .select("id, name, company_id")
    .eq("company_id", companyId);
  if (error) throw error;

  expect(locations, "o wizard deveria ter criado exatamente uma unidade").toHaveLength(1);
  expect(locations![0].name).toBe("Unidade E2E Mercy");

  const { data: types, error: typesError } = await admin
    .from("location_parking_type")
    .select("id")
    .eq("location_id", locations![0].id);
  if (typesError) throw typesError;
  expect(types!.length, "o passo 2 deveria ter gravado o tipo de vaga").toBeGreaterThan(0);
});
