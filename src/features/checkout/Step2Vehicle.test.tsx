import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step2Vehicle } from "./Step2Vehicle";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { useMyVehicles, useCreateVehicle } from "@/features/vehicles/api";
import { useUpdateBookingVehicle, useUpdateBookingTrip } from "./api";

vi.mock("@/features/vehicles/api", () => ({
  useMyVehicles: vi.fn(),
  useCreateVehicle: vi.fn(),
}));
vi.mock("./api", () => ({
  useUpdateBookingVehicle: vi.fn(),
  useUpdateBookingTrip: vi.fn(),
}));

const vehicles = [
  { id: "v-1", profile_id: "u", license_plate: "ABC-1D23", model: "Honda Civic", color: "Prata" },
  { id: "v-2", profile_id: "u", license_plate: "NME-1122", model: null, color: null },
];

const defaultProps = {
  bookingId: "bk-1",
  selectedVehicleId: null,
  passengerCount: null,
  hasPcd: false,
  onBack: vi.fn(),
  onNext: vi.fn(),
};

function setVehicles(data: unknown, isLoading = false) {
  vi.mocked(useMyVehicles).mockReturnValue({ data, isLoading } as never);
}

beforeEach(() => {
  setVehicles(vehicles);
  vi.mocked(useCreateVehicle).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "v-new" }),
    isPending: false,
  } as never);
  vi.mocked(useUpdateBookingVehicle).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
  vi.mocked(useUpdateBookingTrip).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as never);
});

function renderStep(props = {}) {
  return renderWithProviders(<Step2Vehicle {...defaultProps} {...props} />, {
    auth: mockAuth({ session: mockSession("customer") }),
  });
}

describe("Step2Vehicle — seleção de veículo", () => {
  it("auto-seleciona o primeiro veículo e o marca com aria-pressed", () => {
    renderStep();
    const first = screen.getByRole("button", { name: /ABC-1D23/ });
    const second = screen.getByRole("button", { name: /NME-1122/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");
  });

  it("mostra o indicador de check apenas no veículo selecionado (não é só cor)", () => {
    renderStep();
    const first = screen.getByRole("button", { name: /ABC-1D23/ });
    const second = screen.getByRole("button", { name: /NME-1122/ });
    // Card selecionado = ícone do carro + check (2 svgs); não selecionado só o carro (1).
    expect(first.querySelectorAll("svg")).toHaveLength(2);
    expect(second.querySelectorAll("svg")).toHaveLength(1);
  });

  it("move aria-pressed e o check ao clicar em outro veículo", async () => {
    renderStep();
    const second = screen.getByRole("button", { name: /NME-1122/ });
    await userEvent.click(second);
    const first = screen.getByRole("button", { name: /ABC-1D23/ });
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second.querySelectorAll("svg")).toHaveLength(2);
    expect(first.querySelectorAll("svg")).toHaveLength(1);
  });

  it("respeita selectedVehicleId vindo da reserva", () => {
    renderStep({ selectedVehicleId: "v-2" });
    expect(screen.getByRole("button", { name: /NME-1122/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /ABC-1D23/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
