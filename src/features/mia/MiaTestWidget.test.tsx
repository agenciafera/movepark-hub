import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as auth from "@/auth/context";
import { MiaTestWidget } from "./MiaTestWidget";
// `vi.hoisted` porque o `vi.mock` sobe para o topo do arquivo, acima de qualquer const:
// sem isto, a fábrica roda antes de `invoke` existir.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

import { useEnviarParaMia, useLimparConversaDaMia } from "./api";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const comPapel = (effectiveRole: string | null) =>
  vi.spyOn(auth, "useAuth").mockReturnValue({
    session: { userId: "u1", fullName: "Kallef" },
    effectiveRole,
    isLoading: false,
  } as never);

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
});

describe("bolinha de teste da Mia", () => {
  it("não aparece para quem não é hub_admin", () => {
    comPapel("company_operator");
    render(<MiaTestWidget />, { wrapper });
    expect(screen.queryByLabelText("Testar a Mia")).toBeNull();
  });

  it("aparece para hub_admin", () => {
    // Antes havia um segundo portão, o `VITE_MIA_URL`, porque a Mia só existia no
    // localhost de quem testava. Com a Edge no meio ela existe sempre, e o portão
    // virava só uma forma de a bolinha sumir em produção sem ninguém entender.
    comPapel("hub_admin");
    render(<MiaTestWidget />, { wrapper });
    expect(screen.getByLabelText("Testar a Mia")).toBeTruthy();
  });
});

describe("as tools ficam fora do texto do agente", () => {
  it("a resposta guardada é exatamente o que o cliente leria", async () => {
    // A primeira versão concatenava `_tools: ..._` na fala. Num teste isso engana:
    // o que você lê deixa de ser o que o cliente leria.
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: {
        text: "Vaga coberta custa R$ 144,50.",
        steps: [{ toolCalls: [{ payload: { toolName: "consultar_preco" } }] }],
      },
      error: null,
    });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    const r = await result.current.mutateAsync("x");
    expect(r.reply).toBe("Vaga coberta custa R$ 144,50.");
    expect(r.reply).not.toContain("tools");
    expect(r.tools).toEqual(["consultar_preco"]);
  });
});

// Os invariantes da identidade (telefone falso, origem aceita pelo WL, memória por
// usuário, prefixo do namespace) moraram aqui enquanto o navegador os montava. Agora
// quem monta é a Edge `mia-chat`, e os testes foram junto, em
// supabase/functions/mia-chat/index.test.ts. Testar aqui daria falsa sensação de
// proteção: o valor que vale é o que a Edge manda, não o que o front sugere.

describe("useEnviarParaMia", () => {
  const responder = (data: unknown, error: unknown = null) => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data, error });
    return invoke;
  };

  it("manda UMA mensagem, nunca o histórico", async () => {
    // A Edge passa `memory`, então o Mastra já recupera a conversa. Mandar o histórico
    // junto entregava tudo em dobro: em 26/08 um turno saiu com 19 mensagens no corpo
    // e 124 na memória da mesma thread.
    //
    // O corpo também carrega SÓ `messages`. Se voltar a levar `requestContext`, um admin
    // poderia trocar o telefone e puxar a reserva de um cliente de verdade.
    const f = responder({ text: "oi" });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await result.current.mutateAsync("ola");

    const [nome, opts] = f.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(nome).toBe("mia-chat");
    expect(opts.body.messages).toEqual([{ role: "user", content: "ola" }]);
    expect(Object.keys(opts.body)).toEqual(["messages"]);
  });

  it("extrai as tools chamadas, que é metade do valor de testar aqui", async () => {
    responder({
      text: "resposta",
      steps: [
        { toolCalls: [{ payload: { toolName: "hub_list_locations" } }] },
        { toolCalls: [{ payload: { toolName: "consultar_preco" } }] },
      ],
    });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    const r = await result.current.mutateAsync("x");
    expect(r.tools).toEqual(["hub_list_locations", "consultar_preco"]);
  });

  it("resposta sem texto não vira string vazia em silêncio", async () => {
    responder({ text: "   " });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    const r = await result.current.mutateAsync("x");
    expect(r.reply).toContain("não respondeu");
  });

  it("mostra a mensagem que a Edge deu, e não o erro genérico do cliente", async () => {
    // "FunctionsHttpError" não ajuda ninguém. "Acesso restrito" diz o que aconteceu.
    responder(null, { context: { json: async () => ({ error: "Acesso restrito." }) } });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await expect(result.current.mutateAsync("x")).rejects.toThrow(
      /Acesso restrito/,
    );
  });

  it("erro sem corpo ainda vira uma frase, nunca silêncio", async () => {
    responder(null, new Error("Failed to fetch"));
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await waitFor(async () => {
      await expect(result.current.mutateAsync("x")).rejects.toThrow();
    });
  });
});

describe("botão de limpar", () => {
  it("some quando não há conversa: não existe o que limpar", () => {
    comPapel("hub_admin");
    render(<MiaTestWidget />, { wrapper });
    expect(screen.getByLabelText("Testar a Mia")).toBeTruthy();
  });

  it("pede à Edge para apagar, e a Edge é quem escolhe a thread", async () => {
    // O corpo leva só a ação. A thread sai do JWT na Edge, senão um admin poderia
    // apagar a conversa de outra pessoa mandando outro id.
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { limpo: true }, error: null });
    const { result } = renderHook(() => useLimparConversaDaMia(), { wrapper });
    await result.current.mutateAsync();

    const [nome, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(nome).toBe("mia-chat");
    expect(opts.body).toEqual({ acao: "limpar" });
  });

  it("falha da Edge vira mensagem, nunca silêncio", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: "Acesso restrito." }) } },
    });
    const { result } = renderHook(() => useLimparConversaDaMia(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toThrow(/Acesso restrito/);
  });
});
