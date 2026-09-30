import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A regra da barra final do sitemap, testada de verdade e não por leitura.
 *
 * O teste extrai a expressão do script e a aplica sobre XML de exemplo, em vez de
 * conferir que o texto certo está lá: a versão anterior casava `.../blog/...` em
 * qualquer posição do caminho e vinha carimbando barra nas URLs traduzidas, onde o
 * worker faz o contrário (301 de `/en/blog/x/` para `/en/blog/x`). Um teste que só lê
 * a fonte não veria a diferença.
 */
function regraDaBarra(): RegExp {
  const script = fs.readFileSync(
    path.resolve(__dirname, "../scripts/canonicalize-sitemap.mjs"),
    "utf-8",
  );
  const bruto = script.match(/original\.replace\(\s*(\/.*\/g),/)?.[1];
  expect(bruto, "não achei a expressão da barra final no script").toBeTruthy();
  const corpo = bruto!.slice(1, bruto!.lastIndexOf("/"));
  return new RegExp(corpo, "g");
}

const loc = (u: string) => `<loc>${u}</loc>`;
const aplica = (u: string) => loc(u).replace(regraDaBarra(), "$1/$2");

describe("barra final do sitemap", () => {
  it("põe a barra no blog em português, que é a canônica herdada do WordPress", () => {
    expect(aplica("https://movepark.co/blog")).toBe(loc("https://movepark.co/blog/"));
    expect(aplica("https://movepark.co/blog/vaga-em-confins")).toBe(
      loc("https://movepark.co/blog/vaga-em-confins/"),
    );
  });

  it("NÃO põe barra no blog traduzido, onde a borda faz 301 para a forma sem barra", () => {
    for (const u of [
      "https://movepark.co/en/blog",
      "https://movepark.co/en/blog/parking-at-confins",
      "https://movepark.co/es/blog/estacionamiento-en-confins",
      "https://movepark.co/en/blog/page/2",
    ]) {
      expect(aplica(u), `${u} não pode ganhar barra`).toBe(loc(u));
    }
  });

  it("não duplica barra em URL que já tem", () => {
    expect(aplica("https://movepark.co/blog/vaga/")).toBe(loc("https://movepark.co/blog/vaga/"));
  });

  it("não mexe em quem não é blog", () => {
    for (const u of [
      "https://movepark.co/estacionamentos/aeroporto-guarulhos",
      "https://movepark.co/en/airport-parking/guarulhos-airport",
      "https://movepark.co/faq/como-cancelar",
    ]) {
      expect(aplica(u)).toBe(loc(u));
    }
  });
});
