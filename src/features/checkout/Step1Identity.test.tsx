import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Step1Identity } from "./Step1Identity";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { useProfile } from "@/features/profile/api";

vi.mock("@/features/profile/api", () => ({ useProfile: vi.fn() }));

function setProfile(data: Record<string, unknown> | null) {
  vi.mocked(useProfile).mockReturnValue({ data, isLoading: false } as never);
}

beforeEach(() => setProfile(null));

describe("Step1Identity", () => {
  it("mostra o telefone do perfil formatado", () => {
    setProfile({ full_name: "Pedro Araujo", phone: "+5511987727182" });
    renderWithProviders(<Step1Identity onNext={() => {}} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByText("+55 11 98772 7182")).toBeInTheDocument();
    expect(screen.queryByText(/Cadastre em/)).not.toBeInTheDocument();
  });

  it("normaliza telefone salvo sem o + (legado)", () => {
    setProfile({ full_name: "Pedro", phone: "5511987727182" });
    renderWithProviders(<Step1Identity onNext={() => {}} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByText("+55 11 98772 7182")).toBeInTheDocument();
  });

  it("cai no aviso quando não há telefone", () => {
    setProfile({ full_name: "Pedro", phone: null });
    renderWithProviders(<Step1Identity onNext={() => {}} />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    expect(screen.getByText('Cadastre em "Conta"')).toBeInTheDocument();
  });
});
