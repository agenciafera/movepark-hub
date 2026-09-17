import { describe, expect, it } from "vitest";
import { comFrescorVivo, formatarDia, linhaDeFrescor } from "./metodologia.logic";
import { METODOLOGIA } from "./pages";
import type { Section } from "./types";

const linha = (over: Partial<Parameters<typeof linhaDeFrescor>[0]> = {}) => ({
  slug: "aeroporto-de-viracopos",
  nome: "Viracopos (VCP)",
  mudouEm: "2026-08-10T14:25:36.765605+00:00",
  conferidaEm: "2026-09-17T07:00:42.203708+00:00",
  ...over,
});

describe("formatarDia", () => {
  it("corta o ISO no dia e escreve em pt-BR", () => {
    expect(formatarDia("2026-08-10T14:25:36.765605+00:00")).toBe("10/08/2026");
  });

  it("data sem horário não retrocede um dia", () => {
    // O `new Date("2026-08-10")` lê meia-noite UTC e em Brasília voltaria para 09/08.
    expect(formatarDia("2026-08-10")).toBe("10/08/2026");
  });

  it("sem data, sem linha", () => {
    expect(formatarDia(null)).toBeNull();
    expect(formatarDia(undefined)).toBeNull();
  });
});

describe("linhaDeFrescor", () => {
  it("separa a mudança da conferência", () => {
    expect(linhaDeFrescor(linha())).toBe("Mudou em 10/08/2026, conferida em 17/09/2026.");
  });

  it("sem conferência, diz só quando mudou", () => {
    expect(linhaDeFrescor(linha({ conferidaEm: null }))).toBe("Mudou em 10/08/2026.");
  });

  it("sem data de mudança a linha não existe", () => {
    // O contrário seria cair no default do leitor, que lê data ausente como "hoje".
    expect(linhaDeFrescor(linha({ mudouEm: null }))).toBeNull();
  });
});

describe("comFrescorVivo", () => {
  const base: Section[] = [
    { id: "precos", title: "Preços", blocks: [{ type: "p", text: "prosa" }] },
    { id: "frescor", title: "Frescor", blocks: [{ type: "p", text: "explicação" }] },
  ];

  it("enxerta a tabela na seção de frescor, sem tocar nas outras", () => {
    const out = comFrescorVivo(base, [linha()]);
    expect(out[0]).toEqual(base[0]);
    expect(out[1].blocks).toHaveLength(2);
    expect(out[1].blocks[1]).toEqual({
      type: "table",
      rows: [{ k: "Viracopos (VCP)", v: "Mudou em 10/08/2026, conferida em 17/09/2026." }],
    });
  });

  it("ordena da tabela que mudou mais recentemente para a mais antiga", () => {
    const out = comFrescorVivo(base, [
      linha({ nome: "Viracopos (VCP)", mudouEm: "2026-08-10T14:25:36+00:00" }),
      linha({ nome: "Guarulhos (GRU)", mudouEm: "2026-09-11T14:21:26+00:00" }),
    ]);
    const bloco = out[1].blocks[1];
    expect(bloco.type === "table" && bloco.rows.map((r) => r.k)).toEqual([
      "Guarulhos (GRU)",
      "Viracopos (VCP)",
    ]);
  });

  it("sem dado, a prosa da seção continua de pé", () => {
    // O loader devolve lista vazia quando a RPC falha no build. A seção não pode sumir do
    // índice lateral por causa de um timeout do banco.
    expect(comFrescorVivo(base, [])).toEqual(base);
  });

  it("a página de verdade tem a seção que o enxerto procura", () => {
    // Renomear o id em pages.ts faria a tabela sumir em silêncio.
    expect(METODOLOGIA.sections.some((s) => s.id === "frescor")).toBe(true);
  });
});

describe("conteúdo da metodologia", () => {
  const texto = JSON.stringify(METODOLOGIA);

  it("declara a origem dos cinco dados que a página promete", () => {
    const tabela = METODOLOGIA.sections
      .find((s) => s.id === "de-onde-vem")
      ?.blocks.find((b) => b.type === "table");
    expect(tabela?.type === "table" && tabela.rows.map((r) => r.k)).toEqual([
      "Preço e balcão",
      "Distância até o terminal",
      "Traslado, van e 24 horas",
      "Piso de permanência",
      "Data de cada tabela",
    ]);
  });

  it("diz o que não publica e por quê (ADR-010)", () => {
    expect(METODOLOGIA.sections.some((s) => s.id === "nao-publicado")).toBe(true);
  });

  it("não usa travessão, que é regra de marca do projeto", () => {
    expect(texto).not.toMatch(/[—–]/);
  });
});
