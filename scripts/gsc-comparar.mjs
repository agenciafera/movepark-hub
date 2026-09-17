/**
 * Compara duas coletas do Search Console, célula a célula, depois da consolidação.
 *
 * Por que existe. O mapa de canonicalização mandou 36 slugs para 301 em 27 e 28/08/2026,
 * e a promessa da consolidação é CONCENTRAR sinal numa URL em vez de espalhá-lo por
 * trinta. Sem medir, a promessa fica no discurso. O `gsc-baseline.mjs` congela uma janela;
 * este script põe duas lado a lado e responde três perguntas: a dona ganhou impressão, o
 * perdedor parou de aparecer e a posição andou para onde.
 *
 * Como ler o que sai:
 *
 *   - **Impressão** é o sinal principal em janela curta. Ela reage antes do clique, que
 *     em duas semanas tem volume baixo demais para significar qualquer coisa.
 *   - **Posição menor é melhor**, então o delta de posição vem como `antes - depois`:
 *     positivo quer dizer que subiu. Célula sem impressão sai vazia, nunca como zero.
 *   - **Concentração** compara as impressões que ficaram nas donas com as que ainda caem
 *     nos slugs redirecionados. Perdedor que continua aparecendo não é erro: o Google
 *     leva semanas para reprocessar um 301. O que importa é ele cair de uma janela para
 *     a outra enquanto a dona não perde volume.
 *
 * Não busca nada em rede: lê os CSVs que o coletor já gravou. Quem precisa de dado novo
 * roda o coletor antes, com a janela que quiser.
 *
 * Uso:
 *   bun run seo:gsc-comparar -- --antes 2026-08-26 --depois 2026-09-14
 *   bun run seo:gsc-comparar -- --antes 2026-08-26 --depois 2026-09-14 --md > relatorio.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { comSinal, compararClusters, concentracao, lerCsv, ptBr } from "./gsc-comparar.logic.mjs";

const DADOS = "docs/specs/dados";
const WORKER = "src/worker.ts";

function argumento(nome, padrao = null) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

/**
 * O mapa de consolidação lido do worker, que é a fonte da verdade de quem venceu o quê.
 *
 * Ler o TypeScript com regex evita transpilar o worker inteiro só para pegar um objeto de
 * string para string. O formato é estável porque o contrato de URL tem teste próprio
 * (`src/blog-urls.contract.test.ts`), então uma mudança de forma quebra lá primeiro.
 */
export function mapaDeConsolidacao(fonte) {
  const inicio = fonte.indexOf("BLOG_CONSOLIDATED_SLUGS");
  if (inicio < 0) return {};
  const corpo = fonte.slice(inicio, fonte.indexOf("\n};", inicio));
  const pares = [...corpo.matchAll(/"([a-z0-9-]+)":\s*\n?\s*"([a-z0-9-]+)"/g)];
  return Object.fromEntries(pares.map((m) => [m[1], m[2]]));
}

function tabelaDeClusters(linhas) {
  const cab =
    "| Praça | Cluster | Impressões antes | Impressões depois | Δ impressões | Posição antes | Posição depois | Δ posição |\n" +
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |";
  const corpo = linhas.map((l) => {
    const pa = l.posicaoAntes == null ? "" : l.posicaoAntes.toFixed(1);
    const pd = l.posicaoDepois == null ? "" : l.posicaoDepois.toFixed(1);
    const dp = l.deltaPosicao == null ? "" : comSinal(l.deltaPosicao, 1);
    return `| ${l.aeroporto} | ${l.cluster} | ${ptBr(l.impressoesAntes)} | ${ptBr(l.impressoesDepois)} | ${comSinal(l.deltaImpressoes)} | ${pa} | ${pd} | ${dp} |`;
  });
  return [cab, ...corpo].join("\n");
}

