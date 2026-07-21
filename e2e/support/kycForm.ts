/**
 * Helpers do wizard de KYC em /operator/recebimento.
 *
 * Os campos do formulário não têm `id`, e o `Field` renderiza o `<Label>` sem
 * `htmlFor` (`src/features/payouts/PayoutKycForm.tsx`), então `getByLabel` não
 * funciona. Localizamos pelo `data-field`, que é o rótulo visível.
 *
 * A falta dessa associação também é um problema de acessibilidade real: leitor
 * de tela não anuncia o rótulo do campo. Está registrado em atividade própria.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** Container de um campo, localizado pelo rótulo visível. */
export function field(page: Page, label: string): Locator {
  return page.locator(`[data-field="${label}"]`);
}

/**
 * Intercepta a consulta de CNPJ na BrasilAPI.
 *
 * Digitar um CNPJ completo dispara `fetchCnpj` (`src/lib/cnpj.ts`), que chama
 * um serviço de terceiro e autopreenche o formulário. Deixar essa chamada sair
 * de verdade tornaria o teste dependente de rede e de dado cadastral que pode
 * mudar. O stub mantém o caminho do código (resposta, mapeamento, preenchimento)
 * e tira a rede da equação.
 */
export async function stubCnpjLookup(page: Page) {
  await page.route("**/brasilapi.com.br/api/cnpj/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        razao_social: "Mercy Estacionamentos LTDA",
        nome_fantasia: "Mercy",
        email: "peu+mercy@fera.ag",
        data_inicio_atividade: "2015-03-10",
        cep: "01310100",
        logradouro: "Avenida Paulista",
        numero: "1000",
        complemento: "",
        bairro: "Bela Vista",
        municipio: "Sao Paulo",
        uf: "SP",
      }),
    }),
  );
}

/** Escolhe uma opção num Select do Radix, pelo rótulo do campo. */
export async function selectOption(page: Page, fieldLabel: string, optionName: RegExp | string) {
  await field(page, fieldLabel).getByRole("combobox").click();
  await page.getByRole("option", { name: optionName }).first().click();
}

/** Preenche o passo "Empresa" e avança. O CNPJ traz o resto pelo stub. */
export async function fillCompanyStep(page: Page) {
  await field(page, "CNPJ").getByRole("textbox").fill("11222333000181");

  // O autopreenchimento é assíncrono: espera a razão social chegar.
  await expect(field(page, "Razão social").getByRole("textbox")).toHaveValue(
    /Mercy Estacionamentos/,
    { timeout: 15_000 },
  );

  await selectOption(page, "Tipo de empresa", /.+/);
  await field(page, "Telefone").getByRole("textbox").fill("11987727182");
  await field(page, "Faturamento anual").getByRole("textbox").fill("120000");
  await field(page, "Data de fundação").getByRole("textbox").fill("10/03/2015");

  await page.getByRole("button", { name: "Continuar" }).click();
}

/** Preenche um bloco de endereço, deixando de fora o que o teste quiser testar. */
export async function fillAddress(
  page: Page,
  opts: { complement?: string; referencePoint?: string } = {},
) {
  const { complement = "Sala 12", referencePoint = "Ao lado do posto" } = opts;

  await field(page, "CEP").getByRole("textbox").fill("01310100");
  await field(page, "Rua").getByRole("textbox").fill("Avenida Paulista");
  await field(page, "Número").getByRole("textbox").fill("1000");
  await field(page, "Complemento").getByRole("textbox").fill(complement);
  await field(page, "Bairro").getByRole("textbox").fill("Bela Vista");
  await field(page, "Cidade").getByRole("textbox").fill("Sao Paulo");
  // "Estado (UF)" é um Select de UFs (StateSelect), não campo de texto.
  await selectOption(page, "Estado (UF)", "SP");
  await field(page, "Ponto de referência").getByRole("textbox").fill(referencePoint);
}
