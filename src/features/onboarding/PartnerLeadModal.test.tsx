import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PartnerLeadModal } from "./PartnerLeadModal";

const captureMutateAsync = vi.fn().mockResolvedValue({ ok: true });
const submitMutateAsync = vi.fn().mockResolvedValue({ ok: true });
vi.mock("./partnerLeadApi", () => ({
  useCapturePartnerLead: () => ({
    mutateAsync: captureMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("./leadApi", () => ({
  useSubmitLead: () => ({ mutateAsync: submitMutateAsync, isPending: false }),
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

function renderModal() {
  return render(
    <MemoryRouter>
      <PartnerLeadModal open onOpenChange={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  captureMutateAsync.mockClear();
  submitMutateAsync.mockClear();
});

async function fillStep1() {
  await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
  await userEvent.type(screen.getByLabelText("E-mail"), "ana@estac.com");
  await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
  await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));
}

describe("PartnerLeadModal", () => {
  it("exige e-mail válido no passo 1 antes de avançar", async () => {
    renderModal();
    expect(screen.getByText("Passo 1 de 2")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "invalido");
    await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(screen.getByText(/e-mail válido/i)).toBeInTheDocument();
    expect(captureMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Passo 1 de 2")).toBeInTheDocument();
  });

  it("com e-mail + WhatsApp válidos, salva (captura abandono) e avança pro passo 2", async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "dono@estacionamento.com");
    await userEvent.type(screen.getByLabelText("WhatsApp"), "11991234567");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(captureMutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Passo 2 de 2")).toBeInTheDocument();
  });

  it("passo 2 = estacionamento + vagas + aceite, sem cidade/estado nem passo 3", async () => {
    renderModal();
    await fillStep1();

    expect(await screen.findByText("Passo 2 de 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do estacionamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Vagas (aprox.)")).toBeInTheDocument();
    expect(screen.getByText(/autorizo a movepark/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Cidade")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
  });

  it("no passo 2, vagas é obrigatório", async () => {
    renderModal();
    await fillStep1();

    await userEvent.type(await screen.findByLabelText("Nome do estacionamento"), "Estac Centro");
    // Sem vagas → bloqueia o submit.
    await userEvent.click(screen.getByRole("button", { name: /Quero ser parceiro/i }));

    expect(screen.getByText(/número de vagas/i)).toBeInTheDocument();
    expect(submitMutateAsync).not.toHaveBeenCalled();
  });

  it("no passo 2, exige marcar o aceite antes de submeter", async () => {
    renderModal();
    await fillStep1();

    await userEvent.type(await screen.findByLabelText("Nome do estacionamento"), "Estac Centro");
    await userEvent.type(screen.getByLabelText("Vagas (aprox.)"), "50");
    // Sem marcar o aceite → bloqueia.
    await userEvent.click(screen.getByRole("button", { name: /Quero ser parceiro/i }));

    expect(screen.getByText(/autorizar o contato/i)).toBeInTheDocument();
    expect(submitMutateAsync).not.toHaveBeenCalled();
  });

  it("com estacionamento + vagas + aceite, submete com accept_terms e mostra o obrigado", async () => {
    renderModal();
    await fillStep1();

    await userEvent.type(await screen.findByLabelText("Nome do estacionamento"), "Estac Centro");
    await userEvent.type(screen.getByLabelText("Vagas (aprox.)"), "50");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Quero ser parceiro/i }));

    expect(submitMutateAsync).toHaveBeenCalledTimes(1);
    expect(submitMutateAsync.mock.calls[0][0]).toMatchObject({
      company_name: "Estac Centro",
      estimated_spots: 50,
      accept_terms: true,
    });
  });
});
