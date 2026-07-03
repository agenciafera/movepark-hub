import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// Config separada do app: o vite.config.ts exporta um defineConfig(async …) que
// bate no Supabase em build-time e não pode ser reusado aqui. Replicamos só o
// alias @/ e o plugin React.
const srcAlias = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": srcAlias },
  },
  optimizeDeps: {
    include: ["@lineiconshq/free-icons"],
  },
  ssr: {
    noExternal: ["@lineiconshq/free-icons"],
  },
  test: {
    // Pool de forks (processos) em vez de threads: o pool de threads padrão crashava no
    // teardown nesta combinação de macOS + runtime (erro "Channel closed"/uv__stream_destroy),
    // deixando workers órfãos (PPID 1) presos consumindo memória. Forks encerram de forma limpa.
    // maxForks limita o paralelismo para não estourar a RAM (cada worker carrega o ambiente).
    pool: "forks",
    poolOptions: {
      forks: { minForks: 1, maxForks: 4 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          globals: true,
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Integração: bate na função simulate_price do banco vivo (read-only).
        // Não roda no gate `test`; só via `test:int`.
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["test/**/*.int.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      exclude: [
        "src/types/**",
        "src/components/ui/**",
        "**/*.test.*",
        "src/test/**",
        "src/main.tsx",
        "src/worker.ts",
        "**/*.d.ts",
      ],
    },
  },
});
