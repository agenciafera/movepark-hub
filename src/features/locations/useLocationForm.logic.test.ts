import { describe, expect, it } from "vitest";
import {
  parsePositiveInt,
  isValidMinutes,
  googleMapsUrlFromPlaceId,
  parseNonNegativeInt,
  uuidOuNulo,
  mensagemDeErro,
} from "./useLocationForm";

describe("parseNonNegativeInt", () => {
  it("vazio e lixo viram 0 (sem tolerância), não null", () => {
    expect(parseNonNegativeInt("")).toBe(0);
    expect(parseNonNegativeInt("abc")).toBe(0);
    expect(parseNonNegativeInt("-30")).toBe(0);
    expect(parseNonNegativeInt("0")).toBe(0);
  });
  it("inteiro positivo passa", () => {
    expect(parseNonNegativeInt("60")).toBe(60);
  });
});

describe("googleMapsUrlFromPlaceId", () => {
  it("monta o deep link de Maps a partir do place_id", () => {
    expect(googleMapsUrlFromPlaceId("ChIJ0testplaceid")).toBe(
      "https://www.google.com/maps/place/?q=place_id:ChIJ0testplaceid",
    );
  });
});

describe("parsePositiveInt", () => {
  it("aceita inteiro positivo, recusa zero/negativo/lixo", () => {
    expect(parsePositiveInt("15")).toBe(15);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("-5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt("")).toBeNull();
  });
});

describe("isValidMinutes", () => {
  it("vazio é válido (sem transfer)", () => {
    expect(isValidMinutes("")).toBe(true);
    expect(isValidMinutes("   ")).toBe(true);
  });
  it("inteiro positivo é válido", () => {
    expect(isValidMinutes("15")).toBe(true);
  });
  it("zero e negativo são inválidos (o que antes virava null silencioso)", () => {
    expect(isValidMinutes("0")).toBe(false);
    expect(isValidMinutes("-3")).toBe(false);
  });
});


describe("mensagemDeErro", () => {
  it("22P02 (uuid vazio) explica o que fazer, em vez de mandar tentar de novo", () => {
    const msg = mensagemDeErro({ code: "22P02" });
    expect(msg).toContain("destino");
    expect(msg).not.toContain("instantes");
  });

  it("23505 aponta o slug duplicado", () => {
    expect(mensagemDeErro({ code: "23505" })).toContain("slug");
  });

  it("erro desconhecido continua genérico", () => {
    expect(mensagemDeErro(new Error("boom"))).toContain("Tente de novo");
    expect(mensagemDeErro(null)).toContain("Tente de novo");
  });
});

describe("uuidOuNulo", () => {
  it("vazio e espaço viram null; uuid passa intacto", () => {
    const id = "c07e27e1-09d7-4499-afeb-fa84671ced3c";
    expect(uuidOuNulo("")).toBeNull();
    expect(uuidOuNulo("   ")).toBeNull();
    expect(uuidOuNulo(null)).toBeNull();
    expect(uuidOuNulo(id)).toBe(id);
  });
});

describe("patch do destino: omitir é diferente de mandar null", () => {
  // Regressão de 19/08/2026, em duas camadas.
  //
  // Camada 1: o "Editar unidade" não salvava nada quando a pessoa clicava em Salvar antes de a
  // lista de destinos carregar. O Radix não achava o valor atual entre os itens, limpava a
  // seleção, e o `""` derrubava o UPDATE com 22P02.
  //
  // Camada 2, que é a que este teste trava: a primeira tentativa de conserto converteu esse `""`
  // em `null`. O UPDATE passou a responder 200 e APAGOU o destino da unidade. Medido em produção
  // na Abbapark. O 22P02 era fusível, não defeito.
  //
  // A garantia certa não é sobre o VALOR, é sobre a CHAVE existir no patch. Se a pessoa não mexeu
  // no campo, `destination_id` não pode ir ao banco de jeito nenhum.
  function montaPatch(payload: Record<string, unknown>, destinationTouched: boolean) {
    const patch = { ...payload };
    if (!destinationTouched) delete patch.destination_id;
    return patch;
  }

  const payload = { name: "Unidade", destination_id: null as string | null };

  it("sem tocar no campo, a chave NÃO vai no patch (o banco preserva o que tem)", () => {
    const patch = montaPatch(payload, false);
    expect("destination_id" in patch).toBe(false);
  });

  it("tendo tocado, a escolha vai, inclusive quando é Nenhum", () => {
    const patch = montaPatch(payload, true);
    expect("destination_id" in patch).toBe(true);
    expect(patch.destination_id).toBeNull();
  });

  it("tendo tocado num destino de verdade, o uuid vai", () => {
    const id = "c07e27e1-09d7-4499-afeb-fa84671ced3c";
    const patch = montaPatch({ ...payload, destination_id: id }, true);
    expect(patch.destination_id).toBe(id);
  });

  it("mandar null sem intenção seria destrutivo, e é o que a omissão evita", () => {
    const semIntencao = montaPatch(payload, false);
    const comIntencao = montaPatch(payload, true);
    expect(Object.keys(semIntencao)).not.toContain("destination_id");
    expect(Object.keys(comIntencao)).toContain("destination_id");
  });
});
