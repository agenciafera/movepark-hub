import { describe, expect, it } from "vitest";
import { secaoAtiva } from "./menuAtivo";

describe("secaoAtiva", () => {
  it("acende na própria página", () => {
    expect(secaoAtiva("/destinos", "/destinos")).toBe(true);
  });

  /** A marca some justamente quando o leitor navegou para dentro da seção. */
  it("continua aceso nas páginas de dentro", () => {
    expect(secaoAtiva("/destinos/aeroporto-de-viracopos", "/destinos")).toBe(true);
    expect(secaoAtiva("/account/reservas/123", "/account/reservas")).toBe(true);
  });

  /** O blog usa a URL canônica com barra, herdada do WordPress; as outras não. */
  it("a barra final não muda o resultado, de nenhum dos dois lados", () => {
    expect(secaoAtiva("/blog/", "/blog/")).toBe(true);
    expect(secaoAtiva("/blog/post-qualquer/", "/blog/")).toBe(true);
    expect(secaoAtiva("/blog", "/blog/")).toBe(true);
    expect(secaoAtiva("/destinos/", "/destinos")).toBe(true);
  });

  /** O corte por barra é o que separa seção de prefixo parecido. */
  it("prefixo parecido não acende", () => {
    expect(secaoAtiva("/destinos-antigos", "/destinos")).toBe(false);
    expect(secaoAtiva("/blogueiro", "/blog/")).toBe(false);
  });

  it("outra seção não acende", () => {
    expect(secaoAtiva("/ajuda", "/destinos")).toBe(false);
    expect(secaoAtiva("/", "/destinos")).toBe(false);
  });

  /** Alvo vazio acenderia em tudo. */
  it("alvo vazio nunca acende", () => {
    expect(secaoAtiva("/qualquer", "/")).toBe(false);
    expect(secaoAtiva("/qualquer", "")).toBe(false);
  });
});
