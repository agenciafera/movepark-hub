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

  it("na fase Vender pede para publicar, e não anuncia que já está no ar", () => {
    // A fase só é concluída com is_listed, e o recebedor ainda pode estar em análise no gateway.
    // Dizer "está no ar, recebendo reservas" aqui prometia ao parceiro algo que não aconteceu.
    render(<OnboardingJourney current="vender" completed={["preview", "recebimento"]} />);
    expect(screen.getByText(/Falta publicar sua unidade/i)).toBeInTheDocument();
    expect(screen.queryByText(/está no ar, recebendo reservas/i)).toBeNull();
  });

  it("o hint explícito sobrescreve o texto padrão da fase", () => {
    render(
      <OnboardingJourney current="recebimento" completed={["preview"]} hint="Em análise no banco." />,
    );
    expect(screen.getByText("Em análise no banco.")).toBeInTheDocument();
    expect(screen.queryByText(/começar a vender/i)).toBeNull();
  });
});
