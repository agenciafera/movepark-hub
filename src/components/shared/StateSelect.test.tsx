import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StateSelect } from "./StateSelect";

// Radix Select usa APIs de ponteiro/scroll ausentes no happy-dom.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("StateSelect", () => {
  it("mostra o placeholder quando não há valor", () => {
    render(<StateSelect value="" onValueChange={vi.fn()} />);
    expect(screen.getByText("UF")).toBeInTheDocument();
  });

  it("mostra o código da UF selecionada no gatilho", () => {
    render(<StateSelect value="SP" onValueChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("SP");
  });

  it("abre a lista com nomes completos e emite a UF ao selecionar", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<StateSelect value="" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("São Paulo"));

    expect(onValueChange).toHaveBeenCalledWith("SP");
  });
});
