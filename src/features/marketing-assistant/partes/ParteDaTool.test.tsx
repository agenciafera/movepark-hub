import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ParteDaTool } from "./ParteDaTool";
import type { ParteDeTool, Proposta } from "../conversa.logic";

const decidir = vi.fn();
vi.mock("../api", () => ({
  useDecidirProposta: () => ({ mutate: decidir, isPending: false }),
}));

function desenhar(parte: Partial<ParteDeTool>, propostas: Proposta[] = []) {
  const p: ParteDeTool = { nome: "marketing_get_rfm", id: "c1", estado: "pronta", entrada: {}, saida: {}, erro: null, ...parte };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ParteDaTool parte={p} propostas={propostas} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const RESUMO_OK = {
  campanha: "Volta",
  segmento: "Sumidos",
  publico: 31,
  alcance_email: 30,
  alcance_whatsapp: 0,
  disparo_ligado: false,
  problemas: [],
};

describe("ParteDaTool", () => {
  it("enquanto roda, mostra o que está fazendo", () => {
    desenhar({ nome: "marketing_preview_segment", estado: "rodando" });
    expect(screen.getByText("Medindo o segmento…")).toBeInTheDocument();
  });

  it("erro aparece com o passo que falhou e a frase do servidor", () => {
    desenhar({ nome: "marketing_save_segment", estado: "erro", erro: "Segmento inválido." });
    expect(screen.getByText("Não conseguiu salvar o segmento: Segmento inválido.")).toBeInTheDocument();
  });

  it("prévia de segmento mostra total, alcance e a amostra", () => {
    desenhar({
      nome: "marketing_preview_segment",
      saida: {
        problems: [],
        preview: {
          total: 31,
          reachable_email: 30,
          reachable_whatsapp: 2,
          sample: [{ contact_key: "k1", doc: { email: "ana@ex.com", bookings_count: 3 } }],
        },
      },
    });
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("ana@ex.com")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reservas" })).toBeInTheDocument();
  });

  it("prévia com problema mostra o problema, sem tabela", () => {
    desenhar({ nome: "marketing_preview_segment", saida: { problems: ['Campo desconhecido "x".'], preview: null } });
    expect(screen.getByText('Campo desconhecido "x".')).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("gravação mostra o feito e o link para a tela", () => {
    desenhar({ nome: "marketing_save_campaign", saida: { campaign_id: "c-9", ready: true, problems: [] } });
    expect(screen.getByText("Salvou a campanha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir a campanha" })).toHaveAttribute("href", "/manager/marketing/campanhas/c-9");
  });

  it("e-mail vai num iframe sem script", () => {
    const { container } = desenhar({
      nome: "marketing_render_message",
      saida: { channel: "email", subject: "Sentimos sua falta", body: "<p>Oi</p><script>alert(1)</script>" },
    });
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(screen.getByText("Sentimos sua falta")).toBeInTheDocument();
  });

  it("proposta aberta oferece Confirmar e manda o id", () => {
    decidir.mockReset();
    desenhar({
      nome: "marketing_run_campaign",
      saida: { status: "proposta", proposta_id: "p-1", tool: "marketing_run_campaign", resumo: RESUMO_OK },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(decidir.mock.calls[0][0]).toEqual({ propostaId: "p-1", decisao: "confirmar" });
  });

  it("proposta já executada, vinda do histórico, mostra o resultado e nenhum botão", () => {
    desenhar(
      { nome: "marketing_run_campaign", saida: { status: "proposta", proposta_id: "p-1", tool: "marketing_run_campaign", resumo: {} } },
      [
        {
          id: "p-1",
          tool: "marketing_run_campaign",
          status: "executed",
          resumo: {},
          resultado: { resumo: "31 matrículas, 0 envios agora." },
          erro: null,
          expires_at: "",
        },
      ],
    );
    expect(screen.getByText("31 matrículas, 0 envios agora.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("proposta bloqueada não oferece Confirmar", () => {
    desenhar({
      nome: "marketing_run_campaign",
      saida: { status: "proposta", proposta_id: "p-2", tool: "marketing_run_campaign", resumo: { problemas: ["Falta o gatilho."] } },
    });
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument();
  });

  it("o resto vira tabela simples", () => {
    desenhar({ nome: "marketing_list_leads", saida: { leads: [{ nome: "Ana", status: "novo" }] } });
    expect(screen.getByRole("columnheader", { name: "nome" })).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });
});
