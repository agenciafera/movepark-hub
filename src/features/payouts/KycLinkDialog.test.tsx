import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { KycLinkDialog } from "./KycLinkDialog";

const emDezMinutos = () => new Date(Date.now() + 10 * 60_000).toISOString();

describe("KycLinkDialog", () => {
  it("mostra o link vivo com a contagem e copia com um clique", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(
      <KycLinkDialog open onOpenChange={() => {}} companyName="BePark" kycUrl="https://kyc.example/abc" expiresAt={emDezMinutos()} onReissue={() => {}} reissuing={false} />,
    );
    expect(screen.getByText("Prova de vida de BePark")).toBeInTheDocument();
    expect(screen.getByTestId("kyc-link-countdown").textContent).toMatch(/^0[9]:[0-5]\d$|^10:00$/);
    expect((screen.getByLabelText("Link de prova de vida") as HTMLInputElement).value).toBe("https://kyc.example/abc");
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    expect(writeText).toHaveBeenCalledWith("https://kyc.example/abc");
  });

  it("link expirado ou inexistente: oferece gerar outro", () => {
    const onReissue = vi.fn();
    renderWithProviders(
      <KycLinkDialog open onOpenChange={() => {}} companyName="BePark" kycUrl="https://kyc.example/velho" expiresAt={new Date(Date.now() - 1000).toISOString()} onReissue={onReissue} reissuing={false} />,
    );
    expect(screen.getByTestId("kyc-link-expirado")).toHaveTextContent("O link anterior expirou");
    fireEvent.click(screen.getByRole("button", { name: "Gerar link de 20 minutos" }));
    expect(onReissue).toHaveBeenCalled();
  });
});
