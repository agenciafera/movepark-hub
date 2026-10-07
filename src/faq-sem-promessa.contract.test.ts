import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guarda de origem da Conteúdo 44 (ADR-009): o texto de FAQ de destino nasce no seed e nos
 * scripts de `gestao/`, e um destino novo copiado de lá voltaria a prometer "vaga garantida".
 * O pgTAP `supabase/tests/faq_sem_promessa.test.sql` confere o banco montado; este confere os
 * arquivos de origem no `bun run test`, sem precisar subir o Supabase.
 *
 * Migration aplicada não entra: ela é histórico e não se edita. A que corrigiu o texto
 * (`20261128165000_faq_sem_vaga_garantida.sql`) cita a frase antiga de propósito.
 */
const RAIZ = path.resolve(__dirname, "..");
const PROMESSA = /(vaga|lugar)[^.']{0,20}garantid|fica garantida/i;

function origens(): string[] {
  const gestao = path.join(RAIZ, "gestao");
  const scripts = fs.existsSync(gestao)
    ? fs
        .readdirSync(gestao)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => path.join("gestao", f))
    : [];
  return ["supabase/seed.sql", ...scripts];
}

describe("FAQ de destino e global sem promessa de vaga (ADR-009)", () => {
  it.each(origens())("%s não grava FAQ de destino ou global com vaga garantida", (arquivo) => {
    const linhas = fs
      .readFileSync(path.join(RAIZ, arquivo), "utf8")
      .split("\n")
      // Só o que é FAQ de destino ou global: o seed também tem texto de unidade e de produto.
      .filter((l) => /'(destination|global)'/.test(l) || arquivo.startsWith("gestao"))
      .filter((l) => !l.trim().startsWith("--"));
    expect(linhas.filter((l) => PROMESSA.test(l))).toEqual([]);
  });
});
