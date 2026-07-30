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
          // Não carrega src de <iframe> (ex.: embed do YouTube) — testes não batem na rede.
          environmentOptions: {
            happyDOM: { settings: { disableIframePageLoading: true } },
          },
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
      reporter: ["text-summary", "json-summary", "html"],
      // Sem `include`, o v8 só conta arquivo que algum teste importou. As features
      // sem teste nenhum ficavam fora do denominador e o número subia sozinho: era
      // uma média dos arquivos já cobertos, não do projeto.
      include: ["src/**"],
      exclude: [
        "src/types/**",
        "src/components/ui/**",
        "**/*.test.*",
        "src/test/**",
        "src/main.tsx",
        "src/worker.ts",
        "**/*.d.ts",
        // Ferramentas internas e catálogo visual: a prova deles é olhar, não asserir.
        "src/routes/design-system.tsx",
        "src/routes/motor-preview.tsx",
      ],
      /**
       * Catraca, não meta. Os números são o piso MEDIDO menos uma folga, e sobem
       * sozinhos com `autoUpdate` quando a cobertura melhora (o bump vem no
       * mesmo commit). Piso separado para `src/routes/**` de propósito: são 14
       * mil linhas de composição de JSX cuja prova barata é o Windup abrindo a
       * página, não o jsdom montando com providers falsos. Sem piso próprio, a
       * pressão do número global empurra justamente para o teste caro e fraco.
       *
       * Regra: threshold que reprova um PR que não mexeu em código é bug do
       * threshold. Baixe o número no mesmo PR e siga.
       *
       * `autoUpdate` fica DESLIGADO, e isso já foi testado na prática: com ele
       * ligado o piso grudou no valor exato medido (74.1 de branches) e o CI
       * reprovou no primeiro run com 74.09%, um branch de diferença em 3988,
       * puro ruído de ambiente. Piso é chão com folga, não marca d'água.
       * Ao subir a cobertura de verdade, suba o número aqui à mão.
       *
       * Medido em 30/07/2026: linhas 47.93%, branches 74.09%.
       */
      thresholds: {
        lines: 46,
        branches: 72,
      },
    },
  },
});