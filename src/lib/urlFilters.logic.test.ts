import { describe, expect, it } from "vitest";
import { clearedParams, hasActiveFilters, nextParams, readFilters } from "./urlFilters.logic";

const D = { q: "", status: "all", pagina: "0" };

describe("filtros no endereço", () => {
  it("lê da URL e completa com o padrão", () => {
    expect(readFilters(new URLSearchParams("status=confirmed&outro=1"), D)).toEqual({ q: "", status: "confirmed", pagina: "0" });
  });

  it("mudar filtro grava só o que difere do padrão e volta para a primeira página", () => {
    const p = nextParams(new URLSearchParams("pagina=3&x=1"), D, { status: "cancelled" }, "pagina");
    expect(p.toString()).toBe("x=1&status=cancelled");
  });

  it("mudar a página mantém os filtros", () => {
    const p = nextParams(new URLSearchParams("status=cancelled"), D, { pagina: "2" }, "pagina");
    expect(p.toString()).toBe("status=cancelled&pagina=2");
  });

  it("voltar ao padrão tira a chave da URL", () => {
    expect(nextParams(new URLSearchParams("status=cancelled"), D, { status: "all" }, "pagina").toString()).toBe("");
  });

  it("limpar tira só as chaves dos filtros", () => {
    expect(clearedParams(new URLSearchParams("q=ana&status=x&pagina=2&outro=1"), D).toString()).toBe("outro=1");
  });

  it("filtro ativo ignora a página", () => {
    expect(hasActiveFilters({ q: "", status: "all", pagina: "4" }, D, ["pagina"])).toBe(false);
    expect(hasActiveFilters({ q: "ana", status: "all", pagina: "0" }, D, ["pagina"])).toBe(true);
  });
});
