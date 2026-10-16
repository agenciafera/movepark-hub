import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// `vi.hoisted` porque o `vi.mock` sobe acima de qualquer const.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

import { Anexo } from "./Anexo";
import type { AnexoDaFala } from "./api";
import { ESPERA_DA_TRANSCRICAO_MS } from "./inbox.logic";

const audio = (over: Partial<AnexoDaFala> = {}): AnexoDaFala => ({
  parte: 2,
  mime: "audio/ogg",
  tipo: "audio",
  nome: "",
  bytes: 30_000,
  transcricao: null,
  ...over,
});

function renderizar(anexo: AnexoDaFala, em?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Anexo threadId="th-1" messageId="msg-1" anexo={anexo} em={em} />
    </QueryClientProvider>,
  );
}

const pedidosDeTranscricao = () =>
  invoke.mock.calls.filter(
    (c) => (c as [string, { body: { acao: string } }])[1].body.acao === "transcrever",
  );

afterEach(() => {
  invoke.mockReset();
  vi.useRealTimers();
});

describe("a bolha do áudio", () => {
  it("mostra a transcrição sem clique e sem baixar o áudio", () => {
    renderizar(audio({ transcricao: "Quero uma vaga coberta na Abbapark" }));
    expect(screen.getByText("Transcrição")).toBeTruthy();
    expect(screen.getByText("Quero uma vaga coberta na Abbapark")).toBeTruthy();
    // Os bytes do áudio continuam por demanda: ninguém chamou a Edge.
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Áudio · 29 KB/ })).toBeTruthy();
  });

  it("áudio sem fala diz isso, em vez de um texto vazio", () => {
    renderizar(audio({ transcricao: "(áudio sem fala)" }));
    expect(screen.getByText("Áudio sem fala")).toBeTruthy();
  });

  it("recém-chegado espera a transcrição da chegada, sem pedir outra", () => {
    renderizar(audio(), new Date().toISOString());
    expect(screen.getByText("Transcrevendo…")).toBeTruthy();
    expect(pedidosDeTranscricao()).toHaveLength(0);
  });

  it("sem transcrição depois da espera, pede ao BeastBots e mostra o texto", async () => {
    invoke.mockResolvedValue({ data: { transcricao: "Cheguei no portão dois" }, error: null });
    const antigo = new Date(Date.now() - ESPERA_DA_TRANSCRICAO_MS - 1_000).toISOString();
    renderizar(audio(), antigo);

    expect(await screen.findByText("Cheguei no portão dois")).toBeTruthy();
    const corpo = (pedidosDeTranscricao()[0] as [string, { body: unknown }])[1].body;
    expect(corpo).toEqual({ acao: "transcrever", threadId: "th-1", messageId: "msg-1", parte: 2 });
  });

  it("quando a espera acaba, a tela pede sozinha", async () => {
    // Regressão possível: sem o relógio, a tela só reavaliava se a conversa mudasse, e um
    // áudio cuja transcrição falhou ficaria em "Transcrevendo…" para sempre.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invoke.mockResolvedValue({ data: { transcricao: "oi" }, error: null });
    renderizar(audio(), new Date().toISOString());
    expect(pedidosDeTranscricao()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(ESPERA_DA_TRANSCRICAO_MS + 100);
    expect(await screen.findByText("oi")).toBeTruthy();
    expect(pedidosDeTranscricao()).toHaveLength(1);
  });

  it("falha avisa e deixa tentar de novo", async () => {
    // O hook tenta duas vezes (503 do Gemini costuma passar em segundos), então as duas falham.
    invoke.mockResolvedValue({ data: null, error: new Error("502") });
    renderizar(audio(), "2026-10-01T00:00:00.000Z");
    expect(
      await screen.findByText(/Não consegui transcrever este áudio/, undefined, { timeout: 4_000 }),
    ).toBeTruthy();
    expect(pedidosDeTranscricao()).toHaveLength(2);

    invoke.mockResolvedValueOnce({ data: { transcricao: "agora foi" }, error: null });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("agora foi")).toBeTruthy();
  });

  it("backend sem o campo não mostra nada nem pede", () => {
    renderizar(audio({ transcricao: undefined }), "2026-10-01T00:00:00.000Z");
    expect(screen.queryByText("Transcrição")).toBeNull();
    expect(screen.queryByText("Transcrevendo…")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("imagem segue igual, sem bloco de transcrição", () => {
    invoke.mockResolvedValue({ data: { dados: "data:image/png;base64,AAAA", nome: "" }, error: null });
    renderizar(audio({ tipo: "imagem", mime: "image/png", transcricao: undefined }));
    expect(screen.queryByText("Transcrição")).toBeNull();
  });
});
