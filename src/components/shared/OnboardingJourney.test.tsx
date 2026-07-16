import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingJourney } from "./OnboardingJourney";

describe("OnboardingJourney", () => {
  it("mostra as três fases e o próximo passo da fase atual", () => {
    render(<OnboardingJourney current="recebimento" completed={["preview"]} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Recebimento")).toBeInTheDocument();
    expect(screen.getByText("Publicar/Vender")).toBeInTheDocument();
    // dica de próximo passo da fase de recebimento
    expect(screen.getByText(/começar a vender/i)).toBeInTheDocument();
  });

  it("na fase Preview o próximo passo menciona as fotos (fotos ficam dentro do preview)", () => {
    render(<OnboardingJourney current="preview" />);
    expect(screen.getByText(/fotos/i)).toBeInTheDocument();
  });
});
