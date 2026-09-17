import { describe, expect, it } from "vitest";
import {
  dateModifiedDoPost,
  diaDoCarimbo,
  publicaPreco,
} from "@/features/blog/priceFreshness.logic";

describe("publicaPreco", () => {
  it("reconhece o post que traz valor em reais", () => {
    expect(publicaPreco("A semana sai por R$ 118,30 na descoberta.")).toBe(true);
    expect(publicaPreco("A diária custa R$59.")).toBe(true);
  });

  it("guia sem tabela não publica preço", () => {
    expect(publicaPreco("O terminal tem três pisos e um estacionamento oficial.")).toBe(false);
    expect(publicaPreco(null)).toBe(false);
  });

  /** "R$" solto num nome de seção não é preço, e datar a página por ele seria mentira. */
  it("R$ sem número não conta", () => {
    expect(publicaPreco("Fale com o time sobre R$ por diária")).toBe(false);
  });
});

describe("diaDoCarimbo", () => {
  it("corta o horário, que é o que a página nunca mostra", () => {
    expect(diaDoCarimbo("2026-09-17T16:02:05.470584+00:00")).toMatch(/^2026-09-1[67]$/);
  });

  it("data inválida ou ausente não vira carimbo", () => {
    expect(diaDoCarimbo(null)).toBeNull();
    expect(diaDoCarimbo("ontem")).toBeNull();
  });
});

describe("dateModifiedDoPost", () => {
  const publishedAt = "2026-04-06T12:00:00Z";

  it("usa a tabela de preço quando ela é mais recente que a edição do texto", () => {
    expect(
      dateModifiedDoPost({
        publishedAt,
        updatedAt: "2026-08-27T10:00:00Z",
        priceUpdatedAt: "2026-09-17",
        publicaPreco: true,
      }),
    ).toBe("2026-09-17");
  });

  it("mantém a edição do texto quando ela é a mais recente", () => {
    expect(
      dateModifiedDoPost({
        publishedAt,
        updatedAt: "2026-09-20T10:00:00Z",
        priceUpdatedAt: "2026-09-17",
        publicaPreco: true,
      }),
    ).toBe("2026-09-20T10:00:00Z");
  });

  /**
   * A regra que impede frescor inventado: sem preço no corpo, revisão de parceiro não torna
   * o post modificado. Sem ela, os 95 posts do acervo se declarariam novos toda semana.
   */
  it("post sem preço ignora a data da tabela", () => {
    expect(
      dateModifiedDoPost({
        publishedAt,
        updatedAt: "2026-04-06T12:00:00Z",
        priceUpdatedAt: "2026-09-17",
        publicaPreco: false,
      }),
    ).toBe("2026-04-06T12:00:00Z");
  });

  it("sem carimbo de preço, vale a data do texto", () => {
    expect(
      dateModifiedDoPost({ publishedAt, updatedAt: null, priceUpdatedAt: null, publicaPreco: true }),
    ).toBe(publishedAt);
  });
});
