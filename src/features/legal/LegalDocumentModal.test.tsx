import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalDocumentModal } from "./LegalDocumentModal";

vi.mock("./api", () => ({
  useLegalDocument: () => ({
    data: {
      title: "Termos de Uso",
      content: "<h2>1. Aceitação</h2><p>Ao usar a plataforma você concorda com estes termos.</p>",
      published_at: "2026-07-07",
    },
    isLoading: false,
  }),
}));

describe("LegalDocumentModal", () => {
  it("mostra o documento quando aberto (título vindo do banco + corpo)", () => {
    render(<LegalDocumentModal slug="terms" title="Termos" open onOpenChange={() => {}} />);
    expect(screen.getByText("Termos de Uso")).toBeInTheDocument();
    expect(screen.getByText(/Aceitação/)).toBeInTheDocument();
    expect(screen.getByText(/concorda com estes termos/)).toBeInTheDocument();
  });

  it("não renderiza o conteúdo quando fechado", () => {
    render(<LegalDocumentModal slug="terms" title="Termos" open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText(/Aceitação/)).not.toBeInTheDocument();
  });
});
