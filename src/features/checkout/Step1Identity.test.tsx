import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step1Identity } from "./Step1Identity";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useAttachPhone, useUpdateBookingCustomer } from "./api";

vi.mock("@/features/profile/api", () => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
}));
vi.mock("./api", () => ({ useUpdateBookingCustomer: vi.fn(), useAttachPhone: vi.fn() }));
// Espião no aceite: sem checkbox, é o submit que registra, e isso precisa de guarda.
const aceitarTermos = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/features/legal/api", () => ({
  useAcceptTerms: () => ({ mutateAsync: aceitarTermos, isPending: false }),
  useLegalDocument: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/components/ui/phone-field", () => ({
  PhoneField: ({
    id,
    value,
    onChange,
    required,
    disabled,
  }: {
    id?: string;
    value?: string;
    onChange: (v: string | undefined) => void;
    required?: boolean;
    disabled?: boolean;
  }) => (
    <input
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      required={required}
      disabled={disabled}
    />
  ),
}));

const defaultProps = {
  bookingId: "bk-1",
  bookingCode: "MP-TEST1",
  customerEmail: null,
  passengerFirstName: null,
  passengerLastName: null,
  passengerPhone: null,
  onNext: vi.fn(),
};

function setProfile(data: Record<string, unknown> | null) {
  vi.mocked(useProfile).mockReturnValue({ data, isLoading: false } as never);
}

beforeEach(() => {
  aceitarTermos.mockClear();
  // `defaultProps` é compartilhado pelo arquivo: sem limpar, o espião acumula
  // chamadas dos testes anteriores e "não foi chamado" nunca passa.
  defaultProps.onNext.mockClear();
  setProfile(null);
  vi.mocked(useUpdateProfile).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
  vi.mocked(useUpdateBookingCustomer).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
  vi.mocked(useAttachPhone).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ status: "attached" }),
    isPending: false,
  } as never);
});

describe("Step1Identity", () => {
  it("mostra campos de nome, sobrenome, e-mail e telefone editáveis", () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Sobrenome")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toBeInTheDocument();
  });

  it("prefila nome e sobrenome a partir do perfil", () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByDisplayValue("Pedro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Araujo")).toBeInTheDocument();
  });

  it("mostra checkbox 'A reserva é para outra pessoa'", () => {
    setProfile({ first_name: "Pedro", last_name: null });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(
      screen.getByRole("checkbox", { name: /A reserva é para outra pessoa/i }),
    ).toBeInTheDocument();
  });

  it("expande campos do passageiro ao marcar o checkbox", async () => {
    setProfile({ first_name: "Pedro", last_name: null });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    const checkbox = screen.getByRole("checkbox", { name: /A reserva é para outra pessoa/i });
    await userEvent.click(checkbox);
    expect(screen.getByLabelText("Nome do passageiro")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone do passageiro")).toBeInTheDocument();
  });

  it("inicializa o checkbox marcado quando o passageiro já existe", () => {
    setProfile({ first_name: "Pedro", last_name: "Silva" });
    renderWithProviders(
      <Step1Identity
        {...defaultProps}
        passengerFirstName="Maria"
        passengerLastName="Silva"
        passengerPhone={null}
      />,
      { auth: mockAuth({ session: mockSession("customer") }) },
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /A reserva é para outra pessoa/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByDisplayValue("Maria")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Silva").length).toBeGreaterThan(0);
  });

  // Regressão do bug: login por telefone deixava o e-mail travado e vazio.
  it("login por telefone: e-mail editável e salvo em customer_email; telefone de contato editável", async () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    const updateCustomer = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useUpdateBookingCustomer).mockReturnValue({
      mutateAsync: updateCustomer,
      isPending: false,
    } as never);

    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer", { email: null, phone: "+5511987727182" }) }),
    });

    const emailInput = screen.getByLabelText("E-mail") as HTMLInputElement;
    expect(emailInput).toBeEnabled();
    // ADR-006: telefone de contato do pedido é editável (não é mais a identidade travada).
    expect(screen.getByLabelText("Telefone")).toBeEnabled();

    await userEvent.type(emailInput, "diego@ex.com");
    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(updateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "bk-1", customer_email: "diego@ex.com" }),
    );
  });

  it("login por e-mail: campo de e-mail fica read-only (identidade da conta) e telefone editável", () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer", { email: "pedro@ex.com" }) }),
    });
    const emailInput = screen.getByLabelText("E-mail") as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(emailInput.value).toBe("pedro@ex.com");
    expect(screen.getByLabelText("Telefone")).toBeEnabled();
  });

  it("abre os Termos num modal, sem submeter o passo", async () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer", { email: "pedro@ex.com" }) }),
    });

    await userEvent.click(screen.getByText("Termos e Condições"));

    // Abre o modal (não navega pra outra página) …
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // … e ler os Termos não é aceitar: nada foi registrado nem avançou.
    expect(aceitarTermos).not.toHaveBeenCalled();
    expect(defaultProps.onNext).not.toHaveBeenCalled();
  });

  /**
   * O aceite deixou de ter checkbox e virou clickwrap. A prova continua sendo a
   * linha em `terms_acceptance`, gravada no submit com versão do documento e IP.
   * Se este teste cair, o checkout parou de registrar o aceite.
   */
  it("o clique em Continuar registra o aceite dos Termos", async () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({
        session: mockSession("customer", { email: "pedro@ex.com", phone: "+5511987727182" }),
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    await waitFor(() =>
      expect(aceitarTermos).toHaveBeenCalledWith({ booking_code: "MP-TEST1" }),
    );
  });

  // Antes, o botão nascia `disabled` esperando a marcação, sem dizer o porquê.
  it("o botão não nasce travado", () => {
    setProfile({ first_name: "Pedro", last_name: "Araujo" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer", { email: "pedro@ex.com" }) }),
    });
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeEnabled();
  });
});
