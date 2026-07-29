import { defineConfig } from "windupjs";

// Config em .mjs (e não .ts) de propósito: o loader do Windup (c12) precisa do jiti v2
// para ler TypeScript, mas o Tailwind 3 traz jiti 1.21.7 hoisted na raiz do node_modules
// e o c12 resolve esse. Em .mjs o jiti nem entra no caminho.
export default defineConfig({
  // Dev server do projeto (`bun run dev`). Aponte para outro ambiente por execução
  // com `windup run --base-url https://hub.movepark.co`.
  baseUrl: "http://localhost:5173",
  llm: {
    provider: "google",
    model: "gemini-3.1-flash-lite",
    providers: {
      // A chave do Google já vive como GEMINI_API_KEY no .env.local (gitignorado),
      // em vez do GOOGLE_GENERATIVE_AI_API_KEY que o Windup assume por padrão.
      google: { apiKeyEnv: "GEMINI_API_KEY" },
    },
  },
  scenarios: "e2e/windup",
  framework: "react-router",
  // O teto padrão (20) deixava 42 arquivos de fora do índice. O app tem 84 rotas.
  scan: { llmAssist: { enabled: true, maxCalls: 80 } },
  context: {},
});
