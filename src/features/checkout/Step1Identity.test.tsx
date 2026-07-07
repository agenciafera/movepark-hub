import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step1Identity } from "./Step1Identity";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useUpdateBookingCustomer } from "./api";

vi.mock("@/features/profile/api", () => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
}));
vi.mock("./api", () => ({ useUpdateBookingCustomer: vi.fn() }));
vi.mock("@/features/legal/api", () => ({
  useAcceptTerms: () => ({ mutateAsync: vi.fn().mockResolvedValue({ ok: true }), isPending: false }),
}));
vi.mock("@/components/ui/phone-field", () => ({
  PhoneField: ({
    id,
    value,
    onChange,
    required,
  }: {
    id?: string;
    value?: string;
    onChange: (v: string | undefined) => void;
    required?: boolean;
  }) => (
    <input
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      required={required}
    />
  ),
}));

const defaultProps = {
  bookingId: "bk-1",
  bookingCode: "MP-TEST1",
  customerName: null,
  customerPhone: null,
  onNext: vi.fn(),
};

function setProfile(data: Record<string, unknown> | null) {
  vi.mocked(useProfile).mockReturnValue({ data, isLoading: false } as never);
}

beforeEach(() => {
  setProfile(null);
  vi.mocked(useUpdateProfile).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
  vi.mocked(useUpdateBookingCustomer).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
});

describe("Step1Identity", () => {
  it("mostra campos de nome, sobrenome, e-mail e telefone editáveis", () => {
    setProfile({ full_name: "Pedro Araujo", phone: "+5511987727182" });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Sobrenome")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toBeInTheDocument();
  });

  it("separa nome e sobrenome a partir do full_name do perfil", () => {
    setProfile({ full_name: "Pedro Araujo", phone: null });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByDisplayValue("Pedro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Araujo")).toBeInTheDocument();
  });

  it("mostra checkbox 'A reserva é para outra pessoa'", () => {
    setProfile({ full_name: "Pedro", phone: null });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(
      screen.getByRole("checkbox", { name: /A reserva é para outra pessoa/i }),
    ).toBeInTheDocument();
  });

  it("expande campos do passageiro ao marcar o checkbox", async () => {
    setProfile({ full_name: "Pedro", phone: null });
    renderWithProviders(<Step1Identity {...defaultProps} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    const checkbox = screen.getByRole("checkbox", { name: /A reserva é para outra pessoa/i });
    await userEvent.click(checkbox);
    expect(screen.getByLabelText("Nome do passageiro")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone do passageiro")).toBeInTheDocument();
  });

  it("inicializa o checkbox marcado quando customerName já existe", () => {
    setProfile({ full_name: "Pedro Silva", phone: null });
    renderWithProviders(
      <Step1Identity {...defaultProps} customerName="Maria Silva" customerPhone={null} />,
      { auth: mockAuth({ session: mockSession("customer") }) },
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /A reserva é para outra pessoa/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByDisplayValue("Maria Silva")).toBeInTheDocument();
  });
});
