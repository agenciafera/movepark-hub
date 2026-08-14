import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "./msw/server";

// Estado ambiente limpo antes de CADA teste. sessionStorage é global do happy-dom e, dependendo da
// ordem/distribuição de arquivos entre forks, um valor de um teste (ex.: o flag de stale-build)
// podia sobrar e contaminar o primeiro teste de outro arquivo (que só limpa no afterEach). Limpar
// no beforeEach torna cada teste hermético e mata essa classe de flakiness (que quebrou o CI).
beforeEach(() => {
  sessionStorage.clear();
});

// Stub das envs do Vite usadas por src/lib/supabase.ts. O client já degrada via
// hasSupabaseEnv, mas estabilizamos pra um valor conhecido (interceptado pelo MSW).
vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
// Google Places desligado por padrão nos testes (determinístico, igual ao CI onde a var não existe).
// Sem isso, um `.env.local` com VITE_GOOGLE_MAPS_API_KEY vazaria e ligaria o caminho do web component.
vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
// Conta do consumidor LIGADA por padrão nos testes, ao contrário do build, que sai desligado no
// lançamento. A suíte existente cobre o comportamento da funcionalidade (favoritar, Entrar, atalhos
// de conta), e com a chave desligada aqui dezenas de casos passariam a testar o vazio. Quem cobre o
// desligado é `src/lib/features.test.tsx`, que baixa a chave de propósito e varre a superfície toda.
vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "on");

// MSW: intercepta chamadas a Edge Functions / REST do Supabase nos testes de
// componente/integração. Handlers vazios por ora — adicionados conforme a leva.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
