import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import {
  FRASES,
  gerarSnippet,
  montarUrl,
  slugificar,
  textoDoSelo,
  type FraseId,
} from "./selo.logic";

const padrao = { frase: "parceiro" as FraseId, estilo: "caixa" as const, fundo: "claro" as const };

describe("slugificar", () => {
  it("tira acento, espaço e maiúscula", () => {
    expect(slugificar("Estacionamento São João")).toBe("estacionamento-sao-joao");
  });

  it("não deixa hífen sobrando nas pontas", () => {
    expect(slugificar("  Vira Park!  ")).toBe("vira-park");
  });

  it("devolve vazio quando não sobra caractere útil", () => {
    expect(slugificar("!!!")).toBe("");
  });
});

describe("montarUrl", () => {
  it("aponta para a home canônica quando não há parceiro", () => {
    expect(montarUrl()).toBe(`${SITE_URL}/`);
  });

  it("marca a origem sem quebrar a URL com espaço", () => {
    expect(montarUrl("Vira Park")).toBe(
      `${SITE_URL}/?utm_source=vira-park&utm_medium=selo&utm_campaign=parceiros`,
    );
  });
});

describe("gerarSnippet", () => {
  it("leva o visitante para o domínio canônico", () => {
    expect(gerarSnippet(padrao)).toContain(`href="${SITE_URL}/"`);
  });

  // O selo existe para transferir autoridade. Com nofollow ele não transfere nada,
  // e a regressão seria invisível: o selo continuaria bonito na página.
  it("nunca marca o link como nofollow, sponsored ou ugc", () => {
    for (const frase of FRASES) {
      for (const estilo of ["caixa", "simples", "texto"] as const) {
        const html = gerarSnippet({ ...padrao, frase: frase.id, estilo });
        expect(html).not.toMatch(/nofollow|sponsored|ugc/);
      }
    }
  });

  it("fecha a âncora na marca, em toda frase", () => {
    for (const frase of FRASES) {
      expect(textoDoSelo(frase.id).endsWith("Movepark")).toBe(true);
      expect(gerarSnippet({ ...padrao, frase: frase.id })).toContain(
        '<strong style="font-weight:700">Movepark</strong>',
      );
    }
  });

  it("escreve a marca com M maiúsculo e o resto minúsculo", () => {
    const html = gerarSnippet(padrao);
    expect(html).not.toMatch(/MovePark|MOVEPARK|Move Park/);
  });

  it("usa estilo inline, porque o CSS do site do parceiro não é nosso", () => {
    expect(gerarSnippet(padrao)).toContain("style=");
    expect(gerarSnippet(padrao)).not.toContain("class=");
  });

  it("troca o navy do símbolo por branco no rodapé escuro", () => {
    expect(gerarSnippet({ ...padrao, fundo: "escuro" })).toContain('fill="#FFFFFF"');
    expect(gerarSnippet({ ...padrao, fundo: "claro" })).toContain('fill="#29263F"');
  });

  it("dispensa o símbolo no estilo de texto puro", () => {
    expect(gerarSnippet({ ...padrao, estilo: "texto" })).not.toContain("<svg");
    expect(gerarSnippet({ ...padrao, estilo: "simples" })).toContain("<svg");
  });

  it("não usa travessão em nenhuma frase", () => {
    for (const frase of FRASES) {
      expect(gerarSnippet({ ...padrao, frase: frase.id })).not.toMatch(/[—–]/);
    }
  });
});
