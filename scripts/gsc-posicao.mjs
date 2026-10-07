#!/usr/bin/env node
/**
 * Monitoramento de posição (Conteúdo 62): a posição dos ~60 termos do plano no Google Brasil,
 * em celular e computador, tirada do Search Console. Substitui o Position Tracking do Semrush,
 * que no plano gratuito não passa de 10 termos.
 *
 * Uso:
 *   bun run seo:posicao                                    # últimos 28 dias de dado final
 *   bun run seo:posicao -- --inicio 2026-09-01 --fim 2026-09-28
 *
 * Credencial: a mesma do `gsc-baseline` (`GSC_SERVICE_ACCOUNT_JSON` no `.env.local`).
 *
 * Saída: `docs/specs/dados/gsc-posicao-<fim>/` com `termos.csv`, `meta.json` e `RESUMO.md`. O
 * resumo traz o placar "X de 59 no top 10" e o delta contra a rodada anterior, se houver uma.
 *
 * Contexto em docs/specs/monitoramento-posicao.md.
 */

import fs from "node:fs";
import path from "node:path";

import { emPtBr, escaparPipe, numero, paraCsv } from "./gsc-baseline.logic.mjs";
import { lerCsv } from "./gsc-comparar.logic.mjs";
import { carregarServiceAccount, pegarToken } from "./gsc-auth.mjs";
import {
  DISPOSITIVOS,
  GRUPOS,
  MINIMO_DE_IMPRESSOES,
  TERMOS,
  TOP,
  agregarTermos,
  deltaDePosicao,
  janelaDe28Dias,
  noTop,
  placar,
  termosDuplicados,
} from "./gsc-posicao.logic.mjs";

const DADOS = path.join("docs", "specs", "dados");
const LIMITE_POR_PAGINA = 25000;

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : process.argv[i + 1];
}

/**
 * Todas as linhas `query x device` do Brasil na janela. Uma chamada só, e o casamento com a lista
 * acontece aqui: filtrar termo a termo na API custaria 60 chamadas e perderia as variações de
 * acento que `agregarTermos` junta.
 */
async function consultar({ token, propriedade, inicio, fim }) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propriedade)}/searchAnalytics/query`;
  const linhas = [];
  for (let inicioDaPagina = 0; ; inicioDaPagina += LIMITE_POR_PAGINA) {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: inicio,
        endDate: fim,
        dimensions: ["query", "device"],
        dimensionFilterGroups: [
          { filters: [{ dimension: "country", operator: "equals", expression: "bra" }] },
        ],
        type: "web",
        dataState: "final",
        rowLimit: LIMITE_POR_PAGINA,
        startRow: inicioDaPagina,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      throw new Error(
        `Search Console recusou a consulta: ${resposta.status} ${JSON.stringify(dados)}`,
      );
    }
    const pagina = dados.rows ?? [];
    linhas.push(...pagina);
    if (pagina.length < LIMITE_POR_PAGINA) break;
  }
  console.log(`  query+device (Brasil): ${linhas.length} linhas`);
  return linhas;
}

/** A rodada anterior mais recente, para o delta. Null se esta é a primeira. */
function rodadaAnterior(fim) {
  if (!fs.existsSync(DADOS)) return null;
  const pasta = fs
    .readdirSync(DADOS)
    .filter((p) => p.startsWith("gsc-posicao-") && p.slice("gsc-posicao-".length) < fim)
    .sort()
    .pop();
  if (!pasta) return null;
  const linhas = lerCsv(fs.readFileSync(path.join(DADOS, pasta, "termos.csv"), "utf8"));
  const posicao = new Map(
    linhas.map((l) => [l.termo, l.posicao === "" ? null : Number(l.posicao)]),
  );
  return { fim: pasta.slice("gsc-posicao-".length), posicao };
}

const fmtPosicao = (p) => (p === null ? "sem impressão" : emPtBr(p, 1));
const fmtDelta = (d) => (d === null ? "" : `${d > 0 ? "+" : ""}${emPtBr(d, 1)}`);

function resumoEmMarkdown({ propriedade, inicio, fim, linhas, anterior }) {
  const p = placar(linhas);
  const tabelaPlacar = [
    `| Grupo | Termos | No top 10 | Menos de ${MINIMO_DE_IMPRESSOES} impressões | Conta na meta |`,
    "| --- | --- | --- | --- | --- |",
    ...p.grupos.map(
      (g) => `| ${g.nome} | ${g.termos} | ${g.noTop} | ${g.semDado} | ${g.meta ? "sim" : "não"} |`,
    ),
  ];

  const porGrupo = GRUPOS.map((g) => {
    const doGrupo = linhas
      .filter((l) => l.grupo === g.id)
      .sort((a, b) => (a.total.posicao ?? 999) - (b.total.posicao ?? 999));
    const cabecalho = [
      "Termo",
      "Cluster",
      "Origem",
      ...DISPOSITIVOS.map((d) => `Posição ${d.nome}`),
      "Posição geral",
      ...(anterior ? [`Delta desde ${anterior.fim}`] : []),
      "Impressões",
      "Cliques",
    ];
    const corpo = doGrupo.map((l) => {
      const celulas = [
        escaparPipe(l.termo),
        l.cluster,
        l.origem,
        ...DISPOSITIVOS.map((d) => fmtPosicao(l.porDispositivo[d.id].posicao)),
        `${noTop(l) ? "**" : ""}${fmtPosicao(l.total.posicao)}${noTop(l) ? "**" : ""}`,
        ...(anterior
          ? [fmtDelta(deltaDePosicao(anterior.posicao.get(l.termo) ?? null, l.total.posicao))]
          : []),
        emPtBr(l.total.impressoes),
        emPtBr(l.total.cliques),
      ];
      return `| ${celulas.join(" | ")} |`;
    });
    return [
      `### ${g.nome}`,
      "",
      `| ${cabecalho.join(" | ")} |`,
      `| ${cabecalho.map(() => "---").join(" | ")} |`,
      ...corpo,
      "",
    ].join("\n");
  });

  return [
    `# Posição dos termos monitorados - ${fim}`,
    "",
    `Propriedade: \`${propriedade}\` · Janela: **${inicio} a ${fim}** (dado final) · País: Brasil.`,
    "",
    "Retrato congelado. Não edite os números: para atualizar, rode `bun run seo:posicao`, que",
    "grava uma pasta nova com a data nova. Como ler: `docs/specs/monitoramento-posicao.md`.",
    "",
    "## Placar",
    "",
    `**Termos da meta no top ${TOP}: ${p.meta.noTop} de ${p.meta.termos}** (${p.meta.semDado} com menos de ${MINIMO_DE_IMPRESSOES} impressões na janela, sem dado para contar).`,
    "",
    ...tabelaPlacar,
    "",
    `Posição em negrito: termo no top 10. Delta positivo: subiu. Termo com menos de ${MINIMO_DE_IMPRESSOES} impressões não conta no top 10, mesmo com posição baixa.`,
    "",
    "## Por grupo",
    "",
    ...porGrupo,
  ].join("\n");
}

