import { describe, expect, it } from "vitest";

/*
 * O guarda de preço vive em `scripts/` porque roda no CI e no cron contra o banco, fora
 * do app. Só as funções PURAS são importadas aqui; o `main()` do script está atrás de um
 * `import.meta.url === argv[1]`, então importar não dispara rede.
 *
 * Os casos abaixo são os bugs reais achados na auditoria de 08/09/2026, congelados como
 * regressão: se alguém reescrever o casamento de nome ou a comparação de valor e um deles
 * voltar a passar, o teste quebra.
 */
import {
  diasDesde,
  divergencias,
  linhasComPreco,
  nomeCurto,
  paraNumero,
  tokensDistintivos,
} from "../scripts/check-precos-faq.mjs";

/** Como a praça de Viracopos estava no banco em 08/09/2026. */
const VIRACOPOS = new Map([
  ["Bandeira Park", { valores: [18.49, 93.17, 152.7, 239.4], temData: true }],
  ["KM64", { valores: [19, 133], temData: true }],
  ["Yellow Parking", { valores: [24.99, 174.93], temData: true }],
  ["Estapar Oficial", { valores: [31, 217], temData: true }],
  ["Viracopos Aeroparking", { valores: [34.7, 242.9], temData: true }],
  ["BR Parking", { valores: [], temData: false }],
  ["Eco22", { valores: [], temData: false }],
]);
const PALAVRAS_VCP = ["Aeroporto", "de", "Viracopos", "Campinas"];

describe("nomeCurto", () => {
  it("corta o sufixo do nome público", () => {
    expect(nomeCurto("KM64 - Estacionamento Aeroporto Viracopos")).toBe("KM64");
    expect(nomeCurto("Bandeira Park - Estacionamento Aeroporto Viracopos")).toBe("Bandeira Park");
  });

  it("aguenta nome sem sufixo e nulo", () => {
    expect(nomeCurto("KM64")).toBe("KM64");
    expect(nomeCurto(null)).toBe("");
  });
});

describe("paraNumero", () => {
  it("lê vírgula decimal e separador de milhar", () => {
    expect(paraNumero("19,00")).toBe(19);
    expect(paraNumero("1.377,00")).toBe(1377);
  });
});

describe("tokensDistintivos", () => {
  const tokens = tokensDistintivos([...VIRACOPOS.keys()], PALAVRAS_VCP);

  it("descarta token repetido entre pátios", () => {
    // "parking" está em Yellow Parking e BR Parking, então não identifica nenhum dos dois.
    expect(tokens.get("Yellow Parking")).toContain("yellow");
    expect(tokens.get("Yellow Parking")).not.toContain("parking");
  });

  it("descarta palavra da praça, que casaria qualquer célula", () => {
    expect(tokens.get("Viracopos Aeroparking")).toEqual(["aeroparking"]);
  });

  it("descarta palavra genérica de categoria", () => {
    expect(tokens.get("Bandeira Park")).toEqual(["bandeira"]);
  });

  it("não devolve pátio sem nenhum token seguro, em vez de arriscar", () => {
    // "BR Parking": "brxx" tem menos de 4 letras e "parking" é repetido.
    expect(tokens.has("BR Parking")).toBe(false);
  });
});

describe("linhasComPreco", () => {
  it("pega só linha de tabela que tem valor", () => {
    const md = [
      "Comparativo:",
      "",
      "| Estacionamento | Diária | Como é |",
      "|---|---|---|",
      "| KM64 | R$ 19,00 | Descoberta |",
      "| Eco22 | não publica | Sem tabela |",
    ].join("\n");
    const linhas = linhasComPreco(md);
    expect(linhas).toHaveLength(1);
    expect(linhas[0][0]).toBe("KM64");
  });

  it("devolve vazio para texto sem tabela e para nulo", () => {
    expect(linhasComPreco("prosa com R$ 19,00 solto")).toEqual([]);
    expect(linhasComPreco(null)).toEqual([]);
  });
});

