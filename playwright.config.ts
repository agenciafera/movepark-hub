import { defineConfig, devices } from "@playwright/test";
import { env } from "./e2e/support/env";
import { MANAGER_STATE, OPERATOR_STATE } from "./e2e/support/session";

/**
 * Camada E2E de navegador. Separada do Vitest de propósito: o Vitest só olha
 * `src/**` e `test/**`, então os `.spec.ts` daqui não colidem com ele.
 *
 * Os projects rodam em cadeia: `setup` gera os storageStates, e os projects
 * autenticados dependem dele. Quem roda em `e2e/public` não tem sessão.
 */
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
