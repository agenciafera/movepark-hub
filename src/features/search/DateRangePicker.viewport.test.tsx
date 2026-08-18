import { describe, expect, it } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { DateRangePicker } from "./DateRangePicker";

/**
 * Regressão de 18/08/2026, reportada do celular: o painel de datas abria ancorado
 * no campo e crescia até 534px, então num viewport de 664px ele terminava em 812.
 * O "Aplicar" caía em y=763, fora da tela, e o painel era `overflow: visible`, sem
 * rolagem possível. Não havia como concluir a escolha de data, que é o caminho
 * inteiro da reserva.
 *
 * O jsdom não faz layout, então aqui o que se verifica é o contrato que impede o
 * corte: teto de altura pelo espaço que o Radix mede, região de rolagem, e a barra
 * de ação fora dessa região (é o que garante o "Aplicar" sempre visível). A prova
 * geométrica foi feita no browser.
 */
describe("DateRangePicker — o painel cabe na tela", () => {
  function abrir() {
    const r = renderWithProviders(<DateRangePicker from={null} to={null} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Check-in"));
    return r;
  }

  it("o painel tem teto de altura e não estoura a borda de baixo", () => {
    abrir();

    const painel = document.querySelector("[data-radix-popper-content-wrapper]")
      ?.firstElementChild as HTMLElement;
    expect(painel).toBeTruthy();
    expect(painel.className).toContain("max-h-[var(--radix-popper-available-height)]");
    expect(painel.className).toContain("overflow-hidden");
  });

  it("o calendário rola, e a barra do Aplicar fica fora da rolagem", () => {
    abrir();

    const aplicar = screen.getByRole("button", { name: "Aplicar" });
    const barra = aplicar.parentElement!;
    expect(barra.className).toContain("shrink-0");

    // A barra não pode estar dentro da região que rola, senão o Aplicar sai de vista
    // junto com o calendário, que é exatamente o bug.
    const rolagem = document.querySelector(".overflow-y-auto");
    expect(rolagem).toBeTruthy();
    expect(rolagem!.contains(aplicar)).toBe(false);
    expect(rolagem!.querySelector("table")).toBeTruthy();
  });
});
