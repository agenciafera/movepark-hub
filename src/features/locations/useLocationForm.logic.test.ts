import { describe, expect, it } from "vitest";
import {
  parsePositiveInt,
  isValidMinutes,
  googleMapsUrlFromPlaceId,
  parseNonNegativeInt,
  uuidOuNulo,
  mensagemDeErro,
  statusFieldFrom,
  statusFieldToPayload,
  splitAdsSnippet,
  validateAdsConversion,
  normalizarIdConversaoAds,
  normalizarRotuloConversaoAds,
  normalizarIdGa4,
  validateGa4MeasurementId,
} from "./useLocationForm";

describe("statusFieldFrom / statusFieldToPayload (Rascunho como status na tela)", () => {
  // O banco guarda `status` (enum compartilhado com empresa) + `is_draft`. Na tela é UM
  // select: Ativa, Inativa, Suspensa, Rascunho. Rascunho = ativa por baixo, com is_draft.
  it("unidade ativa em rascunho aparece como Rascunho", () => {
    expect(statusFieldFrom({ status: "active", is_draft: true })).toBe("draft");
  });
  it("unidade ativa sem rascunho aparece como Ativa; sem unidade, nasce Ativa", () => {
    expect(statusFieldFrom({ status: "active", is_draft: false })).toBe("active");
    expect(statusFieldFrom({ status: "suspended" })).toBe("suspended");
    expect(statusFieldFrom(null)).toBe("active");
  });
  it("Rascunho grava status ativo + is_draft; os outros limpam o is_draft", () => {
    expect(statusFieldToPayload("draft")).toEqual({ status: "active", is_draft: true });
    expect(statusFieldToPayload("active")).toEqual({ status: "active", is_draft: false });
    expect(statusFieldToPayload("inactive")).toEqual({ status: "inactive", is_draft: false });
  });
});

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

describe("normalizarIdConversaoAds (o `AW-` é o id da tag, não o id de conversão)", () => {
  // Por que isto existe: o campo "Código de conversão" da tag do Google Ads no GTM aceita só
  // inteiro positivo. Com `AW-17302388529` ali, o GTM recusaria na mão ("O valor precisa ser um
  // número inteiro positivo ou 0"), mas o valor chega por variável de camada de dados e a
  // validação do GTM só roda para valor fixo: a tag salva calada e a conversão falha em runtime,
  // sem erro em lugar nenhum. As duas unidades configuradas ficaram assim até 18/11/2026.
  it("o número puro passa inteiro", () => {
    expect(normalizarIdConversaoAds("17302388529")).toBe("17302388529");
  });
  it("tira o AW- do id da tag, em maiúscula ou minúscula", () => {
    expect(normalizarIdConversaoAds("AW-17302388529")).toBe("17302388529");
    expect(normalizarIdConversaoAds("aw-17302388529")).toBe("17302388529");
  });
  it("aguenta espaço sobrando, inclusive depois do AW-", () => {
    expect(normalizarIdConversaoAds("  17302388529  ")).toBe("17302388529");
    expect(normalizarIdConversaoAds("AW- 17302388529")).toBe("17302388529");
    expect(normalizarIdConversaoAds(" aw-17302388529 ")).toBe("17302388529");
  });
  it("o send_to inteiro vira só o id: o rótulo fica para o outro campo", () => {
    expect(normalizarIdConversaoAds("AW-17302388529/AbCd_eFgH")).toBe("17302388529");
    expect(normalizarIdConversaoAds("17302388529/AbCd_eFgH")).toBe("17302388529");
  });

  // Os três que caem aqui por confusão. O customer id é o mais comum: fica no topo da conta do
  // Ads, tem a mesma cara de id e não serve para conversão nenhuma.
  it("recusa o id de GA4 no campo errado", () => {
    expect(normalizarIdConversaoAds("G-YWNH4G3PNV")).toBeNull();
  });
  it("recusa o customer id com hífens", () => {
    expect(normalizarIdConversaoAds("123-456-7890")).toBeNull();
  });
  it("recusa letra onde era número e número curto demais", () => {
    expect(normalizarIdConversaoAds("AW-ABC123")).toBeNull();
    expect(normalizarIdConversaoAds("123")).toBeNull();
    expect(normalizarIdConversaoAds("AW-")).toBeNull();
  });
  it("vazio, nulo e indefinido viram null, não string vazia", () => {
    expect(normalizarIdConversaoAds("")).toBeNull();
    expect(normalizarIdConversaoAds("   ")).toBeNull();
    expect(normalizarIdConversaoAds(null)).toBeNull();
    expect(normalizarIdConversaoAds(undefined)).toBeNull();
  });
  it("é idempotente: normalizar o já normalizado não muda nada", () => {
    const uma = normalizarIdConversaoAds("AW-17302388529");
    expect(normalizarIdConversaoAds(uma)).toBe(uma);
  });
});