function principal() {
  const antes = argumento("antes");
  const depois = argumento("depois");
  if (!antes || !depois) {
    console.error(
      "Uso: bun run seo:gsc-comparar -- --antes <AAAA-MM-DD> --depois <AAAA-MM-DD>\n" +
        "As duas datas são o fim da janela de cada coleta, que é como a pasta se chama.\n" +
        `Coletas disponíveis: ${fs
          .readdirSync(DADOS)
          .filter((d) => d.startsWith("gsc-baseline-"))
          .map((d) => d.replace("gsc-baseline-", ""))
          .join(", ")}`,
    );
    return 1;
  }

  const pasta = (fim) => path.join(DADOS, `gsc-baseline-${fim}`);
  for (const fim of [antes, depois]) {
    if (!fs.existsSync(pasta(fim))) {
      console.error(`Não existe a coleta ${fim}. Rode o coletor com --fim ${fim}.`);
      return 1;
    }
  }

  const ler = (fim, arquivo) => lerCsv(fs.readFileSync(path.join(pasta(fim), arquivo), "utf8"));
  const metaDe = (fim) => JSON.parse(fs.readFileSync(path.join(pasta(fim), "meta.json"), "utf8"));

  const celulas = compararClusters(
    ler(antes, "recorte-clusters.csv"),
    ler(depois, "recorte-clusters.csv"),
  );

  const mapa = mapaDeConsolidacao(fs.readFileSync(WORKER, "utf8"));
  const perdedores = Object.keys(mapa);
  const donas = [...new Set(Object.values(mapa))];
  const concAntes = concentracao(ler(antes, "paginas.csv"), donas, perdedores);
  const concDepois = concentracao(ler(depois, "paginas.csv"), donas, perdedores);

  const mA = metaDe(antes);
  const mD = metaDe(depois);
  const totalAntes = celulas.reduce((s, l) => s + l.impressoesAntes, 0);
  const totalDepois = celulas.reduce((s, l) => s + l.impressoesDepois, 0);
  const piorou = celulas.filter((l) => l.deltaPosicao != null && l.deltaPosicao < -1);

  const linhas = [
    `# Search Console depois da consolidação`,
    "",
    `Janela de antes: ${mA.inicio} a ${mA.fim}. Janela de depois: ${mD.inicio} a ${mD.fim}.`,
    `Propriedade: ${mD.propriedade ?? mD.property ?? "sc-domain:movepark.co"}.`,
    "",
    "## Os 12 clusters de cabeça",
    "",
    tabelaDeClusters(celulas),
    "",
    `Total das 12 células: ${ptBr(totalAntes)} impressões antes e ${ptBr(totalDepois)} depois (${comSinal(totalDepois - totalAntes)}).`,
    "",
    "## Concentração: dona contra slug redirecionado",
    "",
    "| Janela | Impressões nas donas | Impressões nos redirecionados | Cliques nas donas |",
    "| --- | ---: | ---: | ---: |",
    `| Antes | ${ptBr(concAntes.donas)} | ${ptBr(concAntes.perdedores)} | ${ptBr(concAntes.cliquesDonas)} |`,
    `| Depois | ${ptBr(concDepois.donas)} | ${ptBr(concDepois.perdedores)} | ${ptBr(concDepois.cliquesDonas)} |`,
    "",
    `São ${donas.length} donas e ${perdedores.length} slugs redirecionados no mapa do worker.`,
    "",
  ];

  if (piorou.length > 0) {
    linhas.push(
      "## Células que perderam posição (mais de 1 posição)",
      "",
      ...piorou.map(
        (l) =>
          `- **${l.aeroporto} · ${l.cluster}**: de ${l.posicaoAntes.toFixed(1)} para ${l.posicaoDepois.toFixed(1)} (${comSinal(l.deltaPosicao, 1)}), com ${comSinal(l.deltaImpressoes)} impressões.`,
      ),
      "",
    );
  } else {
    linhas.push("Nenhuma célula perdeu mais de 1 posição.", "");
  }

  const saida = linhas.join("\n");
  if (process.argv.includes("--md")) {
    console.log(saida);
  } else {
    console.log(saida);
    console.log("Dica: `--md` imprime o mesmo relatório para redirecionar em arquivo.");
  }
  return 0;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? ""))
  process.exit(principal());
