import { http, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

// URL estubada em src/test/setup.ts (VITE_SUPABASE_URL).
const SUPABASE_URL = "http://localhost:54321";

/**
 * Handlers MSW compartilhados. Testes individuais podem sobrescrever via
 * `server.use(...)` para cenários específicos.
 */
export const handlers: RequestHandler[] = [
  // check_availability é disparada por qualquer componente que monte o resumo de
  // reserva (SummaryCard etc.). Sem handler, a chamada vazava pro localhost:54321
  // (offline nos testes) e ficava pendurada até o teardown abortar o fetch
  // (DOMException AbortError vira erro não capturado e deixa o job vermelho de
  // forma intermitente). Resposta permissiva "disponível"; quem precisa de
  // esgotado ou mínimo de diárias sobrescreve com server.use(...).
  http.post(`${SUPABASE_URL}/rest/v1/rpc/check_availability`, () =>
    HttpResponse.json({
      ok: true,
      capacity: 10,
      remaining: 10,
      sold_out: false,
      near_capacity: false,
      near_capacity_message: null,
      min_stay_ok: true,
      min_stay_value: null,
      min_stay_unit: null,
      min_date_ok: true,
      minimum_date: null,
      advance_ok: true,
      advance_minutes: null,
      past_ok: true,
      days: 2,
      reasons: [],
      error: null,
    }),
  ),

  // Fallback: qualquer outra chamada ao Supabase local (leituras de referência
  // como amenity/destination, RPCs etc.) que nenhum teste mockou. Sem isto, a
  // requisição vazava pro localhost:54321 (offline) e ficava pendurada até o
  // teardown abortar o fetch em voo (AbortError, e no Bun um crash de libuv em
  // uv__stream_destroy), deixando o job vermelho de forma intermitente. Resolver
  // com lista vazia é benigno: o componente já degrada sem dados. Testes que
  // precisam de payload real registram o handler antes, via server.use(...).
  http.all(`${SUPABASE_URL}/*`, () => HttpResponse.json([])),
];
