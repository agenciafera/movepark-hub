import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { edge } from "@/test/msw/supabase";
import { MarketingAssistantWidget } from "./MarketingAssistantWidget";
import { CHAVE_CONVERSA } from "./marketingAssistant.logic";

const CAMPANHA = "22222222-2222-2222-2222-222222222222";
const ABRIR = "Abrir o assistente da Automação";
const admin = () => ({ auth: mockAuth({ session: mockSession("hub_admin") }) });

const TURNO_COM_PROPOSTA = {
  resposta: "Montei a campanha. Confira o cartão.",
  ferramentas: [
    { nome: "marketing_save_campaign", ok: true },
    { nome: "marketing_run_campaign", ok: true },
  ],
  propostas: [
    {
      tool: "marketing_run_campaign",
      args: { campaign_id: CAMPANHA },
      resumo: {
        campanha: "Volta 90 dias",
        segmento: "Sumidos",
        publico: 31,
        alcance_email: 30,
        alcance_whatsapp: 0,
        disparo_ligado: false,
        problemas: [],
      },
    },
  ],
  gravou: true,
};

async function abrirEPedir(texto: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(ABRIR));
  await user.type(screen.getByLabelText("Mensagem para o assistente"), texto);
  await user.click(screen.getByLabelText("Enviar"));
  return user;
}

describe("MarketingAssistantWidget", () => {
  beforeEach(() => sessionStorage.removeItem(CHAVE_CONVERSA));

  it("não aparece fora da Automação", () => {
    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/bookings" });
    expect(screen.queryByLabelText(ABRIR)).toBeNull();
  });

  it("manda a conversa com a página aberta", async () => {
    const espiao = edge("marketing-assistant", {
      json: { resposta: "São 31 pessoas.", ferramentas: [{ nome: "marketing_get_rfm", ok: true }], propostas: [], gravou: false },
    });
    renderWithProviders(<MarketingAssistantWidget />, {
      ...admin(),
      route: `/manager/marketing/campanhas/${CAMPANHA}`,
    });
    await abrirEPedir("Quem sumiu?");

    expect(await screen.findByText("São 31 pessoas.")).toBeInTheDocument();
    expect(screen.getByText("consultou o RFM")).toBeInTheDocument();
    expect(espiao.ultimoBody).toEqual({
      mensagens: [{ papel: "usuario", texto: "Quem sumiu?" }],
      pagina: { caminho: `/manager/marketing/campanhas/${CAMPANHA}`, campaign_id: CAMPANHA },
    });
  });

  it("mostra o cartão de execução com o público e o estado da chave", async () => {
    edge("marketing-assistant", { json: TURNO_COM_PROPOSTA });
    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing" });
    await abrirEPedir("Monta a campanha de volta");

    expect(await screen.findByText("Executar a campanha")).toBeInTheDocument();
    expect(screen.getByText("Segmento Sumidos: 31 pessoas, 30 com e-mail e 0 com WhatsApp.")).toBeInTheDocument();
    expect(
      screen.getByText("Disparo real desligado: as mensagens ficam seguradas e ninguém recebe nada."),
    ).toBeInTheDocument();
  });

  it("Confirmar manda a tool e os argumentos da proposta", async () => {
    edge("marketing-assistant", { json: TURNO_COM_PROPOSTA });
    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing" });
    const user = await abrirEPedir("Monta a campanha de volta");
    await screen.findByText("Executar a campanha");

    const confirmacao = edge("marketing-assistant", {
      json: { resultado: { sent: 0, skipped: 31, suppressed: 0, failed: 0 } },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Feito: 0 enviadas, 31 seguradas, 0 bloqueadas.")).toBeInTheDocument();
    expect(confirmacao.ultimoBody).toEqual({
      acao: "confirmar",
      tool: "marketing_run_campaign",
      args: { campaign_id: CAMPANHA },
    });
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("Descartar não chama a Edge", async () => {
    const espiao = edge("marketing-assistant", { json: TURNO_COM_PROPOSTA });
    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing" });
    const user = await abrirEPedir("Monta a campanha de volta");
    await screen.findByText("Executar a campanha");

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByText("Descartado.")).toBeInTheDocument();
    expect(espiao.chamadas).toHaveLength(1);
  });

  it("fluxo com problema não oferece Confirmar", async () => {
    const turno = structuredClone(TURNO_COM_PROPOSTA);
    turno.propostas[0].resumo.problemas = ["E-mail sem assunto."] as never;
    edge("marketing-assistant", { json: turno });
    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing" });
    await abrirEPedir("Monta a campanha de volta");

    expect(await screen.findByText("O fluxo tem problema e não roda: E-mail sem assunto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("a conversa sobrevive à troca de página", async () => {
    edge("marketing-assistant", {
      json: { resposta: "São 31 pessoas.", ferramentas: [], propostas: [], gravou: false },
    });
    const primeira = renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing" });
    await abrirEPedir("Quem sumiu?");
    await screen.findByText("São 31 pessoas.");
    primeira.unmount();

    renderWithProviders(<MarketingAssistantWidget />, { ...admin(), route: "/manager/marketing/segmentos" });
    await userEvent.setup().click(screen.getByLabelText(ABRIR));
    await waitFor(() => expect(screen.getByText("São 31 pessoas.")).toBeInTheDocument());
  });
});
