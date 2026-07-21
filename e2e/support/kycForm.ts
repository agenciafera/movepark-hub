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

/**
 * Preenche um telefone.
 *
 * O `PhoneField` tem dois campos: o seletor de país e o número. Um
 * `getByRole("textbox")` genérico pega o de busca de país e abre a lista de
 * países por cima do formulário, o que já custou uma falha silenciosa aqui.
 * O placeholder é o que distingue o campo do número.
 */
export async function fillPhone(page: Page, fieldLabel: string, digits: string) {
  await field(page, fieldLabel).getByPlaceholder("Digite seu número").fill(digits);
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
  await fillPhone(page, "Telefone", "11987727182");
  await field(page, "Faturamento anual").getByRole("textbox").fill("12000000"); // R$ 120.000,00
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

/** Preenche o passo "Representante", que inclui os dados pessoais e o endereço. */
export async function fillRepresentativeStep(page: Page) {
  await field(page, "Nome completo").getByRole("textbox").fill("Maria Teste da Silva");
  await field(page, "CPF").getByRole("textbox").fill("39053344705");
  await field(page, "E-mail").getByRole("textbox").fill("peu+mercy@fera.ag");
  await fillPhone(page, "Telefone", "11987727182");
  await field(page, "Data de nascimento").getByRole("textbox").fill("15/06/1985");
  await field(page, "Renda mensal").getByRole("textbox").fill("1500000"); // R$ 15.000,00
  await field(page, "Ocupação profissional").getByRole("textbox").fill("Empresaria");

  // Checkbox obrigatório. Sem ele o passo não avança e o erro aparece como
  // "Confirme que é o representante legal".
  await page
    .locator("label")
    .filter({ hasText: "Declaro que sou o representante legal" })
    .getByRole("checkbox")
    .check();

  // O endereço do representante usa os mesmos rótulos do da empresa, mas está
  // sozinho neste passo, então não há ambiguidade.
  await fillAddress(page);

  await page.getByRole("button", { name: "Continuar" }).click();
}

/**
 * Preenche o passo "Conta bancária" e submete o formulário.
 *
 * O campo Banco é um combobox com busca (`BankSelect`), não texto livre. O
 * roteiro dá o T-13 como não implementado, mas ele existe.
 */
export async function fillBankStepAndSubmit(page: Page) {
  await field(page, "Banco").getByRole("combobox").click();
  await page.getByPlaceholder("Busque por código ou nome").fill("341");
  await page.getByRole("option").first().click();

  await field(page, "Agência").getByRole("textbox").fill("1234");
  await field(page, "Conta").getByRole("textbox").fill("567890");
  await field(page, "Dígito da conta").getByRole("textbox").fill("1");
  await selectOption(page, "Tipo de conta", /.+/);
  await field(page, "Titular da conta (máx. 30 caracteres)")
    .getByRole("textbox")
    .fill("Mercy Estacionamentos");

  await page.getByRole("button", { name: "Salvar e continuar" }).click();
}
