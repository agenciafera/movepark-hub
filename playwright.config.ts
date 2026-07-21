import { defineConfig, devices } from "@playwright/test";
import { env } from "./e2e/support/env";
import { CUSTOMER_STATE, MANAGER_STATE, OPERATOR_STATE } from "./e2e/support/session";

/**
 * Camada E2E de navegador. Separada do Vitest de propósito: o Vitest só olha
 * `src/**` e `test/**`, então os `.spec.ts` daqui não colidem com ele.
 *
 * Os projects rodam em cadeia: `setup` gera os storageStates, e os projects
 * autenticados dependem dele. Quem roda em `e2e/public` não tem sessão.
 */

/**
 * O project transacional do consumidor (C-06 em diante) cria reserva e cobrança
 * REAL no Pagar.me. Ele nunca pode rodar num `playwright test` sem argumento.
 *
 * A trava tem duas partes, e as duas são necessárias:
 *
 *   1. aqui, derivamos do argv se alguém pediu o project por nome, e gravamos
 *      isso em `MP_E2E_TX`. Derivar do argv mantém a decisão presa a UMA
 *      invocação: nada fica exportado no shell para valer na execução seguinte.
 *
 *   2. os specs consultam `MP_E2E_TX` via `guardTx()` (e2e/support/consumer.ts)
 *      e se pulam sozinhos quando ela não está ligada.
 *
 * Por que não bastava não registrar o project quando o argv não pede: o worker
 * do Playwright reavalia este arquivo num processo próprio, SEM o argv original.
 * O project sumia lá dentro e a execução morria com "Project not found in the
 * worker process". O worker herda `process.env`, então a variável atravessa e o
 * argv não. Descoberto na primeira execução real, em 21/07/2026.
 */
const TX_PROJECT = "e2e-consumer-tx";
const txRequested = process.argv.some(
  (arg, i) =>
    arg === `--project=${TX_PROJECT}` ||
    (arg === "--project" && process.argv[i + 1] === TX_PROJECT),
);
if (txRequested) process.env.MP_E2E_TX = "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: env.baseUrl,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\/.*\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e-public",
      testMatch: /public\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e-manager",
      testMatch: /manager\/.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: MANAGER_STATE },
    },
    {
      name: "e2e-operator",
      testMatch: /operator\/.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: OPERATOR_STATE },
    },
    /**
     * Roteiro C (consumidor), parte de LEITURA: C-01 a C-05. Home, busca e
     * detalhe da unidade. Nenhum destes cria reserva ou cobrança.
     *
     * O C-15 foi avaliado para entrar aqui e não coube: o único estado que
     * produz o 422 do voucher é `pending`, e reserva pendente expira sozinha.
     * Ele ficou no project transacional, com o custo do C-06 (sem cobrança).
     */
    {
      name: "e2e-consumer",
      testMatch: /consumer\/C0[1-5].*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: CUSTOMER_STATE },
    },
    /**
     * Roteiro C, parte TRANSACIONAL: C-06 a C-11 (reserva, checkout e PIX) e a
     * parte 2, pós-pagamento: C-14 (voucher), C-15 (422 antes da confirmação),
     * C-16 (upgrade de Tarifa), C-19 e C-20 (cancelamento dentro e fora da
     * janela) e C-21 (Superflex).
     *
     * Nem todos cobram: o C-15 para no passo 1 do checkout e só cria `booking`,
     * como o C-06. Do C-09 em diante, e em toda a parte 2 fora do C-15, há
     * cobrança real.
     *
     * Fica num project separado porque cria efeito colateral irreversível: cada
     * execução gera `booking` de verdade numa unidade de parceiro real e, do
     * C-09 em diante, uma COBRANÇA REAL no Pagar.me. Na conta atual o PIX
     * liquida sozinho em 1 a 3 segundos, então a cobrança é paga, não fica
     * pendurada.
     *
     * O project fica SEMPRE registrado, para o worker conseguir resolvê-lo pelo
     * nome (ver a nota sobre `MP_E2E_TX` no topo do arquivo). Quem impede a
     * execução acidental é o `guardTx()` dentro de cada spec: num `playwright
     * test` sem argumento eles aparecem e se pulam, sem tocar em nada.
     *
     * O único jeito de rodá-los de verdade é pedir o project pelo nome:
     *
     *     bunx playwright test --project=e2e-consumer-tx
     *
     * A limpeza é por CANCELAMENTO pelo produto, nunca por delete: ver
     * `docs/testes/roteiro-consumidor-reserva.md` e `e2e/README.md`. A exceção é
     * o C-20, que de propósito deixa uma reserva fora da janela: essa só o staff
     * fecha.
     */
    {
      name: TX_PROJECT,
      testMatch: /consumer\/C(0[6-9]|1[014569]|2[01]).*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: CUSTOMER_STATE },
    },
    {
      name: "smoke",
      testMatch: /smoke\/.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Dev server próprio da suíte, na 5273 e sem a chave do Google.
   *
   * Sem a chave, `isGooglePlacesEnabled` é false e o passo 1 do wizard de
   * publicação mostra campos manuais de latitude e longitude, o que deixa o
   * T-07 determinístico e sem chamada externa paga. O preço dessa escolha:
   * o autocomplete do Google não tem cobertura E2E.
   *
   * A porta separada evita reaproveitar um `bun run dev` aberto na mão, que
   * viria com a chave e mudaria silenciosamente o caminho testado.
   */
  webServer: {
    command: "VITE_GOOGLE_MAPS_API_KEY= PORT=5273 bun run dev",
    url: env.baseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
