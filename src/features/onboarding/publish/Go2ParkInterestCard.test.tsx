import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/features/onboarding/go2parkApi", () => ({
  useSubmitGo2ParkInterest: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Go2ParkInterestCard } from "./Go2ParkInterestCard";

describe("Go2ParkInterestCard", () => {
  it("registra o interesse (com o company_id) e troca para o estado confirmado", async () => {
    render(<Go2ParkInterestCard companyId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /Tenho interesse/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Interesse registrado")).toBeInTheDocument();
    // o botão some depois de confirmar (ação de mão única)
    expect(screen.queryByRole("button", { name: /Tenho interesse/i })).not.toBeInTheDocument();
  });
});
