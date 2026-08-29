import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A chave do IndexNow tem que bater com o arquivo que a prova.
 *
 * O protocolo verifica a posse do domínio buscando `https://movepark.co/<chave>.txt` e conferindo
 * se o conteúdo é a própria chave. Ou seja, a chave existe em dois lugares que nenhum compilador
 * liga: uma constante no Deno (`supabase/functions/_shared/indexnow.ts`) e o **nome de um arquivo**
 * em `public/`.
 *
 * Divergir os dois não quebra build nem teste de unidade. Quebra em silêncio na produção: toda
 * submissão passa a voltar 403, a fila enche, e ninguém descobre até alguém perguntar por que o
 * Bing não recebeu nada. É o mesmo risco do host canônico, e a defesa aqui é a mesma que lá.
 *
 * Ver docs/specs/indexnow.md.
 */

const RAIZ = process.cwd();
const FONTE_DA_CHAVE = join(RAIZ, "supabase/functions/_shared/indexnow.ts");

function chaveDeclarada(): string {
  const fonte = readFileSync(FONTE_DA_CHAVE, "utf8");
  const achado = fonte.match(/export const INDEXNOW_KEY = "([^"]+)"/);
  if (!achado) throw new Error("INDEXNOW_KEY não encontrada em _shared/indexnow.ts");
  return achado[1];
}

describe("contrato da chave do IndexNow", () => {
  it("o arquivo público existe com o nome da chave", () => {
    const chave = chaveDeclarada();
    expect(existsSync(join(RAIZ, "public", `${chave}.txt`))).toBe(true);
  });

  it("o conteúdo do arquivo é a própria chave, sem nada em volta", () => {
    const chave = chaveDeclarada();
    const conteudo = readFileSync(join(RAIZ, "public", `${chave}.txt`), "utf8");

    // Sem trim na comparação de propósito: espaço ou quebra de linha extra é o tipo de sujeira
    // que passa despercebida e faz a verificação de posse falhar.
    expect(conteudo).toBe(chave);
  });

  it("a chave está no formato que o protocolo aceita", () => {
    // De 8 a 128 caracteres, entre letras, números e hífen.
    expect(chaveDeclarada()).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
  });

  it("só existe um arquivo de chave em public/, sem chave órfã de troca antiga", () => {
    const chave = chaveDeclarada();

    // Trocar a chave sem apagar a anterior deixa as duas válidas, e o buscador passa a aceitar
    // submissão assinada com uma chave que o repo já não reconhece.
    const candidatos = execSync("git ls-files 'public/*.txt'", { cwd: RAIZ, encoding: "utf8" })
      .split("\n")
      .filter((f) => /^public\/[a-zA-Z0-9-]{8,128}\.txt$/.test(f))
      .filter((f) => !["public/llms.txt", "public/robots.txt"].includes(f));

    expect(candidatos).toEqual([`public/${chave}.txt`]);
  });
});
