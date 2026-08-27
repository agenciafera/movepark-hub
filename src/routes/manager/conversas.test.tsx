import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { ConversaAberta, ConversaDaLista } from "@/features/inbox/api";

// `vi.hoisted` porque o `vi.mock` sobe acima de qualquer const. As refs precisam ser
// estáveis: objeto novo a cada render dispara efeito de ressincronização em laço.
const { lista, aberta, marcar, assumir, devolver, responder } = vi.hoisted(() => ({
  lista: { current: [] as ConversaDaLista[] },
  aberta: { current: null as ConversaAberta | null },
  marcar: vi.fn(),
  assumir: vi.fn(),
  devolver: vi.fn(),
  responder: vi.fn(),
}));

vi.mock("@/features/inbox/api", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useConversas: () => ({ data: lista.current, isLoading: false }),
  useConversa: (id: string | null) => ({ data: id ? aberta.current : undefined, isLoading: false }),
  useMarcarConversa: () => ({ mutate: marcar, isPending: false }),
  useAssumirConversa: () => ({ mutate: assumir, isPending: false }),
  useDevolverConversa: () => ({ mutate: devolver, isPending: false }),
  useResponderConversa: () => ({ mutate: responder, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerConversas from "./conversas";

const linha = (over: Partial<ConversaDaLista> = {}): ConversaDaLista => ({
  id: "t-41",
  telefone: "5541988149449",
  titulo: "whatsapp conversation",
  ultima_em: "2026-08-27T20:00:00.000Z",
  ultimo_papel: "signal",
  ultimo_texto: "quero reservar no Virapark",
  total: 4,
  lida_ate: null,
  assumida_por: null,
  assumida_em: null,
  ...over,
});

afterEach(() => {
  marcar.mockReset();
  assumir.mockReset();
  devolver.mockReset();
  responder.mockReset();
  lista.current = [];
  aberta.current = null;
});

describe("caixa de entrada", () => {
  it("mostra o telefone formatado, não o número cru do WhatsApp", () => {
    lista.current = [linha()];
    renderWithProviders(<ManagerConversas />);
    expect(screen.getByText("(41) 98814-9449")).toBeTruthy();
    expect(screen.queryByText("5541988149449")).toBeNull();
  });

  it("conta as não lidas no cabeçalho", () => {
    lista.current = [linha({ id: "a" }), linha({ id: "b", ultimo_papel: "assistant" })];
    renderWithProviders(<ManagerConversas />);
    expect(screen.getByText("1 não lida")).toBeTruthy();
  });

  it("filtra pelas não lidas", () => {
    lista.current = [
      linha({ id: "a", telefone: "5541988149449" }),
      linha({ id: "b", telefone: "5511987727182", ultimo_papel: "assistant" }),
    ];
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByRole("button", { name: "Não lidas" }));
    expect(screen.queryByText("(11) 98772-7182")).toBeNull();
    expect(screen.getByText("(41) 98814-9449")).toBeTruthy();
  });

  it("busca por telefone mesmo digitado com formatação", () => {
    lista.current = [
      linha({ id: "a", telefone: "5541988149449" }),
      linha({ id: "b", telefone: "5511987727182" }),
    ];
    renderWithProviders(<ManagerConversas />);
    fireEvent.change(screen.getByLabelText("Buscar conversa"), { target: { value: "(11) 98772" } });
    expect(screen.getByText("(11) 98772-7182")).toBeTruthy();
    expect(screen.queryByText("(41) 98814-9449")).toBeNull();
  });

  it("abrir uma conversa não lida marca como lida, sem passo manual", () => {
    lista.current = [linha()];
    aberta.current = { threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: null, falas: [] };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    expect(marcar).toHaveBeenCalledWith({ threadId: "t-41", lida: true });
  });

  it("abrir uma conversa já lida não marca de novo", () => {
    // Sem isto, cada abertura escreveria no banco à toa.
    lista.current = [linha({ lida_ate: "2026-08-27T21:00:00.000Z" })];
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    expect(marcar).not.toHaveBeenCalled();
  });

  it("mostra as falas dos dois lados quando a conversa abre", async () => {
    lista.current = [linha()];
    aberta.current = {
      threadId: "t-41",
      telefone: "5541988149449",
      lidaAte: null,
      assumidaPor: null,
      falas: [
        { papel: "cliente", texto: "quero reservar", em: "2026-08-27T20:00:00.000Z" },
        { papel: "agente", texto: "Para quais datas?", em: "2026-08-27T20:00:10.000Z" },
      ],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    await waitFor(() => expect(screen.getByText("Para quais datas?")).toBeTruthy());
    expect(screen.getByText("quero reservar")).toBeTruthy();
  });

  it("diz quem está respondendo: a Mia ou a equipe", async () => {
    lista.current = [linha({ assumida_por: "uid-1" })];
    aberta.current = {
      threadId: "t-41", telefone: "5541988149449", lidaAte: null,
      assumidaPor: "uid-1", falas: [],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    await waitFor(() =>
      expect(screen.getByText(/Assumida pela equipe: a Mia está em silêncio/)).toBeTruthy(),
    );
  });

  it("vazio por filtro fala diferente de vazio por falta de conversa", () => {
    renderWithProviders(<ManagerConversas />);
    expect(screen.getByText("Nenhuma conversa ainda")).toBeTruthy();

    lista.current = [linha()];
    const { rerender: _r } = renderWithProviders(<ManagerConversas />);
    fireEvent.change(screen.getAllByLabelText("Buscar conversa")[1], {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nada com esse recorte")).toBeTruthy();
  });
  it("não deixa escrever antes de assumir", async () => {
    // Responder sem assumir deixaria a Mia e a pessoa falando por cima uma da outra.
    lista.current = [linha()];
    aberta.current = { threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: null, falas: [] };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    await waitFor(() => expect(screen.getByText(/Assuma a conversa para escrever/)).toBeTruthy());
    expect(screen.queryByLabelText("Resposta para o cliente")).toBeNull();
  });

  it("assume, e o botão passa a oferecer devolver", async () => {
    lista.current = [linha()];
    aberta.current = { threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: null, falas: [] };
    const { rerender } = renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    fireEvent.click(await screen.findByRole("button", { name: /Assumir/ }));
    expect(assumir).toHaveBeenCalledWith({ threadId: "t-41" }, expect.anything());

    // Com a conversa assumida, o mesmo lugar devolve.
    aberta.current = { ...aberta.current!, assumidaPor: "uid-1" };
    rerender(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    expect(await screen.findByRole("button", { name: /Devolver/ })).toBeTruthy();
  });

  it("envia a resposta e limpa o campo", async () => {
    lista.current = [linha()];
    aberta.current = { threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: "uid-1", falas: [] };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    const campo = await screen.findByLabelText("Resposta para o cliente");
    fireEvent.change(campo, { target: { value: "Aqui é a equipe" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    expect(responder).toHaveBeenCalledWith(
      { threadId: "t-41", texto: "Aqui é a equipe" },
      expect.anything(),
    );
  });

  it("não envia mensagem vazia", async () => {
    lista.current = [linha()];
    aberta.current = { threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: "uid-1", falas: [] };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    const botao = (await screen.findByLabelText("Enviar")) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });

  it("anexo aparece como frase, não como marcador de integração", async () => {
    lista.current = [linha()];
    aberta.current = {
      threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: null,
      falas: [{ papel: "cliente", texto: "\\[Image]\n[Attached image/jpeg file]", em: "x" }],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    await waitFor(() => expect(screen.getByText("(imagem)")).toBeTruthy());
    expect(screen.queryByText(/Attached image/)).toBeNull();
  });
});
