import { beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { tabela } from "@/test/msw/supabase";
import { EditParkingTypeDialog } from "./EditParkingTypeDialog";

// Radix Select usa APIs de ponteiro/scroll ausentes no happy-dom.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const CATALOGO = [
  { id: "pt-covered", code: "covered", name: "Vaga Coberta" },
  { id: "pt-uncovered", code: "uncovered", name: "Vaga Descoberta" },
  { id: "pt-avulsa", code: "avulsa", name: "Vaga Avulsa" },
];

function abre() {
  tabela("parking_type", "get", { json: CATALOGO });
  return renderWithProviders(
    <EditParkingTypeDialog
      open
      onOpenChange={() => {}}
      companyParkingTypeId="cpt-9"
      currentParkingTypeId="pt-uncovered"
    />,
  );
}

describe("EditParkingTypeDialog", () => {
  it("reatribui o tipo do catálogo e salva pelo id do company_parking_type", async () => {
    const patch = tabela("company_parking_type", "patch", { json: [] });
    const user = userEvent.setup();
    abre();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Vaga Avulsa (avulsa)" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(patch.chamadas).toHaveLength(1));
    expect(patch.chamadas[0].url).toContain("id=eq.cpt-9");
    expect(patch.ultimoBody).toEqual({ parking_type_id: "pt-avulsa" });
  });

  it("cancelar fecha sem gravar nada", async () => {
    const patch = tabela("company_parking_type", "patch", { json: [] });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    tabela("parking_type", "get", { json: CATALOGO });
    renderWithProviders(
      <EditParkingTypeDialog
        open
        onOpenChange={onOpenChange}
        companyParkingTypeId="cpt-9"
        currentParkingTypeId="pt-uncovered"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patch.chamadas).toHaveLength(0);
  });

  it("salvar sem trocar o tipo não faz PATCH nenhum", async () => {
    const patch = tabela("company_parking_type", "patch", { json: [] });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    tabela("parking_type", "get", { json: CATALOGO });
    renderWithProviders(
      <EditParkingTypeDialog
        open
        onOpenChange={onOpenChange}
        companyParkingTypeId="cpt-9"
        currentParkingTypeId="pt-uncovered"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patch.chamadas).toHaveLength(0);
  });
});
