import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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

describe("a identidade vem antes da conversa", () => {
  function abrir() {
    comPapel("hub_admin");
    render(<MiaTestWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Testar a Mia"));
  }

  it("pede telefone e origem antes de deixar escrever", () => {
    // O telefone e' o que a Mia usa como prova de posse (D43): e' premissa, nao
    // preferencia. Pedir depois deixaria metade da conversa com outra identidade.
    abrir();
    expect(screen.getByLabelText("Telefone do cliente")).toBeTruthy();
    expect(screen.getByLabelText("Origem")).toBeTruthy();
    expect(screen.queryByLabelText("Enviar")).toBeNull();
  });

  it("libera a conversa depois de começar", () => {
    abrir();
    fireEvent.click(screen.getByText("Começar conversa"));
    expect(screen.getByLabelText("Enviar")).toBeTruthy();
    expect(screen.queryByLabelText("Telefone do cliente")).toBeNull();
  });

  it("não deixa começar com número torto", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Telefone do cliente"), { target: { value: "4198" } });
    expect((screen.getByText("Começar conversa") as HTMLButtonElement).disabled).toBe(true);
  });

  it("mostra no cabeçalho quem a Mia pensa que está atendendo", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Telefone do cliente"), {
      target: { value: "(41) 98814-9449" },
    });
    fireEvent.click(screen.getByText("Começar conversa"));
    expect(screen.getByText(/\(41\) 98814-9449/)).toBeTruthy();
    expect(screen.getByText(/Webchat/)).toBeTruthy();
  });

  it("o botão de limpar não depende da tela estar cheia", () => {
    // A tela comeca vazia a cada carregamento, mas a conversa vive no servidor: com a
    // checagem antiga (`messages.length === 0`) o botao aparecia apagado justamente
    // quando havia o que limpar.
    abrir();
    fireEvent.click(screen.getByText("Começar conversa"));
    expect((screen.getByLabelText("Limpar conversa") as HTMLButtonElement).disabled).toBe(false);
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
    const r = await result.current.mutateAsync({ texto: "x", identidade: { telefone: "5500000000000", origem: "webchat-bot" } });
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
    // O corpo carrega mensagem, telefone e origem, e nada mais. O telefone é escolhido
    // de propósito (esta é a bancada de teste), mas quem MONTA o `requestContext` e o
    // namespace de memória continua sendo a Edge: se o navegador voltasse a mandá-los,
    // ele escolheria a thread, e escolher a thread é escolher a conversa de quem quiser.
    const f = responder({ text: "oi" });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await result.current.mutateAsync({
      texto: "ola",
      identidade: { telefone: "5541988149449", origem: "whatsapp-bot" },
    });

    const [nome, opts] = f.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(nome).toBe("mia-chat");
    expect(opts.body.messages).toEqual([{ role: "user", content: "ola" }]);
    expect(opts.body.telefone).toBe("5541988149449");
    expect(opts.body.origem).toBe("whatsapp-bot");
    expect(Object.keys(opts.body).sort()).toEqual(["messages", "origem", "telefone"]);
    expect(Object.keys(opts.body)).not.toContain("requestContext");
    expect(Object.keys(opts.body)).not.toContain("memory");
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
    const r = await result.current.mutateAsync({ texto: "x", identidade: { telefone: "5500000000000", origem: "webchat-bot" } });
    expect(r.tools).toEqual(["hub_list_locations", "consultar_preco"]);
  });

  it("resposta sem texto não vira string vazia em silêncio", async () => {
    responder({ text: "   " });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    const r = await result.current.mutateAsync({ texto: "x", identidade: { telefone: "5500000000000", origem: "webchat-bot" } });
    expect(r.reply).toContain("não respondeu");
  });

  it("mostra a mensagem que a Edge deu, e não o erro genérico do cliente", async () => {
    // "FunctionsHttpError" não ajuda ninguém. "Acesso restrito" diz o que aconteceu.
    responder(null, { context: { json: async () => ({ error: "Acesso restrito." }) } });
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await expect(result.current.mutateAsync({ texto: "x", identidade: { telefone: "5500000000000", origem: "webchat-bot" } })).rejects.toThrow(
      /Acesso restrito/,
    );
  });

  it("erro sem corpo ainda vira uma frase, nunca silêncio", async () => {
    responder(null, new Error("Failed to fetch"));
    const { result } = renderHook(() => useEnviarParaMia(), { wrapper });
    await waitFor(async () => {
      await expect(result.current.mutateAsync({ texto: "x", identidade: { telefone: "5500000000000", origem: "webchat-bot" } })).rejects.toThrow();
    });
  });
});

describe("botão de limpar", () => {
  it("some quando não há conversa: não existe o que limpar", () => {
    comPapel("hub_admin");
    render(<MiaTestWidget />, { wrapper });
    expect(screen.getByLabelText("Testar a Mia")).toBeTruthy();
  });

  it("manda a ação e o telefone, mas nunca o dono da thread", async () => {
    // O telefone vai porque cada número simulado tem a sua conversa. O `uid` não vai:
    // quem o deriva é a Edge, a partir do JWT, senão um admin apagaria a conversa de
    // outro testador mandando o id dele.
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { limpo: true }, error: null });
    const { result } = renderHook(() => useLimparConversaDaMia(), { wrapper });
    await result.current.mutateAsync({ telefone: "5541988149449", origem: "webchat-bot" });

    const [nome, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(nome).toBe("mia-chat");
    expect(opts.body).toEqual({ acao: "limpar", telefone: "5541988149449" });
    expect(JSON.stringify(opts.body)).not.toContain("uid");
  });

  it("falha da Edge vira mensagem, nunca silêncio", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: "Acesso restrito." }) } },
    });
    const { result } = renderHook(() => useLimparConversaDaMia(), { wrapper });
    await expect(
      result.current.mutateAsync({ telefone: "5500000000000", origem: "webchat-bot" }),
    ).rejects.toThrow(/Acesso restrito/);
  });
});
