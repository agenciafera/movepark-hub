import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
import { server } from "@/test/msw/server";
import { supabase } from "@/lib/supabase";
import { RecipientKycBanner } from "./RecipientKycBanner";

const KYC_URL = "https://check-identity.baas.stone.com.br?token=abc";
const AGORA = new Date("2026-07-30T20:30:00Z");
const VIVO = "2026-07-30T20:46:41Z";
const MORTO = "2026-07-30T20:10:00Z";

function mockRecipient(row: Record<string, unknown> | null) {
  server.use(http.get("*/rest/v1/payout_recipient", () => HttpResponse.json(row ? [row] : [])));
}

/** O banner some por completo em vários casos, então renderiza dentro de um host observável. */
function render(opts?: { canReissue?: boolean }) {
  return renderWithProviders(
    <div data-testid="host">
      <RecipientKycBanner companyId="company-1" />
    </div>,
    {
      auth: mockAuth({
        session: mockSession("company_operator"),
        effectiveRole: "company_operator",
        hasScope: () => opts?.canReissue ?? true,
      }),
    },
  );
}

describe("RecipientKycBanner — prova de vida no painel do parceiro", () => {
  beforeEach(() => {
    // O contador roda num setInterval de 1s; congela o relógio para a asserção ser estável.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sem recebedor, não renderiza nada", async () => {
    mockRecipient(null);
    render();
    await waitFor(() => expect(screen.getByTestId("host")).toBeEmptyDOMElement());
  });

  it("em análise no gateway, o parceiro não é incomodado", async () => {
    mockRecipient({
      status: "pending",
      kyc_url: null,
      kyc_url_expires_at: null,
      last_provider_status: "registration",
    });
    render();
    await waitFor(() => expect(screen.getByTestId("host")).toBeEmptyDOMElement());
  });

  it("link vivo: botão para o gateway, QR code e contador", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      kyc_url_expires_at: VIVO,
      last_provider_status: "affiliation",
    });
    render();

    const link = await screen.findByRole("link", { name: /Fazer prova de vida/i });
    expect(link).toHaveAttribute("href", KYC_URL);
    expect(link).toHaveAttribute("target", "_blank");

    const img = await screen.findByRole("img", { name: /QR code da prova de vida/i });
    expect(img).toHaveAttribute("src", expect.stringContaining("data:image/png"));

    // 20:30:00 até 20:46:41 são 16 minutos e 41 segundos.
    expect(screen.getByText("16:41")).toBeInTheDocument();
  });

  it("link expirado: sem QR, com botão de gerar outro", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      kyc_url_expires_at: MORTO,
      last_provider_status: "affiliation",
    });
    render({ canReissue: true });

    expect(await screen.findByText(/O link da verificação expirou/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar link novo/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Fazer prova de vida/i })).toBeNull();
    expect(screen.queryByRole("img", { name: /QR code/i })).toBeNull();
  });

  it("expirado sem payouts:write encaminha ao responsável em vez de oferecer o botão", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      kyc_url_expires_at: MORTO,
      last_provider_status: "affiliation",
    });
    render({ canReissue: false });

    expect(await screen.findByText(/Peça ao responsável pela conta/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar link novo/i })).toBeNull();
  });

  it("gerar link novo chama a Edge com action reissue_kyc", async () => {
    mockRecipient({
      status: "action_required",
      kyc_url: KYC_URL,
      kyc_url_expires_at: MORTO,
      last_provider_status: "affiliation",
    });
    // callSyncRecipient exige um access_token do client Supabase antes de chamar a Edge.
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt-de-teste" } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    let enviado: Record<string, unknown> | null = null;
    server.use(
      http.post("*/functions/v1/sync-recipient", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          status: "action_required",
          external_recipient_id: "re_1",
          kyc_url: KYC_URL,
          kyc_url_expires_at: VIVO,
          requirements: [],
        });
      }),
    );

    render({ canReissue: true });
    const botao = await screen.findByRole("button", { name: /Gerar link novo/i });
    await userEvent.click(botao);

    await waitFor(() => expect(enviado).not.toBeNull());
    expect(enviado).toMatchObject({ company_id: "company-1", action: "reissue_kyc" });
  });

  it("gateway pediu a verificação mas o link não chegou: avisa em vez de sumir", async () => {
    mockRecipient({
      status: "pending",
      kyc_url: null,
      kyc_url_expires_at: null,
      last_provider_status: "affiliation",
    });
    render();
    expect(await screen.findByText(/Prova de vida pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/Estamos preparando o link/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Fazer prova de vida/i })).toBeNull();
  });
});
