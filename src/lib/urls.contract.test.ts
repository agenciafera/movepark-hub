import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Nenhuma página pode emitir URL da gramática antiga (/destinos, /precos/<slug>, /p/...).
 *
 * A virada de 27/08/2026 (docs/specs/url-estacionamentos.md) moveu o catálogo inteiro para
 * /estacionamentos/<destino>[/<lote>], com 301 na borda para as formas antigas. Dois dias
 * depois, medido em produção, quatro famílias de página ainda declaravam canonical, og:url
 * e JSON-LD na forma antiga: o canonical apontava para uma URL que respondia 301 de volta
 * para a própria página. Loop de canonical faz o Google descartar a declaração e escolher
 * por conta, e foi por isso que /estacionamentos/aeroporto-fortaleza ficou fora do índice
 * enquanto a página de FAQ equivalente ranqueava.
 *
 * A regra: código de `src/` que monta URL absoluta (`${SITE_URL}...`) só usa os caminhos de
 * `@/lib/urls`. O índice /precos e o /precos.md continuam válidos (só o nível de destino
 * migrou), então o padrão proibido é o `/precos/` com barra. O worker fica de fora porque
 * as formas antigas lá são chave de mapa de 301, nunca URL emitida.
 */

const RAIZ = process.cwd();

const PADROES_LEGADOS: { padrao: RegExp; motivo: string }[] = [
  { padrao: /\$\{SITE_URL\}\/destinos/, motivo: "/destinos migrou para /estacionamentos" },
  {
    padrao: /\$\{SITE_URL\}\/precos\//,
    motivo: "/precos/<slug> migrou para /estacionamentos/<destino>/precos",
  },
  { padrao: /\$\{SITE_URL\}\/p\//, motivo: "/p/... migrou para /estacionamentos/<destino>/<lote>" },
];

function arquivosDeSrc(): string[] {
  const saida = execSync("git ls-files 'src'", { cwd: RAIZ, encoding: "utf8" });
  return saida
    .split("\n")
    .filter(Boolean)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.includes(".test."));
}

/** Só linhas de código: comentário pode citar a forma antiga para explicar a migração. */
function linhasDeCodigo(f: string): { linha: string; numero: number }[] {
  return readFileSync(`${RAIZ}/${f}`, "utf8")
    .split("\n")
    .map((linha, i) => ({ linha, numero: i + 1 }))
    .filter(({ linha }) => !/^\s*(\/\/|\*|\/\*)/.test(linha));
}

describe("gramática de URL do catálogo (url-estacionamentos.md)", () => {
  it("nenhum arquivo de src/ emite URL absoluta na forma antiga", () => {
    const violacoes: string[] = [];
    for (const f of arquivosDeSrc()) {
      for (const { linha, numero } of linhasDeCodigo(f)) {
        for (const { padrao, motivo } of PADROES_LEGADOS) {
          if (padrao.test(linha)) violacoes.push(`${f}:${numero} (${motivo})`);
        }
      }
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });
});
