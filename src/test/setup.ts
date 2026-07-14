import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server";

// Stub das envs do Vite usadas por src/lib/supabase.ts. O client já degrada via
// hasSupabaseEnv, mas estabilizamos pra um valor conhecido (interceptado pelo MSW).
vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
// Google Places desligado por padrão nos testes (determinístico, igual ao CI onde a var não existe).
// Sem isso, um `.env.local` com VITE_GOOGLE_MAPS_API_KEY vazaria e ligaria o caminho do web component.
vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");

// MSW: intercepta chamadas a Edge Functions / REST do Supabase nos testes de
// componente/integração. Handlers vazios por ora — adicionados conforme a leva.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
