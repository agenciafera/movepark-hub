import { defineConfig } from "windupjs";

export default defineConfig({
  baseUrl: "http://localhost:5173",
  llm: {
    // Planejar pela assinatura Claude do projeto (perfil `fera`, ligado pelo
    // .envrc via direnv) em vez de queimar a GEMINI_API_KEY. Replay não usa
    // modelo nenhum, então isso só pesa ao criar ou re-planejar cenário.
    provider: "claude-code",
    // O `model` precisa ser explícito. Sem ele, o Windup 1.8.0 cai no default
    // do Google e manda "gemini-3.1-flash-lite" para a CLI do Claude, que
    // responde 404 no modelo. Ver patches/windupjs@1.8.0.patch.
    model: "claude-sonnet-4-6",
    // Fallback por execução: `windup run <id> --llm google`.
    providers: {
      google: { model: "gemini-3.1-flash-lite", apiKeyEnv: "GEMINI_API_KEY" },
    },
  },
  scenarios: "e2e/windup",
  framework: "react-router",
  scan: { llmAssist: { enabled: true, maxCalls: 80 } },
  context: {},
});
