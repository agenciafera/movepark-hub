import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LocaleProvider, useLocale, useTextos } from "./LocaleContext";

function Sonda() {
  const locale = useLocale();
  const t = useTextos();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="texto">{t.duracao(7)}</span>
    </div>
  );
}

describe("LocaleContext", () => {
  it("sem provider, o componente segue em português", () => {
    // É o que permite migrar a superfície aos poucos: página não tocada não muda.
    render(<Sonda />);
    expect(screen.getByTestId("locale").textContent).toBe("pt-BR");
    expect(screen.getByTestId("texto").textContent).toBe("7 diárias");
  });

  it("com provider, o mesmo componente responde no idioma da página", () => {
    render(
      <LocaleProvider locale="en">
        <Sonda />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("texto").textContent).toBe("7 days");
  });

  it("vale para espanhol também", () => {
    render(
      <LocaleProvider locale="es">
        <Sonda />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("texto").textContent).toBe("7 días");
  });
});
