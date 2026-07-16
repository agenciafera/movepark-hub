import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingJourney } from "./OnboardingJourney";

describe("OnboardingJourney", () => {
  it("mostra as quatro fases e o próximo passo da fase atual", () => {
    render(<OnboardingJourney current="recebimento" completed={["preview"]} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Recebimento")).toBeInTheDocument();
    expect(screen.getByText("Fotos")).toBeInTheDocument();
    expect(screen.getByText("Publicar/Vender")).toBeInTheDocument();
    // dica de próximo passo da fase de recebimento
    expect(screen.getByText(/começar a vender/i)).toBeInTheDocument();
  });

  it("aponta fotos como próximo passo quando o recebimento já foi feito", () => {
    render(<OnboardingJourney current="fotos" completed={["preview", "recebimento"]} />);
    expect(screen.getByText(/pelo menos 1 foto/i)).toBeInTheDocument();
  });
});
