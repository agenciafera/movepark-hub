import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import CompleteProfilePage from "@/routes/account/complete-profile";
import { useProfile, useUpdateProfile } from "@/features/profile/api";

vi.mock("@/features/profile/api", () => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
}));

const updateSpy = vi.fn().mockResolvedValue(undefined);
const ROUTE = "/account/complete-profile?next=%2Fcheckout%2FMP-0B9B83";

function render() {
  return renderWithProviders(<CompleteProfilePage />, {
    auth: mockAuth({ session: mockSession("customer") }),
    route: ROUTE,
  });
}

beforeEach(() => {
  vi.mocked(useUpdateProfile).mockReturnValue({ mutateAsync: updateSpy, isPending: false } as never);
  vi.mocked(useProfile).mockReturnValue({
    data: { first_name: "", last_name: "", tax_id: "" },
    isLoading: false,
  } as never);
  updateSpy.mockClear();
});

describe("CompleteProfilePage", () => {
  it("rotula o documento como CPF ou CNPJ e oferece saída pra home", () => {
    render();
    expect(screen.getByText("CPF ou CNPJ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar para o início/i })).toHaveAttribute("href", "/");
  });

  it("aceita CNPJ (14 dígitos) e grava só os dígitos", async () => {
    render();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Empresa" } });
    fireEvent.change(screen.getByLabelText("Sobrenome"), { target: { value: "LTDA" } });
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), {
      target: { value: "11222333000181" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0][0]).toMatchObject({
      tax_id: "11222333000181",
      first_name: "Empresa",
      last_name: "LTDA",
    });
  });

  it("rejeita documento inválido sem chamar a mutation", () => {
    render();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Fulano" } });
    fireEvent.change(screen.getByLabelText("Sobrenome"), { target: { value: "Silva" } });
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
