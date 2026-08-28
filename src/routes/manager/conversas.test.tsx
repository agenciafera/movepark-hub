import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { ConversaAberta, ConversaDaLista } from "@/features/inbox/api";

// `vi.hoisted` porque o `vi.mock` sobe acima de qualquer const. As refs precisam ser
// estáveis: objeto novo a cada render dispara efeito de ressincronização em laço.
const { lista, paginas, aberta, carregando, marcar, assumir, devolver, responder } = vi.hoisted(() => ({
  lista: { current: [] as ConversaDaLista[] },
  paginas: { current: null as { conversas: ConversaDaLista[] }[] | null },
  aberta: { current: null as ConversaAberta | null },
  carregando: { current: false },
  marcar: vi.fn(),
  assumir: vi.fn(),
  devolver: vi.fn(),
  responder: vi.fn(),
}));

vi.mock("@/features/inbox/api", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useConversas: () => ({
    data: { pages: paginas.current ?? [{ conversas: lista.current, proximoCursor: null }] },
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useConversa: (id: string | null) => ({
    data: id && !carregando.current ? aberta.current : undefined,
    isLoading: !!id && carregando.current,
  }),
  useMarcarConversa: () => ({ mutate: marcar, isPending: false }),
  useAssumirConversa: () => ({ mutate: assumir, isPending: false }),
  useDevolverConversa: () => ({ mutate: devolver, isPending: false }),
  useResponderConversa: () => ({ mutate: responder, isPending: false }),
  // O anexo carrega sozinho; no teste de tela ele chega pronto.
  useAnexo: () => ({ data: { dados: "data:image/jpeg;base64,AAA", nome: "" }, isPending: false, isError: false }),
  useAnexoPublico: () => ({ data: undefined, isPending: false, isError: false }),
}));