describe("normalizarRotuloConversaoAds (mesma defesa na outra ponta)", () => {
  it("o rótulo puro passa inteiro", () => {
    expect(normalizarRotuloConversaoAds("AbCd_eFgH")).toBe("AbCd_eFgH");
  });
  it("snippet inteiro colado no campo do rótulo fica com o que está depois da barra", () => {
    expect(normalizarRotuloConversaoAds("AW-17302388529/AbCd_eFgH")).toBe("AbCd_eFgH");
  });
  it("recusa caractere fora do snippet e rótulo curto demais", () => {
    expect(normalizarRotuloConversaoAds("tem espaço no meio")).toBeNull();
    expect(normalizarRotuloConversaoAds("AbC")).toBeNull();
    expect(normalizarRotuloConversaoAds("")).toBeNull();
    expect(normalizarRotuloConversaoAds(null)).toBeNull();
  });
});

describe("conversão do Google Ads por unidade (splitAdsSnippet / validateAdsConversion)", () => {
  // A tela do Google Ads oferece o snippet inteiro para copiar (`AW-123/rótulo`). Colar no campo
  // de id tem que preencher os dois, porque fatiar à mão é onde o rótulo se perde.
  it("o snippet inteiro colado no id vira id normalizado + rótulo", () => {
    expect(splitAdsSnippet(" AW-326904374/EaA6CMu82aYbELbU8JsB ")).toEqual({
      id: "326904374",
      label: "EaA6CMu82aYbELbU8JsB",
    });
  });
  it("sem barra, devolve só o id normalizado e não mexe no rótulo", () => {
    expect(splitAdsSnippet("AW-326904374")).toEqual({ id: "326904374", label: null });
  });
  it("no meio da digitação, o que não normaliza fica na tela como foi escrito", () => {
    // Senão o campo apagaria o que a pessoa está digitando a cada tecla.
    expect(splitAdsSnippet("AW-17")).toEqual({ id: "AW-17", label: null });
  });

  // Espelha as constraints do banco: os dois vazios ou os dois preenchidos e no formato.
  it("os dois vazios é válido: a unidade não tem conta própria", () => {
    expect(validateAdsConversion("", "  ")).toBeNull();
  });
  it("metade preenchida é recusada, com a mensagem dizendo qual metade falta", () => {
    expect(validateAdsConversion("326904374", "")).toMatch(/rótulo/);
    expect(validateAdsConversion("", "EaA6CMu82aYbELbU8JsB")).toMatch(/ID de conversão/);
  });
  it("o id da tag é aceito e normalizado, não recusado", () => {
    // O `AW-` não é erro de digitação, é o que o Google mostra. A tela aceita e grava o número.
    expect(validateAdsConversion("AW-326904374", "EaA6CMu82aYbELbU8JsB")).toBeNull();
  });
  it("o que não é id de conversão é recusado, explicando a diferença", () => {
    expect(validateAdsConversion("123-456-7890", "EaA6CMu82aYbELbU8JsB")).toMatch(/ID da tag/);
    expect(validateAdsConversion("G-YWNH4G3PNV", "EaA6CMu82aYbELbU8JsB")).toMatch(/só o número/);
    expect(validateAdsConversion("326904374", "tem espaço")).toMatch(/depois da barra/);
  });
  it("o par no formato passa", () => {
    expect(validateAdsConversion("326904374", "EaA6CMu82aYbELbU8JsB")).toBeNull();
  });
});

describe("ID do GA4 do parceiro (normalizarIdGa4 / validateGa4MeasurementId)", () => {
  // Espelha a constraint `location_ga4_measurement_id_format`. Id errado aqui é tag que dispara e
  // não registra nada, em silêncio: a mesma falha que o id do Ads teve até 18/11/2026.
  it("o ID da métrica passa inteiro", () => {
    expect(normalizarIdGa4("G-AB12CD34EF")).toBe("G-AB12CD34EF");
  });
  it("sobe para maiúsculas e tira espaço sobrando", () => {
    expect(normalizarIdGa4("  g-ab12cd34ef ")).toBe("G-AB12CD34EF");
    expect(normalizarIdGa4("G- AB12CD34EF")).toBe("G-AB12CD34EF");
  });
  it("recusa id de outro produto do Google", () => {
    expect(normalizarIdGa4("AW-17302388529")).toBeNull();
    expect(normalizarIdGa4("GTM-KHBBZT9")).toBeNull();
    expect(normalizarIdGa4("UA-12345678-1")).toBeNull();
    expect(normalizarIdGa4("GT-MK5T7H2J")).toBeNull();
  });
  it("recusa o id numérico da propriedade e id curto demais", () => {
    expect(normalizarIdGa4("284173242")).toBeNull();
    expect(normalizarIdGa4("G-AB12")).toBeNull();
  });
  it("vazio, nulo e indefinido viram null, não string vazia", () => {
    expect(normalizarIdGa4("")).toBeNull();
    expect(normalizarIdGa4(null)).toBeNull();
    expect(normalizarIdGa4(undefined)).toBeNull();
  });
  it("campo vazio é válido: a unidade não manda eventos para GA4 de parceiro", () => {
    expect(validateGa4MeasurementId("")).toBeNull();
    expect(validateGa4MeasurementId("   ")).toBeNull();
  });
  it("id no formato passa; id de Ads é recusado dizendo de onde ele é", () => {
    expect(validateGa4MeasurementId("g-ab12cd34ef")).toBeNull();
    expect(validateGa4MeasurementId("AW-17302388529")).toMatch(/AW- é do Google Ads/);
  });
});
