import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, renderWithProviders } from "@/test/utils";
import { OperatorAssistantWidget } from "./OperatorAssistantWidget";

const h = vi.hoisted(() => ({
  historico: { data: { falas: [], cartoes: [] }, isLoading: false, dataUpdatedAt: 1 },
  enviar: vi.fn(),
  confirmar: vi.fn(),
  descartar: vi.fn(),
}));

const comEmpresa = () => ({ auth: mockAuth({ scopedCompanyId: "empresa-1", effectiveCompanyIds: ["empresa-1"] }) });
vi.mock("./api", () => ({
  novoId: (() => {
    let n = 0;
    return () => `t-${++n}`;
  })(),
  // Objeto estável, como o do React Query.
  useHistoricoDoAssistente: () => h.historico,
  useEnviarAoAssistente: () => ({ mutateAsync: h.enviar, isPending: false }),
  useNovaConversa: () => ({ mutate: vi.fn(), isPending: false }),
  useConfirmarAcao: () => ({ mutateAsync: h.confirmar }),
  useDescartarAcao: () => ({ mutate: h.descartar }),
}));

const CARTAO = {
  id: "a1",
  kind: "change_dates",
  summary: "Alterar a reserva MP-ABC123 para entrada 20/11 e saída 23/11 e estornar R$ 80,00 ao cliente.",
  effect_cents: -8000,
  status: "proposed",
  expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  result: null,
  error: null,
  booking_code: "MP-ABC123",
};

describe("OperatorAssistantWidget", () => {
  beforeEach(() => {
    h.enviar.mockReset();
    h.confirmar.mockReset();
    h.descartar.mockReset();
  });

  it("não aparece sem empresa", () => {
    renderWithProviders(<OperatorAssistantWidget />, { auth: mockAuth() });
    expect(screen.queryByLabelText("Abrir a Mia, assistente da operação")).toBeNull();
  });

  it("avisa que a conversa é registrada e oferece atalhos", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperatorAssistantWidget />, comEmpresa());
    await user.click(screen.getByLabelText("Abrir a Mia, assistente da operação"));
    expect(screen.getByText(/fica registrada/)).toBeTruthy();
    expect(screen.getByText(/voltar 2 dias antes/)).toBeTruthy();
  });

  it("pergunta, mostra a resposta, a mensagem para copiar e o cartão; nada acontece sem Confirmar", async () => {
    h.enviar.mockResolvedValue({
      reply: "Dá para encurtar e devolver a diferença.\n\n> O estorno de R$ 80,00 volta no seu PIX.",
      used_tools: ["get_booking_situation", "quote_date_change", "propose_booking_action"],
      actions: [CARTAO],
      conversation_id: "c1",
    });
    h.confirmar.mockResolvedValue({ status: "executed", resumo: "Datas alteradas e diferença estornada ao cliente.", pix: null });

    const user = userEvent.setup();
    renderWithProviders(<OperatorAssistantWidget />, comEmpresa());
    await user.click(screen.getByLabelText("Abrir a Mia, assistente da operação"));
    await user.type(screen.getByLabelText("Mensagem para a Mia"), "cliente volta 2 dias antes");
    await user.click(screen.getByLabelText("Enviar"));

    await waitFor(() => expect(screen.getByText("Estorno de R$ 80,00 ao cliente")).toBeTruthy());
    expect(h.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "empresa-1", mensagem: "cliente volta 2 dias antes" }),
    );
    expect(screen.getByText("Copiar mensagem")).toBeTruthy();
    expect(h.confirmar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByText("Datas alteradas e diferença estornada ao cliente.")).toBeTruthy());
    expect(h.confirmar).toHaveBeenCalledWith("a1");
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("descartar some com os botões e avisa o servidor", async () => {
    h.enviar.mockResolvedValue({ reply: "Proponho cancelar.", used_tools: [], actions: [{ ...CARTAO, kind: "cancel" }], conversation_id: "c1" });
    const user = userEvent.setup();
    renderWithProviders(<OperatorAssistantWidget />, comEmpresa());
    await user.click(screen.getByLabelText("Abrir a Mia, assistente da operação"));
    await user.type(screen.getByLabelText("Mensagem para a Mia"), "cancela");
    await user.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Descartar" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(h.descartar).toHaveBeenCalledWith("a1");
    expect(screen.getByText("Descartada.")).toBeTruthy();
  });

  it("mostra o erro da Edge (teto de uso) sem perder a pergunta", async () => {
    h.enviar.mockRejectedValue(new Error("Você chegou ao limite de mensagens desta hora. Tente de novo daqui a pouco."));
    const user = userEvent.setup();
    renderWithProviders(<OperatorAssistantWidget />, comEmpresa());
    await user.click(screen.getByLabelText("Abrir a Mia, assistente da operação"));
    await user.type(screen.getByLabelText("Mensagem para a Mia"), "oi");
    await user.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByText(/limite de mensagens/)).toBeTruthy());
    expect(screen.getByText("oi")).toBeTruthy();
  });
});
