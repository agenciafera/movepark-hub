import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MEASUREMENT_OPTOUT_KEY } from "@/lib/measurement-optout";
import { MedicaoOptOut } from "./MedicaoOptOut";

const storageOriginal = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  if (storageOriginal) Object.defineProperty(window, "localStorage", storageOriginal);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("MedicaoOptOut", () => {
  it("oferece desligar a medição quando nada foi gravado", () => {
    render(<MedicaoOptOut />);

    expect(screen.getByRole("button", { name: "Não medir minha navegação" })).toBeInTheDocument();
    expect(screen.queryByText(/Medição desligada/)).not.toBeInTheDocument();
  });

  it("ao clicar, grava a chave e mostra o estado com o caminho de volta", async () => {
    const user = userEvent.setup();
    render(<MedicaoOptOut />);

    await user.click(screen.getByRole("button", { name: "Não medir minha navegação" }));

    expect(localStorage.getItem(MEASUREMENT_OPTOUT_KEY)).toBe("1");
    expect(screen.getByTestId("medicao-optout")).toHaveTextContent(
      "Medição desligada neste navegador. Voltar a medir",
    );
  });

  it("'Voltar a medir' apaga a chave e volta ao link original", async () => {
    const user = userEvent.setup();
    localStorage.setItem(MEASUREMENT_OPTOUT_KEY, "1");
    render(<MedicaoOptOut />);

    // O estado gravado só entra depois do efeito: o HTML pré-renderizado sempre
    // nasce "medindo".
    await user.click(await screen.findByRole("button", { name: "Voltar a medir" }));

    expect(localStorage.getItem(MEASUREMENT_OPTOUT_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Não medir minha navegação" })).toBeInTheDocument();
  });

  it("sem localStorage, diz que não conseguiu guardar em vez de fingir que desligou", async () => {
    const user = userEvent.setup();
    render(<MedicaoOptOut />);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });

    await user.click(screen.getByRole("button", { name: "Não medir minha navegação" }));

    expect(screen.getByTestId("medicao-optout")).toHaveTextContent(
      "Este navegador não guarda a escolha.",
    );
    expect(screen.queryByText(/Medição desligada/)).not.toBeInTheDocument();
  });
});
