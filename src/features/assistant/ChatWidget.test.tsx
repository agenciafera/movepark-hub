import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ChatWidget } from "./ChatWidget";

const h = vi.hoisted(() => ({
  config: { enabled: true, model: "gemini-2.5-flash" } as { enabled: boolean; model: string },
  mutateAsync: vi.fn(),
}));

vi.mock("./api", () => ({
  useChatConfig: () => ({ data: h.config }),
  useSendChat: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

describe("ChatWidget", () => {
  beforeEach(() => {
    h.config = { enabled: true, model: "gemini-2.5-flash" };
    h.mutateAsync.mockReset();
  });

  it("não monta quando o assistente está desativado", () => {
    h.config = { enabled: false, model: "" };
    renderWithProviders(<ChatWidget />);
    expect(screen.queryByLabelText("Abrir assistente")).toBeNull();
  });

  it("abre, envia uma mensagem e mostra a resposta do assistente", async () => {
    h.mutateAsync.mockResolvedValue({ reply: "Achei 3 estacionamentos perto de GRU.", used_tools: ["search_parking"] });
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);

    await user.click(screen.getByLabelText("Abrir assistente"));
    await user.type(screen.getByLabelText("Mensagem"), "estacionamento em GRU");
    await user.click(screen.getByLabelText("Enviar"));

    // a mensagem do usuário aparece
    expect(screen.getByText("estacionamento em GRU")).toBeInTheDocument();
    // a resposta do assistente aparece
    await waitFor(() => expect(screen.getByText("Achei 3 estacionamentos perto de GRU.")).toBeInTheDocument());
    // enviou o histórico ao edge
    expect(h.mutateAsync).toHaveBeenCalledWith([{ role: "user", text: "estacionamento em GRU" }]);
  });

  it("mostra o botão Entrar quando o assistente pede login (usuário deslogado)", async () => {
    h.mutateAsync.mockResolvedValue({
      reply: "Para reservar, você precisa entrar.",
      used_tools: ["create_booking"],
      login_required: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);

    await user.click(screen.getByLabelText("Abrir assistente"));
    await user.type(screen.getByLabelText("Mensagem"), "quero reservar");
    await user.click(screen.getByLabelText("Enviar"));

    const btn = await screen.findByRole("link", { name: /entrar para reservar/i });
    expect(btn).toHaveAttribute("href", expect.stringContaining("/login?next="));
  });

  it("renderiza markdown do assistente (negrito e lista) sem asterisco cru", async () => {
    h.mutateAsync.mockResolvedValue({
      reply: "Para confirmar:\n* **Estacionamento:** Virapark\n* **Valor:** R$ 36,00",
      used_tools: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);

    await user.click(screen.getByLabelText("Abrir assistente"));
    await user.type(screen.getByLabelText("Mensagem"), "confirma");
    await user.click(screen.getByLabelText("Enviar"));

    // negrito virou <strong>, não texto com **
    const strong = await screen.findByText("Estacionamento:");
    expect(strong.tagName).toBe("STRONG");
    // vira itens de lista
    expect(screen.getAllByRole("listitem").length).toBe(2);
    // nenhum asterisco cru na tela
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("não mostra o botão Entrar quando não é preciso login", async () => {
    h.mutateAsync.mockResolvedValue({ reply: "Achei 2 opções.", used_tools: ["search_parking"] });
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);

    await user.click(screen.getByLabelText("Abrir assistente"));
    await user.type(screen.getByLabelText("Mensagem"), "buscar GRU");
    await user.click(screen.getByLabelText("Enviar"));

    await waitFor(() => expect(screen.getByText("Achei 2 opções.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /entrar para reservar/i })).toBeNull();
  });
});
