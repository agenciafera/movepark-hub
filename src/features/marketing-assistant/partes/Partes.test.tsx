import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { PassosDoAgente } from "./PassosDoAgente";
import { VisualDaTool } from "./VisualDaTool";
import type { ParteDeTool } from "../conversa.logic";

const decidir = vi.fn();
vi.mock("../api", () => ({
  useDecidirProposta: () => ({ mutate: decidir, isPending: false }),
}));

const embrulho = (no: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{no}</MemoryRouter>
    </QueryClientProvider>,
  );

const parte = (p: Partial<ParteDeTool>): ParteDeTool => ({
  nome: "marketing_get_rfm",
  id: Math.random().toString(),
  estado: "pronta",
  entrada: {},
  saida: {},
  erro: null,
  ...p,
});

const RESUMO_OK = {
  campanha: "Volta",
  segmento: "Sumidos",
  publico: 31,
  alcance_email: 30,
  alcance_whatsapp: 0,
  disparo_ligado: false,
  problemas: [],
};

describe("PassosDoAgente", () => {
  it("enquanto roda, mostra só o passo da vez", () => {
    embrulho(
      <PassosDoAgente
        passos={[parte({ nome: "marketing_list_locations" }), parte({ nome: "marketing_preview_segment", estado: "rodando" })]}
        propostas={[]}
      />,
    );
    expect(screen.getByText("Medindo o segmento…")).toBeInTheDocument();
    expect(screen.queryByText("Listou as unidades")).toBeNull();
  });

  it("quando termina, fica recolhido e abre a lista no clique", () => {
    embrulho(
      <PassosDoAgente
        passos={[parte({ nome: "marketing_list_locations", saida: { unidades: [{ id: "x" }] } }), parte({ nome: "marketing_list_leads" })]}
        propostas={[]}
      />,
    );
    expect(screen.queryByText("Listou as unidades")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver os 2 passos" }));
    expect(screen.getByText("Listou as unidades")).toBeInTheDocument();
    // Consulta de bastidor não oferece dado nenhum, nem id.
    expect(screen.queryByRole("button", { name: "Ver" })).toBeNull();
    expect(screen.queryByText("x")).toBeNull();
  });

  it("gráfico fica a um clique dentro do passo", () => {
    embrulho(<PassosDoAgente passos={[parte({ nome: "marketing_get_campaign", saida: { campanha: { name: "Volta 90" }, matriculas: {} } })]} propostas={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver o passo" }));
    expect(screen.queryByText("Volta 90")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("Volta 90")).toBeInTheDocument();
  });

  it("passo que falhou diz o que não conseguiu e por quê", () => {
    embrulho(<PassosDoAgente passos={[parte({ nome: "marketing_save_segment", estado: "erro", erro: "Segmento inválido." })]} propostas={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver o passo" }));
    expect(screen.getByText("Não conseguiu salvar o segmento: Segmento inválido.")).toBeInTheDocument();
  });
});

describe("VisualDaTool", () => {
  it("segmento mostra os números e deixa a amostra a um clique", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
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
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("pessoas no segmento")).toBeInTheDocument();
    expect(screen.queryByText("ana@ex.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver uma amostra" }));
    expect(screen.getByText("ana@ex.com")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reservas" })).toBeInTheDocument();
  });

  it("segmento com problema mostra o problema", () => {
    embrulho(
      <VisualDaTool parte={parte({ nome: "marketing_preview_segment", saida: { problems: ['Campo desconhecido "x".'], preview: null } })} propostas={[]} />,
    );
    expect(screen.getByText('Campo desconhecido "x".')).toBeInTheDocument();
  });

  it("gravação mostra o feito e o link para a tela", () => {
    embrulho(<VisualDaTool parte={parte({ nome: "marketing_save_campaign", saida: { campaign_id: "c-9" } })} propostas={[]} />);
    expect(screen.getByText("Salvou a campanha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir a campanha" })).toHaveAttribute("href", "/manager/marketing/campanhas/c-9");
  });

  it("e-mail vai num iframe sem script", () => {
    const { container } = embrulho(
      <VisualDaTool
        parte={parte({ nome: "marketing_render_message", saida: { channel: "email", subject: "Sentimos sua falta", body: "<script>alert(1)</script>" } })}
        propostas={[]}
      />,
    );
    expect(container.querySelector("iframe")!.getAttribute("sandbox")).toBe("");
    expect(screen.getByText("Sentimos sua falta")).toBeInTheDocument();
  });

  it("proposta aberta oferece Confirmar e manda o id", () => {
    decidir.mockReset();
    embrulho(
      <VisualDaTool
        parte={parte({ nome: "marketing_run_campaign", saida: { status: "proposta", proposta_id: "p-1", tool: "marketing_run_campaign", resumo: RESUMO_OK } })}
        propostas={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(decidir.mock.calls[0][0]).toEqual({ propostaId: "p-1", decisao: "confirmar" });
  });

  it("proposta já executada, vinda do histórico, mostra o resultado e nenhum botão", () => {
    embrulho(
      <VisualDaTool
        parte={parte({ nome: "marketing_run_campaign", saida: { status: "proposta", proposta_id: "p-1", tool: "marketing_run_campaign", resumo: {} } })}
        propostas={[
          { id: "p-1", tool: "marketing_run_campaign", status: "executed", resumo: {}, resultado: { resumo: "31 matrículas, 0 envios agora." }, erro: null, expires_at: "" },
        ]}
      />,
    );
    expect(screen.getByText("31 matrículas, 0 envios agora.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("proposta bloqueada não oferece Confirmar", () => {
    embrulho(
      <VisualDaTool
        parte={parte({ nome: "marketing_run_campaign", saida: { status: "proposta", proposta_id: "p-2", tool: "marketing_run_campaign", resumo: { problemas: ["Falta o gatilho."] } } })}
        propostas={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument();
  });

  it("consulta de bastidor não desenha nada", () => {
    const { container } = embrulho(<VisualDaTool parte={parte({ nome: "marketing_list_leads", saida: { leads: [{ id: "x" }] } })} propostas={[]} />);
    expect(container.textContent).toBe("");
  });

  it("oportunidades mostram o público e o botão manda o pedido", () => {
    const onPedir = vi.fn();
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_opportunities",
          saida: {
            data: "2026-11-27",
            oportunidades: [
              {
                chave: "segunda_compra",
                titulo: "Voltou de viagem nos últimos 3 dias",
                por_que: "Fez a primeira viagem com a Movepark e ainda não marcou a próxima.",
                publico: 14,
                alcance_email: 13,
                ticket_medio: 172.4,
                pedido: "Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias",
              },
            ],
          },
        })}
        propostas={[]}
        onPedir={onPedir}
      />,
    );
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Voltou de viagem nos últimos 3 dias")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Montar esse público" }));
    expect(onPedir).toHaveBeenCalledWith("Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias");
  });

  it("distribuição mostra cada valor com pessoas e percentual", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_breakdown",
          saida: { dimensao: "tarifa", total: 194, itens: [{ valor: "basica", rotulo: "Básica", pessoas: 115, percentual: 59.3 }] },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("Por tarifa")).toBeInTheDocument();
    expect(screen.getByText("Básica")).toBeInTheDocument();
    expect(screen.getByText("115 (59,3%)")).toBeInTheDocument();
  });

  it("calendário mostra a data, o nome e a janela", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_calendar",
          saida: {
            hoje: "2026-11-27",
            datas: [{ nome: "Natal", data: "2026-12-25", tipo: "feriado", aproximada: false, janela_de: "2026-12-18", janela_ate: "2026-12-22", abre_em_dias: 21 }],
          },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("25/12")).toBeInTheDocument();
    expect(screen.getByText("Enviar de 18/12 a 22/12, abre em 21 dias")).toBeInTheDocument();
  });

  it("resultado sem execução diz que não há o que medir", () => {
    embrulho(
      <VisualDaTool parte={parte({ nome: "marketing_measure_campaign", saida: { campanha: "Volta", executada: false } })} propostas={[]} />,
    );
    expect(screen.getByText("A campanha Volta ainda não rodou, então não há resultado para medir.")).toBeInTheDocument();
  });

  it("resultado executado mostra antes, depois e o aviso", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_measure_campaign",
          saida: {
            campanha: "Volta",
            executada: true,
            janela_dias: 30,
            matriculados: 31,
            mensagens_enviadas: 28,
            janela_completa: true,
            antes: { reservas: 2, receita: 340 },
            depois: { reservas: 5, receita: 910 },
            aviso: "Comparação, não prova: a ferramenta não tem grupo de controle.",
          },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("+150%")).toBeInTheDocument();
    expect(screen.getByText("Comparação, não prova: a ferramenta não tem grupo de controle.")).toBeInTheDocument();
  });
});
