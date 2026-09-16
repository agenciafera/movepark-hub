import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { CompanyCombobox, filtraEmpresas } from "./CompanyCombobox";

const EMPRESAS = [
  { id: "c1", name: "Agência Fera" },
  { id: "c2", name: "Aeropark" },
  { id: "c3", name: "Botuquara Park" },
];

describe("filtraEmpresas", () => {
  it("acha sem acento e sem caixa; vazio devolve todas", () => {
    expect(filtraEmpresas(EMPRESAS, "agencia").map((c) => c.id)).toEqual(["c1"]);
    expect(filtraEmpresas(EMPRESAS, "PARK").map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(filtraEmpresas(EMPRESAS, "  ")).toHaveLength(3);
  });
});

describe("CompanyCombobox", () => {
  it("digitar filtra a lista e escolher devolve o id", async () => {
    const onChange = vi.fn();
    renderWithProviders(<CompanyCombobox companies={EMPRESAS} value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(screen.getByPlaceholderText("Busque pelo nome da empresa"), "fera");

    expect(screen.getByText("Agência Fera")).toBeInTheDocument();
    expect(screen.queryByText("Aeropark")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Agência Fera"));
    expect(onChange).toHaveBeenCalledWith("c1");
  });

  it("mostra o nome da empresa escolhida no gatilho", () => {
    renderWithProviders(<CompanyCombobox companies={EMPRESAS} value="c3" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Botuquara Park");
  });
});