describe("divergencias", () => {
  it("pega o bug do KM64: a FAQ dizia R$ 23,99 e o pesquisado era R$ 19,00", () => {
    const md = "| KM64 | R$ 23,99 | Guia de preços de julho de 2026 |";
    const achados = divergencias(md, VIRACOPOS, PALAVRAS_VCP);
    expect(achados).toHaveLength(1);
    expect(achados[0].tipo).toBe("divergência");
    expect(achados[0].nome).toBe("KM64");
  });

  it("pega o bug do oficial: R$ 28,00 na FAQ contra R$ 31,00 pesquisado", () => {
    const md = "| Estacionamento oficial (Estapar) | R$ 28,00 | Bolsão econômico |";
    const achados = divergencias(md, VIRACOPOS, PALAVRAS_VCP);
    expect(achados.map((a) => a.nome)).toEqual(["Estapar Oficial"]);
  });

  it("aceita o valor certo", () => {
    const md = "| KM64 | R$ 19,00 | Descoberta, promocional desde julho |";
    expect(divergencias(md, VIRACOPOS, PALAVRAS_VCP)).toEqual([]);
  });

  it("aceita a FAQ citar o total de 7 diárias em vez da diária", () => {
    const md = "| KM64 | R$ 133,00 nas 7 diárias | Sem pacote semanal |";
    expect(divergencias(md, VIRACOPOS, PALAVRAS_VCP)).toEqual([]);
  });

  it("acusa preço sem lastro, que foi o caso de Congonhas", () => {
    const md = "| Eco22 | R$ 25,00 | Cotado em plataforma de reserva |";
    const achados = divergencias(md, VIRACOPOS, PALAVRAS_VCP);
    expect(achados).toHaveLength(1);
    expect(achados[0].tipo).toBe("sem lastro");
  });

  it("não reclama de linha sem valor nenhum", () => {
    expect(divergencias("| Eco22 | não publica | Sem tabela |", VIRACOPOS, PALAVRAS_VCP)).toEqual(
      [],
    );
  });

  it("ignora parceiro, cujo preço sai do motor e não está na lista de mapeados", () => {
    const md = "| **Virapark (parceiro Movepark)** | R$ 40,00 | Vaga coberta |";
    expect(divergencias(md, VIRACOPOS, PALAVRAS_VCP)).toEqual([]);
  });

  it("não confunde dois pátios que compartilham a palavra Parking", () => {
    const md = "| Yellow Parking | R$ 24,99 | Mínimo de 2 diárias |";
    expect(divergencias(md, VIRACOPOS, PALAVRAS_VCP)).toEqual([]);
  });
});

describe("diasDesde", () => {
  it("conta os dias corridos desde a pesquisa", () => {
    expect(diasDesde("2026-09-08", new Date("2026-09-09T10:00:00Z"))).toBe(1);
    expect(diasDesde("2026-06-11", new Date("2026-09-09T10:00:00Z"))).toBe(90);
  });
});

describe("casamento por palavra inteira", () => {
  /*
   * Regressão do falso positivo achado ao rodar contra a produção em 09/09/2026: a linha
   * do "Viracopos Aeroparking" acusava o "Aero Viracopos", que é outro pátio, porque
   * "aeroparking" CONTÉM "aero". Nome de pátio casa por palavra, nunca por pedaço dela.
   */
  const COM_HOMONIMO = new Map([
    ["Viracopos Aeroparking", { valores: [34.7, 242.9], temData: true }],
    ["Aero Viracopos", { valores: [], temData: false }],
  ]);

  it("não acusa o vizinho cujo nome é prefixo do outro", () => {
    const md = "| Viracopos Aeroparking | R$ 34,70 | Coberta sai R$ 29,20 |";
    expect(divergencias(md, COM_HOMONIMO, PALAVRAS_VCP)).toEqual([]);
  });

  it("ainda acusa o pátio certo quando é ele mesmo na linha", () => {
    const md = "| Aero Viracopos | R$ 30,00 | Cotado por telefone |";
    const achados = divergencias(md, COM_HOMONIMO, PALAVRAS_VCP);
    expect(achados.map((a) => a.nome)).toEqual(["Aero Viracopos"]);
  });
});
