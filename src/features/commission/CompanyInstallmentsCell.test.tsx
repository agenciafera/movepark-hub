import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { rpc } from "@/test/msw/supabase";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { CompanyInstallmentsCell } from "./CompanyInstallmentsCell";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function render(max: number | null, free: number | null) {
  renderWithProviders(<CompanyInstallmentsCell companyId="c1" companyName="Abbapark" max={max} interestFree={free} />, {
    auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
  });
}

describe("CompanyInstallmentsCell", () => {
  it("sem padrão próprio, diz que vale a política da plataforma", () => {
    render(null, null);
    expect(screen.getByText("No checkout: vale a política da plataforma.")).toBeInTheDocument();
  });

  it("par incompleto não vai ao servidor", async () => {
    const espiao = rpc("set_company_installments", { json: {} });
    render(null, null);
    fireEvent.change(screen.getByLabelText("Máximo de parcelas de Abbapark"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("só à vista: mostra a prévia e grava", async () => {
    const espiao = rpc("set_company_installments", { json: { id: "c1", installments_max: 1, installments_interest_free: 1 } });
    render(null, null);
    fireEvent.change(screen.getByLabelText("Máximo de parcelas de Abbapark"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Parcelas sem juros de Abbapark"), { target: { value: "1" } });
    expect(screen.getByText("No checkout: só à vista.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(espiao.ultimoBody).toEqual({ p_company_id: "c1", p_installments_max: 1, p_installments_interest_free: 1 }));
  });
});
