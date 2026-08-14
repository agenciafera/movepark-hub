import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato dos ícones e do card de compartilhamento.
 *
 * Existe por causa de um caso real: a home declarava `og:image` apontando para
 * `/og/home.jpg`, e o arquivo nunca foi commitado. A tag passou meses no ar
 * apontando para um 404, e nenhum teste reclamou porque nenhum teste olhava o
 * par declaração/arquivo. Aqui o par é a asserção.
 */

const raiz = resolve(__dirname, "../..");
const indexHtml = readFileSync(resolve(raiz, "index.html"), "utf8");

/** Caminhos absolutos que o index.html referencia e que precisam existir em public/. */
const REFERENCIADOS = [
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/site.webmanifest",
  "/brand/icone-movepark.svg",
];

describe("ícones e card de compartilhamento", () => {
  it.each(REFERENCIADOS)("o index.html declara %s", (caminho) => {
    expect(indexHtml).toContain(`"${caminho}"`);
  });

  it.each(REFERENCIADOS)("%s existe em public/", (caminho) => {
    expect(existsSync(resolve(raiz, "public", caminho.replace(/^\//, "")))).toBe(true);
  });

  // /favicon.ico é o caminho que WhatsApp, Slack e Discord buscam às cegas, sem ler
  // o HTML. Ele respondia 404 até 14/08/2026.
  it("o favicon.ico é um ICO de verdade, com os três tamanhos", () => {
    const buf = readFileSync(resolve(raiz, "public/favicon.ico"));
    expect(buf.readUInt16LE(0)).toBe(0); // reservado
    expect(buf.readUInt16LE(2)).toBe(1); // tipo 1 = ícone
    expect(buf.readUInt16LE(4)).toBe(3); // 16, 32 e 48
    expect([...new Set([buf[6], buf[22], buf[38]])].sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  it("o manifest aponta só para ícone que existe", () => {
    const manifest = JSON.parse(readFileSync(resolve(raiz, "public/site.webmanifest"), "utf8"));
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icone of manifest.icons) {
      expect(existsSync(resolve(raiz, "public", icone.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("o og:site_name é estático, para valer em toda página", () => {
    expect(indexHtml).toContain('<meta property="og:site_name" content="Movepark" />');
  });
});
