import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SITE_URL } from "@/lib/site";
import { SeloGerador } from "./SeloGerador";

describe("SeloGerador", () => {
  it("abre no selo de parceiro, que é o caso da maioria", () => {
    render(<SeloGerador />);
    expect(screen.getByRole("code").textContent).toContain("Parceiro");
    expect(screen.getByRole("code").textContent).toContain(`href="${SITE_URL}/"`);
  });

  // A prévia e o código saem da mesma função. O teste existe para que continuem saindo:
  // se um dia a prévia virar markup escrito à mão, ela passa a mentir sem quebrar nada.
  it("mostra na prévia o mesmo link que entrega no código", () => {
    render(<SeloGerador />);
    const previa = screen.getByRole("link", { name: /Parceiro Movepark/ });
    expect(previa).toHaveAttribute("href", `${SITE_URL}/`);
    expect(previa).not.toHaveAttribute("rel", expect.stringContaining("nofollow"));
  });

  it("troca a frase do selo ao escolher outra opção", async () => {
    const user = userEvent.setup();
    render(<SeloGerador />);
    await user.click(screen.getByRole("button", { name: /Reserve pela Movepark/ }));
    expect(screen.getByRole("code").textContent).toContain("Reserve pela");
  });

  it("identifica a origem no link quando o parceiro se nomeia", async () => {
    const user = userEvent.setup();
    render(<SeloGerador />);
    await user.type(screen.getByLabelText(/Nome do estacionamento/), "Vira Park");
    expect(screen.getByRole("code").textContent).toContain("utm_source=vira-park");
  });

  it("dispensa o símbolo quando o parceiro quer só o texto", async () => {
    const user = userEvent.setup();
    render(<SeloGerador />);
    await user.click(screen.getByRole("button", { name: "Só o texto" }));
    expect(screen.getByRole("code").textContent).not.toContain("<svg");
  });
});
