import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { falha, rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import * as csv from "@/lib/csv";
import { RecoverableBookingsPanel } from "./RecoverableBookingsPanel";

/**
 * A lista de não concluídas vem pronta da RPC `operator_recoverable_bookings` (o pgTAP prova a
 * regra). Aqui fica o contrato do cliente: o que a tela pede, o que mostra e que o download pede
 * com `p_export = true`, que é o que faz o servidor registrar a exportação.
 */
const LINHAS = [
  {
    booking_id: "b1",
    code: "MP-AAA111",
    customer_name: "Ana Souza",
    customer_phone: "5511987654321",
    customer_email: "ana@exemplo.test",
    location_name: "GRU",
    parking_type: "Vaga Coberta",
    check_in_at: "2026-11-13T13:00:00Z",
    check_out_at: "2026-11-20T21:00:00Z",
    days: 8,
    total_amount: 244.1,
    attempts: 2,
    origin: "whatsapp-bot",
    stopped_at: "pagamento",
    created_at: "2026-11-09T20:46:00Z",
  },
  {
    booking_id: "b2",
    code: "MP-BBB222",
    customer_name: null,
    customer_phone: "5511911112222",
    customer_email: null,
    location_name: "GRU",
    parking_type: "Vaga Descoberta",
    check_in_at: "2026-12-07T09:30:00Z",
    check_out_at: "2026-12-11T21:00:00Z",
    days: 5,
    total_amount: 107.4,
    attempts: 1,
    origin: "hub_direct",
    stopped_at: "dados",
    created_at: "2026-11-10T22:28:00Z",
  },
];

describe("RecoverableBookingsPanel", () => {
  it("pede a lista da empresa sem registrar exportação e mostra cada pessoa", async () => {
    const chamada = rpc("operator_recoverable_bookings", { json: LINHAS });
    renderWithProviders(<RecoverableBookingsPanel companyId="c1" />);

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(chamada.ultimoBody).toEqual({ p_company_id: "c1", p_export: false });
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(screen.getByText("2 tentativas")).toBeInTheDocument();
    expect(screen.getByText("Falou com a Mia")).toBeInTheDocument();
    expect(screen.getByText("Sem nome")).toBeInTheDocument();
    expect(screen.getByText("Antes de preencher os dados")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Fale uma vez com cada pessoa");
  });

  it("baixar pede de novo com p_export e gera o CSV com as linhas que o servidor devolveu", async () => {
    const download = vi.spyOn(csv, "downloadCsv").mockImplementation(() => {});
    const chamada = rpc("operator_recoverable_bookings", { json: LINHAS });
    renderWithProviders(<RecoverableBookingsPanel companyId="c1" filePrefix="teste" />);
    await screen.findByText("Ana Souza");

    await userEvent.click(screen.getByRole("button", { name: /Baixar lista/ }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(chamada.ultimoBody).toEqual({ p_company_id: "c1", p_export: true });
    const [nome, conteudo] = download.mock.calls[0];
    expect(nome).toMatch(/^teste-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
    expect(conteudo).toContain('"MP-AAA111"');
    expect(conteudo).toContain('"Mia no WhatsApp";"Sim"');
    expect(conteudo.split("\r\n")).toHaveLength(3);
    download.mockRestore();
  });

  it("lista vazia diz que não há ninguém e não deixa baixar", async () => {
    rpc("operator_recoverable_bookings", { json: [] });
    renderWithProviders(<RecoverableBookingsPanel companyId="c1" />);
    expect(await screen.findByText("Ninguém para chamar agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baixar lista/ })).toBeDisabled();
  });

  it("sem o escopo, mostra o erro do servidor em vez de uma lista vazia", async () => {
    falha("rpc", "operator_recoverable_bookings", 403, "Sem permissão para ver as reservas não concluídas desta empresa");
    renderWithProviders(<RecoverableBookingsPanel companyId="c1" />);
    expect(await screen.findByText("Não deu para carregar a lista")).toBeInTheDocument();
  });
});
