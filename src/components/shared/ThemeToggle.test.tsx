import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("alterna o tema e persiste a escolha", async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: /tema escuro/i }));
    expect(localStorage.getItem("mp-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /tema claro/i }));
    expect(localStorage.getItem("mp-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("deixa o `hidden` de quem chama vencer o `inline-flex` da base", () => {
    // O topbar esconde o botão no mobile com `hidden tablet:inline-flex`. Com
    // concatenação de string as duas classes de display conviviam e o resultado
    // dependia da ordem no CSS; o `cn` resolve o conflito.
    render(<ThemeToggle className="hidden tablet:inline-flex" />);

    const cls = screen.getByRole("button").className;
    expect(cls).toContain("hidden");
    expect(cls).toContain("tablet:inline-flex");
    expect(cls.split(/\s+/)).not.toContain("inline-flex");
  });
});
