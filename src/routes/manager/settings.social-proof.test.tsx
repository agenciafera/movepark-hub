import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const appSettings: { data: Record<string, string> | undefined; isLoading: boolean } = {
  data: { social_proof_customers: "300000" },
  isLoading: false,
};

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => appSettings,
  useUpdateAppSettings: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SocialProofSettings } from "./settings";

describe("SocialProofSettings", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    appSettings.data = { social_proof_customers: "300000" };
  });

  it("renderiza o valor atual do app_setting", () => {
    renderWithProviders(<SocialProofSettings />);
    expect((screen.getByLabelText(/Clientes atendidos/i) as HTMLInputElement).value).toBe("300000");
  });

  it("salva a chave como inteiro", async () => {
    renderWithProviders(<SocialProofSettings />);
    fireEvent.change(screen.getByLabelText(/Clientes atendidos/i), { target: { value: "412500" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ social_proof_customers: "412500" });
  });

  /**
   * O selo fica no topo da home. Um zero ou um texto salvo aqui apareceria para
   * todo visitante, então o erro é barrado antes de sair do formulário.
   */
  it("bloqueia o save com valor zerado ou não numérico", () => {
    renderWithProviders(<SocialProofSettings />);
    const campo = screen.getByLabelText(/Clientes atendidos/i);

    fireEvent.change(campo, { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();

    fireEvent.change(campo, { target: { value: "muitos" } });
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    expect(screen.getByText(/número maior que zero/i)).toBeInTheDocument();

    fireEvent.change(campo, { target: { value: "300000" } });
    expect(screen.getByRole("button", { name: /salvar/i })).toBeEnabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