async function principal() {
  const duplicados = termosDuplicados();
  if (duplicados.length) {
    console.error(`Termos repetidos na lista, depois de tirar acento: ${duplicados.join(", ")}`);
    return 1;
  }

  const propriedade = argumento("property", process.env.GSC_PROPERTY ?? "sc-domain:movepark.co");
  const janela = janelaDe28Dias(new Date());
  const inicio = argumento("inicio", janela.inicio);
  const fim = argumento("fim", janela.fim);
  const destino = path.join(DADOS, `gsc-posicao-${fim}`);

  console.log("Monitoramento de posição");
  console.log(`  propriedade: ${propriedade}`);
  console.log(`  janela: ${inicio} a ${fim} · ${TERMOS.length} termos`);

  const token = await pegarToken(carregarServiceAccount());
  const linhas = agregarTermos(await consultar({ token, propriedade, inicio, fim }));
  const anterior = rodadaAnterior(fim);

  fs.mkdirSync(destino, { recursive: true });
  const gravar = (nome, conteudo) => {
    fs.writeFileSync(path.join(destino, nome), conteudo);
    console.log(`  gravado ${path.join(destino, nome)}`);
  };

  gravar(
    "termos.csv",
    paraCsv(
      [
        { titulo: "grupo", valor: (l) => l.grupo },
        { titulo: "cluster", valor: (l) => l.cluster },
        { titulo: "origem", valor: (l) => l.origem },
        { titulo: "termo", valor: (l) => l.termo },
        ...DISPOSITIVOS.flatMap((d) => [
          {
            titulo: `posicao_${d.id.toLowerCase()}`,
            valor: (l) => numero(l.porDispositivo[d.id].posicao, 2),
          },
          {
            titulo: `impressoes_${d.id.toLowerCase()}`,
            valor: (l) => l.porDispositivo[d.id].impressoes,
          },
        ]),
        { titulo: "posicao", valor: (l) => numero(l.total.posicao, 2) },
        { titulo: "impressoes", valor: (l) => l.total.impressoes },
        { titulo: "cliques", valor: (l) => l.total.cliques },
        { titulo: "no_top10", valor: (l) => (noTop(l) ? "sim" : "nao") },
      ],
      linhas,
    ),
  );

  const p = placar(linhas);
  gravar(
    "meta.json",
    JSON.stringify(
      {
        propriedade,
        inicio,
        fim,
        pais: "bra",
        dataState: "final",
        geradoEm: new Date().toISOString(),
        script: "scripts/gsc-posicao.mjs",
        termos: TERMOS.length,
        meta: p.meta,
        anterior: anterior?.fim ?? null,
      },
      null,
      2,
    ) + "\n",
  );
  gravar("RESUMO.md", resumoEmMarkdown({ propriedade, inicio, fim, linhas, anterior }));

  console.log(`\nTermos da meta no top ${TOP}: ${p.meta.noTop} de ${p.meta.termos}.`);
  console.log("Comite a pasta para a rodada ficar versionada.");
}

principal()
  .then((codigo) => process.exit(codigo ?? 0))
  .catch((erro) => {
    console.error(`\n${erro.message}`);
    process.exit(1);
  });
