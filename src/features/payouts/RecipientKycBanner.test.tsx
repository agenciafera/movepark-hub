import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import { server } from "@/test/msw/server";
import { RecipientKycBanner } from "./RecipientKycBanner";

const KYC_URL = "https://check-identity.baas.stone.com.br?token=abc";

function mockRecipient(row: Record<string, unknown> | null) {
  server.use(http.get("*/rest/v1/payout_recipient", () => HttpResponse.json(row ? [row] : [])));
}

/** O banner some por completo em vários casos, então renderiza dentro de um host observável. */
function render() {
  return renderWithProviders(
    <div data-testid="host">
      <RecipientKycBanner companyId="company-1" />
    </div>,
    {
      auth: mockAuth({
        session: mockSession("company_operator"),
        effectiveRole: "company_operator",
      }),
    },
  );
}

describe("RecipientKycBanner — prova de vida no painel do parceiro", () => {
  it("sem recebedor, não renderiza nada", async () => {
    mockRecipient(null);
    render();
    await waitFor(() => expect(screen.getByTestId("host")).toBeEmptyDOMElement());
  });

  it("em análise no gateway, o parceiro não é incomodado", async () => {
    mockRecipient({ status: "pending", kyc_url: null, last_provider_status: "registration" });
    render();
    await waitFor(() => expect(screen.getByTestId("host")).toBeEmptyDOMElement());
  });

  it("com link, mostra o botão apontando para o gateway", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      last_provider_status: "affiliation",
    });
    render();
    const link = await screen.findByRole("link", { name: /Fazer prova de vida/i });
    expect(link).toHaveAttribute("href", KYC_URL);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renderiza o QR code gerado a partir do link", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      last_provider_status: "affiliation",
    });
    render();
    const img = await screen.findByRole("img", { name: /QR code da prova de vida/i });
    expect(img).toHaveAttribute("src", expect.stringContaining("data:image/png"));
  });

  it("avisa que o link vale 20 minutos", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      last_provider_status: "affiliation",
    });
    render();
    expect(await screen.findByText(/vale 20 minutos/i)).toBeInTheDocument();
  });

  it("gateway pediu a verificação mas o link não chegou: avisa em vez de sumir", async () => {
    mockRecipient({ status: "pending", kyc_url: null, last_provider_status: "affiliation" });
    render();
    expect(await screen.findByText(/Prova de vida pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/Estamos preparando o link/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Fazer prova de vida/i })).toBeNull();
    expect(screen.queryByRole("img", { name: /QR code/i })).toBeNull();
  });
});
