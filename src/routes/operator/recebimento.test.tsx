import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth } from "@/test/utils";

// A tela junta o wizard de KYC, a jornada e o painel de estímulo, todos com teste próprio.
// Aqui interessa só o passo do contrato: texto do banco, aceite com a versão vigente e a prova.
vi.mock("@/features/payouts/PayoutKycWizard", () => ({
  PayoutKycWizard: () => <div data-testid="kyc-wizard-stub" />,
}));
vi.mock("@/features/payouts/RevenueMotivator", () => ({
  RevenueMotivator: () => null,
  RevenueMotivatorBanner: () => null,
}));
vi.mock("@/components/shared/OnboardingJourney", () => ({
  OnboardingJourney: () => null,
}));
vi.mock("@/components/shared/ConfettiBurst", () => ({
  ConfettiBurst: () => null,
}));

const acceptMutate = vi.fn();
const pdfMutate = vi.fn();
const syncMutate = vi.fn();
const estado = {
  status: { acceptedAt: null as string | null, version: null as string | null, sha256: null as string | null },
};

vi.mock("@/features/payouts/api", () => ({
  usePayoutAccount: () => ({ data: { legal_name: "Mercy Ltda" }, isLoading: false }),
  useSavePayoutAccountSelf: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useContractStatus: () => ({ data: estado.status, isLoading: false }),
  useContractCurrent: () => ({
    data: {
      version: "v1",
      sha256: "20aa30ee25bb776d1ac92d68e8e2ff09a4c7e2848c0667821eb86a658e543a9a",
      body: "CONTRATO DE PARCERIA - MOVEPARK\nVersão v1\n\n1. OBJETO\nA Movepark divulga o estacionamento do Parceiro.",
      published_at: "2026-08-17T00:00:00Z",
    },
    isLoading: false,
  }),
  useContractPdf: () => ({ mutateAsync: pdfMutate, isPending: false }),
  useAcceptContract: () => ({ mutateAsync: acceptMutate, isPending: false }),
  useSyncRecipient: () => ({ mutateAsync: syncMutate, isPending: false }),
}));

vi.mock("@/features/payouts/contract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/payouts/contract")>()),
  saveBlob: vi.fn(),
}));

import { saveBlob } from "@/features/payouts/contract";
import OperatorRecebimento from "./recebimento";

function render() {
  return renderWithProviders(<OperatorRecebimento />, {
    auth: mockAuth({ effectiveCompanyIds: ["c1"] }),
  });
}

beforeEach(() => {
  acceptMutate.mockReset();
  pdfMutate.mockReset();
  syncMutate.mockReset();
  vi.mocked(saveBlob).mockReset();
  estado.status = { acceptedAt: null, version: null, sha256: null };
});

describe("OperatorRecebimento: passo do contrato", () => {
  it("mostra o texto completo vindo do banco, com a versão vigente", () => {
    render();
    expect(screen.getByRole("heading", { name: "Contrato de parceria" })).toBeInTheDocument();
    expect(screen.getByText(/Resumo do contrato de parceria \(versão v1\)/)).toBeInTheDocument();
    expect(screen.getByText(/A Movepark divulga o estacionamento do Parceiro\./)).toBeInTheDocument();
  });

  it("só assina depois do aceite explícito, e manda a versão vigente para a RPC", async () => {
    acceptMutate.mockResolvedValue({ version: "v1", sha256: "20aa", accepted_at: "2026-09-27T12:00:00Z" });
    syncMutate.mockResolvedValue({ status: "pending", kyc_url: null });
    render();

    const assinar = screen.getByRole("button", { name: "Assinar contrato" });
    expect(assinar).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(assinar).toBeEnabled();
    fireEvent.click(assinar);

    await waitFor(() =>
      expect(acceptMutate).toHaveBeenCalledWith({ company_id: "c1", version: "v1" }),
    );
    expect(await screen.findByText(/Cadastro completo/)).toBeInTheDocument();
  });
});

describe("OperatorRecebimento: contrato aceito", () => {
  beforeEach(() => {
    estado.status = {
      acceptedAt: "2026-09-27T15:00:00Z",
      version: "v1",
      sha256: "20aa30ee25bb776d1ac92d68e8e2ff09a4c7e2848c0667821eb86a658e543a9a",
    };
  });

  it("mostra versão, data e hash abreviado da prova", () => {
    render();
    expect(screen.getByText("Contrato aceito")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("20aa30ee25bb…")).toBeInTheDocument();
    expect(screen.getByText(new Date("2026-09-27T15:00:00Z").toLocaleString("pt-BR"))).toBeInTheDocument();
  });

  it("o botão de PDF pede o arquivo à Edge e dispara o download com o nome da versão", async () => {
    const blob = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    pdfMutate.mockResolvedValue(blob);
    render();

    fireEvent.click(screen.getByRole("button", { name: "Baixar PDF do contrato aceito" }));

    await waitFor(() => expect(pdfMutate).toHaveBeenCalledWith({ company_id: "c1" }));
    await waitFor(() =>
      expect(saveBlob).toHaveBeenCalledWith(blob, "contrato-parceria-movepark-v1.pdf"),
    );
  });
});
