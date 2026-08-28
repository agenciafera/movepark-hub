import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// `vi.hoisted` porque o `vi.mock` sobe acima de qualquer const.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

import {
  useAssumirConversa,
  useConversas,
  useDevolverConversa,
  useMarcarConversa,
  useResponderConversa,
} from "./api";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function ok(data: unknown) {
  invoke.mockReset();
  invoke.mockResolvedValue({ data, error: null });
}

const corpoDaChamada = () =>
  (invoke.mock.calls[0] as [string, { body: Record<string, unknown> }])[1].body;

describe("o que o navegador manda para a Edge", () => {
  it("listar não carrega conversa nenhuma", async () => {
    ok({ conversas: [] });
    renderHook(() => useConversas(), { wrapper });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][0]).toBe("mia-inbox");
    // A busca e a paginacao vao ao SERVIDOR: filtrar no navegador so' acha o que ja
    // veio, e o que ja veio e' uma pagina.
    expect(corpoDaChamada()).toEqual({ acao: "listar", limite: 30, busca: "", cursor: "" });
  });

  it("marcar como lida manda um instante; como não lida manda nulo", async () => {
    ok({ ok: true });
    const { result } = renderHook(() => useMarcarConversa(), { wrapper });
    await result.current.mutateAsync({ threadId: "t1", lida: true });
    const lida = corpoDaChamada();
    expect(lida.acao).toBe("marcar");
    expect(lida.threadId).toBe("t1");
    expect(typeof lida.lidaAte).toBe("string");

    ok({ ok: true });
    await result.current.mutateAsync({ threadId: "t1", lida: false });
    // Nulo, e não ausente: é assim que a Edge distingue "não lida" de "sem opinião".
    expect(corpoDaChamada().lidaAte).toBe(null);
  });

  it("assumir e devolver não mandam quem é o admin", async () => {
    // Quem assumiu sai do JWT, na Edge. Aceitar do navegador deixaria um admin assumir
    // em nome de outro, e o registro de quem atendia é o que dá sentido ao campo.
    ok({ ok: true });
    const assumir = renderHook(() => useAssumirConversa(), { wrapper });
    await assumir.result.current.mutateAsync({ threadId: "t1" });
    expect(corpoDaChamada()).toEqual({ acao: "assumir", threadId: "t1" });

    ok({ ok: true });
    const devolver = renderHook(() => useDevolverConversa(), { wrapper });
    await devolver.result.current.mutateAsync({ threadId: "t1" });
    expect(corpoDaChamada()).toEqual({ acao: "devolver", threadId: "t1" });
  });

  it("responder manda só a conversa e o texto", async () => {
    ok({ ok: true });
    const { result } = renderHook(() => useResponderConversa(), { wrapper });
    await result.current.mutateAsync({ threadId: "t1", texto: "oi" });
    expect(corpoDaChamada()).toEqual({ acao: "responder", threadId: "t1", texto: "oi" });
  });

  it("erro da Edge vira mensagem legível, nunca silêncio", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: "Acesso restrito." }) } },
    });
    const { result } = renderHook(() => useMarcarConversa(), { wrapper });
    await expect(result.current.mutateAsync({ threadId: "t1", lida: true })).rejects.toThrow(
      /Acesso restrito/,
    );
  });
});
