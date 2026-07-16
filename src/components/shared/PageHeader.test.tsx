import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("o h1 usa o tier display-xl (contrato de página de conteúdo)", () => {
    render(<PageHeader title="Perguntas frequentes" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("text-display-xl");
    expect(h1).toHaveClass("text-ink");
  });

  it('variant="content" põe o lead em body (16px/#424242), não em muted', () => {
    render(<PageHeader variant="content" title="Fale conosco" description="Tem uma dúvida?" />);
    const lead = screen.getByText("Tem uma dúvida?");
    expect(lead).toHaveClass("text-body-md", "text-body");
    expect(lead).not.toHaveClass("text-muted");
  });

  it("variant admin (padrão) mantém a descrição menor e muted das telas internas", () => {
    render(<PageHeader title="Reservas" description="Todas as reservas da plataforma." />);
    const desc = screen.getByText("Todas as reservas da plataforma.");
    expect(desc).toHaveClass("text-body-sm", "text-muted");
  });

  it("o eyebrow não usa muted-steel, que dá 3.2:1 sobre canvas e reprova o AA", () => {
    render(<PageHeader eyebrow="Movepark Clube" title="Seu motor de crescimento" />);
    const eyebrow = screen.getByText("Movepark Clube");
    expect(eyebrow).toHaveClass("text-mp-indigo");
    expect(eyebrow).not.toHaveClass("text-muted-steel");
  });

  it("o eyebrow nunca usa o violeta, que é reservado para elemento acionável", () => {
    render(<PageHeader eyebrow="Foundations" title="Cores" />);
    expect(screen.getByText("Foundations")).not.toHaveClass("text-mp-primary");
  });

  it("renderiza o bloco extra abaixo do lead (a busca da FAQ)", () => {
    render(
      <PageHeader variant="content" title="Perguntas frequentes">
        <input placeholder="Buscar pergunta…" />
      </PageHeader>,
    );
    expect(screen.getByPlaceholderText("Buscar pergunta…")).toBeInTheDocument();
  });
});
