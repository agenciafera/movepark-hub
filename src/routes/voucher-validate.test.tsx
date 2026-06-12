import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import VoucherValidatePage from "@/routes/voucher-validate";
import { useBookingByCode, useVoucherCheckIn, type VoucherBooking } from "@/features/voucher/api";

vi.mock("@/features/voucher/api", () => ({
  useBookingByCode: vi.fn(),
  useVoucherCheckIn: vi.fn(),
}));

const ROUTE = "/voucher/validate?code=MP-A8K7P2";

function bookingFixture(overrides: Partial<VoucherBooking> = {}): VoucherBooking {
  return {
    id: "bk-1",
    code: "MP-A8K7P2",
    status: "confirmed",
    check_in_at: new Date().toISOString(),
    check_out_at: new Date(Date.now() + 86400000).toISOString(),
    checked_in_at: null,
    total_amount: 159.5,
    profile_name: null,
    vehicle: { license_plate: "ABC-1D23", model: "Civic", color: "Prata" },
    location: { name: "Guarulhos", address: "Av X", company: { name: "Aerovalet" } },
    parking_type_name: "Vaga coberta",
    ...overrides,
  };
}

const checkInSpy = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.mocked(useVoucherCheckIn).mockReturnValue({ mutateAsync: checkInSpy, isPending: false } as never);
  vi.mocked(useBookingByCode).mockReturnValue({ data: bookingFixture(), isLoading: false } as never);
  checkInSpy.mockClear();
});

describe("VoucherValidatePage", () => {
  it("anônimo → CTA entrar como operador", () => {
    renderWithProviders(<VoucherValidatePage />, { auth: mockAuth(), route: ROUTE });
    expect(screen.getByText(/Entrar como operador/)).toBeInTheDocument();
  });

  it("cliente → aviso de área da operadora", () => {
    const auth = mockAuth({ session: mockSession("customer"), effectiveRole: "customer" });
    renderWithProviders(<VoucherValidatePage />, { auth, route: ROUTE });
    expect(screen.getByText(/equipe da operadora/)).toBeInTheDocument();
  });

  it("operador + confirmed → botão registra entrada", async () => {
    const auth = mockAuth({ session: mockSession("company_operator"), effectiveRole: "company_operator" });
    renderWithProviders(<VoucherValidatePage />, { auth, route: ROUTE });
    const btn = screen.getByRole("button", { name: /Registrar entrada/ });
    fireEvent.click(btn);
    await waitFor(() => expect(checkInSpy).toHaveBeenCalledWith("bk-1"));
  });

  it("operador + checked_in → sem botão, mostra entrada registrada", () => {
    vi.mocked(useBookingByCode).mockReturnValue({
      data: bookingFixture({ status: "checked_in", checked_in_at: new Date().toISOString() }),
      isLoading: false,
    } as never);
    const auth = mockAuth({ session: mockSession("company_operator"), effectiveRole: "company_operator" });
    renderWithProviders(<VoucherValidatePage />, { auth, route: ROUTE });
    expect(screen.queryByRole("button", { name: /Registrar entrada/ })).toBeNull();
    expect(screen.getByText(/Entrada já registrada/)).toBeInTheDocument();
  });

  it("operador + não encontrada → mensagem de erro", () => {
    vi.mocked(useBookingByCode).mockReturnValue({ data: null, isLoading: false } as never);
    const auth = mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" });
    renderWithProviders(<VoucherValidatePage />, { auth, route: ROUTE });
    expect(screen.getByText(/não encontrada/)).toBeInTheDocument();
  });
});
