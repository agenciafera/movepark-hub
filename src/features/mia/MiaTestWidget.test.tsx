import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as auth from "@/auth/context";
import { MiaTestWidget } from "./MiaTestWidget";
import { identidadeDeTeste, useEnviarParaMia } from "./api";
import * as api from "./api";

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

afterEach(() => vi.restoreAllMocks());

describe("bolinha de teste da Mia", () => {
  it("não aparece para quem não é hub_admin", () => {
    comPapel("company_operator");
    vi.spyOn(api, "miaConfigurada").mockReturnValue(true);
    render(<MiaTestWidget />, { wrapper });
    expect(screen.queryByLabelText("Testar a Mia")).toBeNull();
  });

  it("não aparece sem a Mia configurada, em vez de virar botão que só erra", () => {
    comPapel("hub_admin");
    vi.spyOn(api, "miaConfigurada").mockReturnValue(false);
    render(<MiaTestWidget />, { wrapper });
    expect(screen.queryByLabelText("Testar a Mia")).toBeNull();
  });

  it("aparece para hub_admin com a Mia configurada", () => {
    comPapel("hub_admin");
    vi.spyOn(api, "miaConfigurada").mockReturnValue(true);
    render(<MiaTestWidget />, { wrapper });
    expect(screen.getByLabelText("Testar a Mia")).toBeTruthy();
  });
});

describe("as tools ficam fora do texto do agente", () => {
  it("a resposta guardada é exatamente o que o cliente leria", async () => {
    // A primeira versão concatenava `_tools: ..._` na fala. Num teste isso engana:
    // o que você lê deixa de ser o que o cliente leria.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ text: "Vaga coberta custa R$ 144,50.", steps: [{ toolCalls: [{ payload: { toolName: "consultar_preco" } }] }] }),
      ) as never,
    );
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    const r = await result.current.mutateAsync([{ role: "user", text: "x" }]);
    expect(r.reply).toBe("Vaga coberta custa R$ 144,50.");
    expect(r.reply).not.toContain("tools");
    expect(r.tools).toEqual(["consultar_preco"]);
  });
});

describe("identidade de teste", () => {
  it("NÃO usa telefone real, porque a Mia trata o número como prova de posse", () => {
    // D43: o telefone da conversa é o que autoriza consultar reserva. Um número real
    // aqui devolveria a reserva daquela pessoa, com placa e voucher, dentro do
    // Backoffice.
    expect(identidadeDeTeste("u1", "Kallef").requestContext["movepark.customerPhone"]).toBe(
      "5500000000000",
    );
  });

  it("usa uma das origens que o white-label aceita", () => {
    // O WL só conhece reserva-online, whatsapp-bot e webchat-bot, e não muda do nosso
    // lado. A bolinha fecha reserva de verdade, entao mandar valor fora dessa lista
    // faria a reserva falhar no parceiro em vez de no nosso código.
    expect(["reserva-online", "whatsapp-bot", "webchat-bot"]).toContain(
      identidadeDeTeste("u1", null).requestContext["movepark.origin"],
    );
  });

  it("separa a memória por usuário, para dois testadores não dividirem a conversa", () => {
    expect(identidadeDeTeste("u1", null).memory.thread).not.toBe(
      identidadeDeTeste("u2", null).memory.thread,
    );
  });

  it("respeita o prefixo que o guarda de namespace do BeastBots exige", () => {
    const { memory } = identidadeDeTeste("u1", null);
    expect(memory.resource.startsWith("movepark-hub:")).toBe(true);
    expect(memory.thread.startsWith("movepark-hub:")).toBe(true);
  });
});

describe("useEnviarParaMia", () => {
  const responder = (body: unknown, status = 200) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status }) as never,
    );

  it("manda o histórico no formato do Mastra, com contexto e memória", async () => {
    const f = responder({ text: "oi" });
    const { result } = renderHook(() => useEnviarParaMia("u1", "Kallef"), { wrapper });
    await result.current.mutateAsync([{ role: "user", text: "ola" }]);

    const corpo = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    // `model` é o nome do papel no nosso estado; o Mastra espera `assistant`.
    expect(corpo.messages).toEqual([{ role: "user", content: "ola" }]);
    expect(corpo.requestContext["movepark.customerName"]).toBe("Kallef");
    expect(corpo.memory.thread).toBe("movepark-hub:manager:u1:main");
  });

  it("traduz o papel `model` para `assistant`", async () => {
    const f = responder({ text: "ok" });
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    await result.current.mutateAsync([
      { role: "user", text: "a" },
      { role: "model", text: "b" },
    ]);
    const corpo = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });

  it("extrai as tools chamadas, que é metade do valor de testar aqui", async () => {
    responder({
      text: "resposta",
      steps: [
        { toolCalls: [{ payload: { toolName: "hub_list_locations" } }] },
        { toolCalls: [{ payload: { toolName: "consultar_preco" } }] },
      ],
    });
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    const r = await result.current.mutateAsync([{ role: "user", text: "x" }]);
    expect(r.tools).toEqual(["hub_list_locations", "consultar_preco"]);
  });

  it("resposta sem texto não vira string vazia em silêncio", async () => {
    responder({ text: "   " });
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    const r = await result.current.mutateAsync([{ role: "user", text: "x" }]);
    expect(r.reply).toContain("não respondeu");
  });

  it("401 explica a causa real, que é o token do Mastra fora do navegador", async () => {
    responder({}, 401);
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    await expect(result.current.mutateAsync([{ role: "user", text: "x" }])).rejects.toThrow(/401/);
  });

  it("erro de rede diz onde ela deveria estar rodando", async () => {
    responder({}, 502);
    const { result } = renderHook(() => useEnviarParaMia("u1", null), { wrapper });
    await waitFor(async () => {
      await expect(result.current.mutateAsync([{ role: "user", text: "x" }])).rejects.toThrow(/502/);
    });
  });
});
