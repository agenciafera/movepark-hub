import { describe, expect, it } from "vitest";
import {
  ALTURA_MAXIMA,
  MEDIDAS,
  montarLayout,
  quebrarLinhas,
  textoParaImagem,
  type FalaParaImagem,
} from "./conversaEmImagem";

/** Medidor falso: 10px por caractere. Torna a conta de layout verificável na mão. */
const medir = (t: string) => t.length * 10;

const fala = (over: Partial<FalaParaImagem> = {}): FalaParaImagem => ({
  papel: "cliente",
  autor: "",
  texto: "ola",
  em: "2026-08-28T23:00:00.000Z",
  anexos: [],
  ...over,
});

describe("quebrarLinhas", () => {
  it("quebra na largura disponível", () => {
    expect(quebrarLinhas("aa bb cc", 50, medir)).toEqual(["aa bb", "cc"]);
  });

  it("respeita a quebra que a mensagem já tinha", () => {
    // A Mia manda lista de contatos em linhas separadas; juntar tudo emenda o parágrafo.
    expect(quebrarLinhas("um\ndois", 1000, medir)).toEqual(["um", "dois"]);
  });

  it("palavra maior que a linha não é partida no meio", () => {
    // O caso real é a URL do voucher: quebrada, ela deixa de ser clicável e de ser lida.
    const url = "https://movepark.co/voucher/abcdefghijklmno";
    expect(quebrarLinhas(url, 50, medir)).toEqual([url]);
  });
});

describe("textoParaImagem", () => {
  it("tira a marcação e marca o anexo pelo que era", () => {
    const t = textoParaImagem(
      fala({
        texto: "segue o **voucher**",
        anexos: [{ parte: 0, mime: "application/pdf", tipo: "arquivo", nome: "v.pdf", bytes: 1 }],
      }),
    );
    expect(t).toBe("segue o voucher\n<arquivo: v.pdf>");
  });
});

describe("montarLayout", () => {
  it("cliente à esquerda, quem atende à direita", () => {
    const l = montarLayout(
      [fala({ texto: "oi" }), fala({ papel: "agente", autor: "Mia", texto: "oi" })],
      "5541988149449",
      medir,
    );
    expect(l.blocos[0].x).toBe(MEDIDAS.margem);
    expect(l.blocos[1].x + l.blocos[1].largura).toBe(MEDIDAS.largura - MEDIDAS.margem);
  });

  it("só quem atende leva assinatura: a do cliente já está no título", () => {
    const l = montarLayout(
      [fala({ texto: "oi" }), fala({ papel: "agente", autor: "Kallef", texto: "oi" })],
      "5541988149449",
      medir,
    );
    expect(l.blocos[0].autor).toBe("");
    expect(l.blocos[1].autor).toBe("Kallef");
    expect(l.titulo).toBe("Conversa com (41) 98814-9449");
  });

  it("a bolha nunca passa da largura máxima, e a altura acompanha as linhas", () => {
    const l = montarLayout([fala({ texto: "palavra ".repeat(60) })], "5541988149449", medir);
    const b = l.blocos[0];
    expect(b.largura).toBeLessThanOrEqual(MEDIDAS.maxBolha);
    expect(b.altura).toBe(b.linhas.length * MEDIDAS.linha + MEDIDAS.padY * 2);
    expect(l.altura).toBeGreaterThan(b.altura);
  });

  it("a hora cabe no vão, mesmo em duas falas seguidas do mesmo lado", () => {
    // A hora e' desenhada abaixo da bolha. Sem vao suficiente ela encosta na bolha
    // seguinte, que e' o caso de duas falas do cliente em sequencia: nao ha' nome no
    // meio para abrir espaco.
    const l = montarLayout([fala({ texto: "um" }), fala({ texto: "dois" })], "5541988149449", medir);
    const primeiro = l.blocos[0];
    const folga = l.blocos[1].y - (primeiro.y + primeiro.altura);
    expect(folga).toBeGreaterThanOrEqual(20);
  });

  it("fala sem texto e sem anexo não vira bolha vazia", () => {
    // Chamada de tool entra na conversa como mensagem sem conteúdo nenhum.
    expect(montarLayout([fala({ texto: "" })], "5541988149449", medir).blocos).toEqual([]);
  });

  it("conversa longa passa do teto, e quem chama precisa poder ver isso", () => {
    // Truncar em silêncio seria pior: a pessoa compartilharia meia conversa achando
    // que compartilhou toda.
    const muitas = Array.from({ length: 900 }, () => fala({ texto: "uma linha qualquer" }));
    expect(montarLayout(muitas, "5541988149449", medir).altura).toBeGreaterThan(ALTURA_MAXIMA);
  });
});
