import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Conversa } from "./Conversa";

const enviar = vi.fn();
let estado: { messages: unknown[]; status: string; error?: Error } = { messages: [], status: "ready" };
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({ ...estado, sendMessage: enviar, stop: vi.fn() }),
}));
vi.mock("./api", () => ({
  criarTransporte: () => ({}),
  useDecidirProposta: () => ({ mutate: vi.fn(), isPending: false }),
}));

function desenhar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Conversa conversaId="conv-1" inicial={[]} propostas={[]} onTurnoTerminou={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Conversa", () => {
  it("vazia, convida e oferece sugestões que enviam", () => {
    estado = { messages: [], status: "ready" };
    enviar.mockReset();
    desenhar();
    expect(screen.getByText("Peça em uma frase. Eu consulto a base e deixo tudo pronto para você revisar.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /segmento|RFM|campanha/i })[0]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("envia o texto digitado e limpa a caixa", () => {
    estado = { messages: [], status: "ready" };
    enviar.mockReset();
    desenhar();
    const caixa = screen.getByRole("textbox", { name: "Mensagem para o assistente" });
    fireEvent.change(caixa, { target: { value: "Quem sumiu?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(enviar).toHaveBeenCalledWith({ text: "Quem sumiu?" });
    expect((caixa as HTMLTextAreaElement).value).toBe("");
  });

  it("desenha texto do assistente e a tool no meio da resposta", () => {
    estado = {
      status: "ready",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Mede quem sumiu" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "tool-marketing_preview_segment", toolCallId: "c1", state: "input-available", input: {} },
            { type: "text", text: "Estou medindo." },
          ],
        },
      ],
    };
    desenhar();
    expect(screen.getByText("Mede quem sumiu")).toBeInTheDocument();
    expect(screen.getByText("Medindo o segmento…")).toBeInTheDocument();
    expect(screen.getByText("Estou medindo.")).toBeInTheDocument();
  });

  it("título, linha e crase do modelo não aparecem crus", () => {
    estado = {
      status: "ready",
      messages: [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "### Diagnóstico\n---\nUse `abandoned`." }] }],
    };
    const { container } = desenhar();
    expect(container.textContent).not.toMatch(/###|---|`/);
    expect(screen.getByText("Diagnóstico")).toBeInTheDocument();
  });

  it("não deixa enviar enquanto responde", () => {
    estado = { messages: [], status: "streaming" };
    desenhar();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("queda no meio mostra o aviso", () => {
    estado = { messages: [], status: "error", error: new Error("x") };
    desenhar();
    expect(screen.getByText("A resposta parou no meio. Tente de novo.")).toBeInTheDocument();
  });
});