// O canvas nao existe no happy-dom, e o desenho ja' tem teste proprio em
// conversaEmImagem.test.ts. Aqui o que importa e' o caminho ate' a area de transferencia.
vi.mock("@/features/inbox/conversaEmImagem", () => ({
  conversaEmImagem: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerConversas from "./conversas";

const linha = (over: Partial<ConversaDaLista> = {}): ConversaDaLista => ({
  id: "t-41",
  telefone: "5541988149449",
  origem: "whatsapp",
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
  paginas.current = null;
  carregando.current = false;
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

  it("a busca é do servidor, então a tela não filtra sozinha", () => {
    // Quem procura "voucher" espera achar em qualquer conversa, nao so' nas 30 que ja
    // estao na tela. O termo vai ao servidor; aqui so' mostramos o que ele devolve.
    lista.current = [
      linha({ id: "a", telefone: "5541988149449" }),
      linha({ id: "b", telefone: "5511987727182" }),
    ];
    renderWithProviders(<ManagerConversas />);
    fireEvent.change(screen.getByLabelText("Buscar conversa"), { target: { value: "zzz" } });
    expect(screen.getByText("(41) 98814-9449")).toBeTruthy();
    expect(screen.getByText("(11) 98772-7182")).toBeTruthy();
  });

  it("o balão diz se foi a Mia ou uma pessoa da equipe", () => {
    // Os dois baloes da esquerda se confundiam: quem abre a conversa amanha nao
    // sabia se aquela frase foi o robo ou um colega.
    lista.current = [linha({ id: "t-41" })];
    aberta.current = {
      threadId: "t-41",
      telefone: "5541988149449",
      lidaAte: null,
      assumidaPor: "uid",
      falas: [
        { id: "m1", papel: "agente", autor: "Mia", texto: "Posso ajudar?", em: "2026-08-27T20:00:00.000Z", anexos: [] },
        { id: "m2", papel: "agente", autor: "Kallef", texto: "Eu assumo daqui.", em: "2026-08-27T20:01:00.000Z", anexos: [] },
        { id: "m3", papel: "cliente", autor: "", texto: "ola", em: "2026-08-27T20:02:00.000Z", anexos: [] },
      ],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: /Conversa com/ })[0]);
    expect(screen.getByText("Mia")).toBeTruthy();
    expect(screen.getByText("Kallef")).toBeTruthy();
  });

  it("o cliente fica à esquerda e quem atende à direita", () => {
    // O arranjo do WhatsApp Web. A caixa e' lida por quem atende, e inverter faz a
    // pessoa ler a propria equipe como se fosse o cliente.
    lista.current = [linha({ id: "t-41" })];
    aberta.current = {
      threadId: "t-41",
      telefone: "5541988149449",
      lidaAte: null,
      assumidaPor: null,
      falas: [
        { id: "m1", papel: "cliente", autor: "", texto: "ola", em: "2026-08-27T20:00:00.000Z", anexos: [] },
        { id: "m2", papel: "agente", autor: "Mia", texto: "Posso ajudar? **Virapark**", em: "2026-08-27T20:01:00.000Z", anexos: [] },
      ],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: /Conversa com/ })[0]);

    const doCliente = screen.getByText("ola").closest("div.flex");
    const daMia = screen.getByText(/Posso ajudar\?/).closest("div.flex");
    expect(doCliente?.className).toContain("justify-start");
    expect(daMia?.className).toContain("justify-end");
    // O markdown segue quem FALA, e nao o lado: a Mia continua em negrito mesmo
    // depois de mudar de lado. Sem isso ela aparecia com `**Virapark**` cru.
    expect(screen.getByText("Virapark").tagName).toBe("STRONG");
    // E o roxo (a cor de quem escreve) fica com a Mia, nao com o cliente.
    expect(screen.getByText(/Posso ajudar\?/).closest(".bg-mp-primary")).toBeTruthy();
    expect(screen.getByText("ola").closest(".bg-mp-primary")).toBeNull();
  });

  it("a conversa carregando diz que está carregando", () => {
    // Um retangulo cinza claro num painel claro se parece com painel vazio: quem
    // clicou nao sabia se a conversa vinha ou se nao havia nada para ver.
    lista.current = [linha({ id: "t-41" })];
    carregando.current = true;
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: /Conversa com/ })[0]);
    expect(screen.getByText("Carregando a conversa…")).toBeTruthy();
    // E o cabecalho ja mostra o numero, que a lista sabe: dizer "sem numero" e' se
    // corrigir dois segundos depois, e cabecalho que se corrige faz duvidar do resto.
    expect(screen.getAllByText("(41) 98814-9449").length).toBeGreaterThan(1);
    // E nao a frase de conversa sem mensagem, que diria o contrario do que acontece.
    expect(screen.queryByText("Conversa sem mensagens")).toBeNull();
  });

  it("copiar leva a conversa inteira em texto, no formato do WhatsApp", async () => {
    const escrito: string[] = [];
    // `navigator.clipboard` so' tem getter no happy-dom; definir a propriedade e' o
    // unico jeito de espiar a copia.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t: string) => (escrito.push(t), Promise.resolve()) },
    });

    lista.current = [linha({ id: "t-41" })];
    aberta.current = {
      threadId: "t-41",
      telefone: "5541988149449",
      lidaAte: null,
      assumidaPor: null,
      falas: [
        { id: "m1", papel: "cliente", autor: "", texto: "ola", em: "2026-08-28T23:00:00.000Z", anexos: [] },
        { id: "m2", papel: "agente", autor: "Mia", texto: "Oi! Posso ajudar?", em: "2026-08-28T23:01:00.000Z", anexos: [] },
      ],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: /Conversa com/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Copiar conversa" }));

    await waitFor(() => expect(escrito.length).toBe(1));
    expect(escrito[0]).toContain("(41) 98814-9449: ola");
    expect(escrito[0]).toContain("Mia: Oi! Posso ajudar?");
    // Duas falas, duas linhas: nada de cabecalho inventado em volta.
    expect(escrito[0].split("\n").length).toBe(2);
  });

  it("copiar imagem põe um PNG na área de transferência", async () => {
    const itens: unknown[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: (i: unknown[]) => (itens.push(...i), Promise.resolve()) },
    });
    // `ClipboardItem` nao existe no happy-dom: sem ele o codigo cai no download.
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(public dados: Record<string, Blob>) {}
    };

    lista.current = [linha({ id: "t-41" })];
    aberta.current = {
      threadId: "t-41",
      telefone: "5541988149449",
      lidaAte: null,
      assumidaPor: null,
      falas: [
        { id: "m1", papel: "cliente", autor: "", texto: "ola", em: "2026-08-28T23:00:00.000Z", anexos: [] },
      ],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: /Conversa com/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Copiar imagem" }));

    await waitFor(() => expect(itens.length).toBe(1));
    expect((itens[0] as { dados: Record<string, Blob> }).dados["image/png"].type).toBe("image/png");
  });

  it("página sem lista não derruba a tela", () => {
    // Regressao: um backend antigo no ar devolvia pagina sem `conversas`, o
    // `flatMap` produzia `[undefined]` e a sidebar inteira do Manager caia.
    paginas.current = [{ conversas: undefined as unknown as ConversaDaLista[] }];
    renderWithProviders(<ManagerConversas />);
    expect(screen.getByText("Nenhuma conversa ainda")).toBeTruthy();
  });

  it("mostra de onde veio cada conversa", () => {
    lista.current = [
      linha({ id: "a", origem: "whatsapp" }),
      linha({ id: "b", telefone: "5511987727182", origem: "webchat" }),
    ];
    renderWithProviders(<ManagerConversas />);
    expect(screen.getByText("Webchat")).toBeTruthy();
    expect(screen.getAllByText("WhatsApp").length).toBeGreaterThan(0);
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
        { id: "m1", papel: "cliente", autor: "", texto: "quero reservar", em: "2026-08-27T20:00:00.000Z", anexos: [] },
        { id: "m2", papel: "agente", autor: "Mia", texto: "Para quais datas?", em: "2026-08-27T20:00:10.000Z", anexos: [] },
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

    // Com filtro ativo e nada casando, a frase muda: "nada com esse recorte" convida a
    // limpar o filtro; "nenhuma conversa ainda" convidaria a esperar.
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getAllByRole("button", { name: "Não lidas" })[1]);
    expect(screen.getAllByText("Nada com esse recorte").length).toBeGreaterThan(0);
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

  it("anexo vira imagem de verdade, com link para baixar", async () => {
    lista.current = [linha()];
    aberta.current = {
      threadId: "t-41", telefone: "5541988149449", lidaAte: null, assumidaPor: null,
      falas: [{ id: "m1", papel: "cliente", autor: "", texto: "", em: "x", anexos: [
        { parte: 2, mime: "image/jpeg", tipo: "imagem", nome: "", bytes: 1024 },
      ] }],
    };
    renderWithProviders(<ManagerConversas />);
    fireEvent.click(screen.getByLabelText("Conversa com (41) 98814-9449"));
    await waitFor(() =>
      expect(screen.getByAltText("Imagem enviada na conversa")).toBeTruthy(),
    );
    // Baixar sai do proprio `data:`: nao criamos URL publica para midia de cliente.
    const baixar = screen.getByText(/Baixar/).closest("a") as HTMLAnchorElement;
    expect(baixar.getAttribute("href")?.startsWith("data:")).toBe(true);
    expect(baixar.hasAttribute("download")).toBe(true);
  });
});
