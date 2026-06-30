import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuaranteeBadge } from "./GuaranteeBadge";
import { GuaranteeSection } from "./GuaranteeSection";
import { GUARANTEE_PROMISE } from "./copy";

describe("GuaranteeBadge", () => {
  it("mostra o selo 'Vaga garantida'", () => {
    render(<GuaranteeBadge />);
    expect(screen.getByText("Vaga garantida")).toBeInTheDocument();
  });
});

describe("GuaranteeSection", () => {
  it("mostra a promessa e a regra operacional", () => {
    render(<GuaranteeSection />);
    expect(screen.getByText("Garantia de vaga Movepark")).toBeInTheDocument();
    expect(screen.getByText(GUARANTEE_PROMISE)).toBeInTheDocument();
    expect(screen.getByText(/realocamos você em um parceiro próximo/)).toBeInTheDocument();
  });
});
