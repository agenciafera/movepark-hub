import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PartnerLeadModal } from "./PartnerLeadModal";

const captureMutateAsync = vi.fn().mockResolvedValue({ ok: true });
vi.mock("./partnerLeadApi", () => ({
  useCapturePartnerLead: () => ({
    mutateAsync: captureMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("./leadApi", () => ({
  useSubmitLead: () => ({ mutateAsync: vi.fn().mockResolvedValue({ ok: true }), isPending: false }),
}));
vi.mock("@/components/ui/phone-field", () => ({
  PhoneField: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange: (v: string | undefined) => void;
  }) => (
    <input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />
  ),
}));
vi.mock("@/components/shared/StateSelect", () => ({
  StateSelect: ({
    id,
    value,
    onValueChange,
  }: {
    id?: string;
    value?: string;
    onValueChange: (v: string) => void;
  }) => (
    <select id={id} value={value ?? ""} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">UF</option>
      <option value="SP">SP</option>
    </select>
  ),
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <PartnerLeadModal open onOpenChange={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => captureMutateAsync.mockClear());

describe("PartnerLeadModal", () => {
  it("exige e-mail válido no passo 1 antes de avançar", async () => {
    renderModal();
    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "invalido");
    await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(screen.getByText(/e-mail válido/i)).toBeInTheDocument();
    expect(captureMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
  });

  it("com e-mail + WhatsApp válidos, salva (captura abandono) e avança pro passo 2", async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "dono@estacionamento.com");
    await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(captureMutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Passo 2 de 3")).toBeInTheDocument();
  });

  it("distribui os campos: passo 2 = estacionamento+vagas, passo 3 = cidade+estado+aceite", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@estac.com");
    await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    // Passo 2 — só estacionamento + vagas (sem cidade/estado).
    expect(await screen.findByText("Passo 2 de 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do estacionamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Vagas (aprox.)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cidade")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Nome do estacionamento"), "Estac Centro");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    // Passo 3 — cidade + estado + autorização.
    expect(await screen.findByText("Passo 3 de 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Cidade")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
    expect(screen.getByText(/autorizo a movepark/i)).toBeInTheDocument();
  });
});
