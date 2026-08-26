#!/usr/bin/env node
/**
 * Baseline do Search Console: congela 16 meses de desempenho por consulta e por página antes
 * de a Fase 1 do plano de conteúdo publicar qualquer coisa, para daqui a 90 dias existir um
 * marco zero contra o qual comparar.
 *
 * Uso:
 *   bun run seo:gsc-baseline                       # janela cheia de 16 meses
 *   bun run seo:gsc-baseline -- --inicio 2025-01-01 --fim 2025-12-31
 *
 * Credencial: service account com acesso de leitura na propriedade, apontada por
 * `GSC_SERVICE_ACCOUNT_JSON` (caminho do arquivo ou o JSON inline) no `.env.local`.
 * O e-mail da service account precisa estar adicionado como usuário da propriedade no
 * Search Console. Propriedade em `GSC_PROPERTY` (padrão: `sc-domain:movepark.co`).
 *
 * Saída: `docs/specs/dados/gsc-baseline-<fim>/` com os CSVs, o recorte de clusters e o meta.
 * Nada aqui é destrutivo: uma segunda rodada no mesmo dia reescreve a mesma pasta.
 *
 * Contexto em docs/specs/baseline-search-console.md.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  AEROPORTOS,
  CLUSTERS,
  aeroportoDaUrl,
  classificarConsultas,
  janelaDe16Meses,
  numero,
  paraCsv,
  posicaoPonderada,
  recorteDeClusters,
} from "./gsc-baseline.logic.mjs";

const ESCOPO = "https://www.googleapis.com/auth/webmasters.readonly";
const LIMITE_POR_PAGINA = 25000;

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : process.argv[i + 1];
}

function carregarServiceAccount() {
  const bruto = process.env.GSC_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!bruto) {
    throw new Error(
      "Falta a credencial. Defina GSC_SERVICE_ACCOUNT_JSON no .env.local com o caminho do JSON " +
        "da service account (ou o JSON inline) e adicione o e-mail dela como usuário da " +
        "propriedade no Search Console.",
    );
  }
  const conteudo = bruto.trim().startsWith("{") ? bruto : fs.readFileSync(bruto.trim(), "utf8");
  const sa = JSON.parse(conteudo);
  if (!sa.client_email || !sa.private_key) {
    throw new Error("JSON da service account sem client_email ou private_key.");
  }
  return sa;
}

const base64url = (dado) => Buffer.from(dado).toString("base64url");

/**
 * Troca a service account por um access token. É o fluxo JWT bearer do OAuth, feito à mão com
 * o `crypto` do Node para o script não arrastar uma dependência de SDK do Google só por isto.
 */
async function pegarToken(sa) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: ESCOPO,
      aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinatura = crypto
    .createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(sa.private_key)
    .toString("base64url");

  const resposta = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`Falha ao autenticar: ${resposta.status} ${JSON.stringify(dados)}`);
  }
  return dados.access_token;
}

/**
 * Uma consulta à Search Analytics, paginada até a API parar de devolver linha.
 *
 * `dataState: "final"` de propósito: dado fresco ainda muda de valor por alguns dias e um
 * baseline que muda depois de gravado não serve de baseline.
 */
async function consultar({ token, propriedade, inicio, fim, dimensoes }) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propriedade)}/searchAnalytics/query`;
  const linhas = [];
  for (let inicioDaPagina = 0; ; inicioDaPagina += LIMITE_POR_PAGINA) {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: inicio,
        endDate: fim,
        dimensions: dimensoes,
        type: "web",
        dataState: "final",
        rowLimit: LIMITE_POR_PAGINA,
        startRow: inicioDaPagina,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      throw new Error(
        `Search Console recusou a consulta ${dimensoes.join("+")}: ${resposta.status} ${JSON.stringify(dados)}`,
      );
    }
    const pagina = dados.rows ?? [];
    linhas.push(...pagina);
    process.stdout.write(`  ${dimensoes.join("+")}: ${linhas.length} linhas\r`);
    if (pagina.length < LIMITE_POR_PAGINA) break;
  }
  process.stdout.write(`  ${dimensoes.join("+")}: ${linhas.length} linhas\n`);
  return linhas;
}

const colunasDeMetrica = [
  { titulo: "cliques", valor: (l) => l.clicks },
  { titulo: "impressoes", valor: (l) => l.impressions },
  { titulo: "ctr", valor: (l) => numero((l.ctr ?? 0) * 100, 2) },
  { titulo: "posicao", valor: (l) => numero(l.position, 2) },
];

/** Tabela markdown do recorte: é o que alguém abre daqui a 90 dias sem rodar nada. */
function resumoEmMarkdown({ propriedade, inicio, fim, recorte, consultas, paginas }) {
  const porAeroporto = AEROPORTOS.map((aeroporto) => {
    const linhas = CLUSTERS.map((cluster) => {
      const c = recorte.find((r) => r.aeroporto === aeroporto.code && r.cluster === cluster.id);
      return `| ${cluster.nome} | ${c.consultas} | ${c.cliques} | ${c.impressoes} | ${numero(c.posicao, 1) || "sem impressão"} |`;
    });
    const top = recorte
      .filter((r) => r.aeroporto === aeroporto.code)
      .flatMap((r) => r.topConsultas.map((t) => ({ ...t, cluster: r.cluster })))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15)
      .map(
        (t) =>
          `| ${t.consulta} | ${t.cluster} | ${t.clicks} | ${t.impressions} | ${numero(t.position, 1)} |`,
      );
    return [
      `### ${aeroporto.nome}`,
      "",
      "| Cluster | Consultas | Cliques | Impressões | Posição média |",
      "| --- | --- | --- | --- | --- |",
      ...linhas,
      "",
      "Os 15 termos de maior impressão neste aeroporto:",
      "",
      "| Consulta | Cluster | Cliques | Impressões | Posição |",
      "| --- | --- | --- | --- | --- |",
      ...(top.length ? top : ["| (nenhuma consulta classificada) | | | | |"]),
      "",
    ].join("\n");
  });

  const topPaginas = [...paginas]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30)
    .map((p) => {
      const url = p.keys[0];
      return `| ${url} | ${aeroportoDaUrl(url) ?? "-"} | ${p.clicks} | ${p.impressions} | ${numero(p.position, 1)} |`;
    });

  return [
    `# Baseline do Search Console - ${fim}`,
    "",
    `Propriedade: \`${propriedade}\` · Janela: **${inicio} a ${fim}** (16 meses, dado final).`,
    "",
    "Este arquivo é o marco zero da Fase 1 do plano de conteúdo. Não edite os números: para",
    "atualizar, rode `bun run seo:gsc-baseline` de novo, que grava uma pasta nova com a data nova.",
    "",
    "## Total da propriedade",
    "",
    `- Consultas distintas: **${consultas.length.toLocaleString("pt-BR")}**`,
    `- Páginas distintas: **${paginas.length.toLocaleString("pt-BR")}**`,
    `- Cliques: **${consultas.reduce((s, l) => s + l.clicks, 0).toLocaleString("pt-BR")}**`,
    `- Impressões: **${consultas.reduce((s, l) => s + l.impressions, 0).toLocaleString("pt-BR")}**`,
    `- Posição média (ponderada por impressão): **${numero(posicaoPonderada(consultas), 1)}**`,
    "",
    "## Recorte dos 3 clusters de cabeça nos 4 aeroportos da onda 1",
    "",
    "Cada consulta soma em um único cluster, o de maior prioridade entre os que ela casa, para",
    "nenhum clique ser contado duas vezes. O CSV `recorte-consultas.csv` traz a sobreposição.",
    "",
    ...porAeroporto,
    "## As 30 páginas de maior impressão",
    "",
    "| Página | Aeroporto | Cliques | Impressões | Posição |",
    "| --- | --- | --- | --- | --- |",
    ...topPaginas,
    "",
  ].join("\n");
}

async function principal() {
  const propriedade = argumento("property", process.env.GSC_PROPERTY ?? "sc-domain:movepark.co");
  const janela = janelaDe16Meses(new Date());
  const inicio = argumento("inicio", janela.inicio);
  const fim = argumento("fim", janela.fim);

  console.log(`Baseline do Search Console`);
  console.log(`  propriedade: ${propriedade}`);
  console.log(`  janela: ${inicio} a ${fim}`);

  const token = await pegarToken(carregarServiceAccount());

  const consultas = await consultar({ token, propriedade, inicio, fim, dimensoes: ["query"] });
  const paginas = await consultar({ token, propriedade, inicio, fim, dimensoes: ["page"] });
  const consultaPagina = await consultar({
    token,
    propriedade,
    inicio,
    fim,
    dimensoes: ["query", "page"],
  });
  const datas = await consultar({ token, propriedade, inicio, fim, dimensoes: ["date"] });

  const destino = path.join("docs", "specs", "dados", `gsc-baseline-${fim}`);
  fs.mkdirSync(destino, { recursive: true });

  const gravar = (nome, conteudo) => {
    fs.writeFileSync(path.join(destino, nome), conteudo);
    console.log(`  gravado ${path.join(destino, nome)}`);
  };

  gravar(
    "consultas.csv",
    paraCsv([{ titulo: "consulta", valor: (l) => l.keys[0] }, ...colunasDeMetrica], consultas),
  );
  gravar(
    "paginas.csv",
    paraCsv(
      [
        { titulo: "pagina", valor: (l) => l.keys[0] },
        { titulo: "aeroporto", valor: (l) => aeroportoDaUrl(l.keys[0]) ?? "" },
        ...colunasDeMetrica,
      ],
      paginas,
    ),
  );
  gravar(
    "consulta-por-pagina.csv",
    paraCsv(
      [
        { titulo: "consulta", valor: (l) => l.keys[0] },
        { titulo: "pagina", valor: (l) => l.keys[1] },
        ...colunasDeMetrica,
      ],
      consultaPagina,
    ),
  );
  gravar(
    "dias.csv",
    paraCsv([{ titulo: "data", valor: (l) => l.keys[0] }, ...colunasDeMetrica], datas),
  );

  const recorte = recorteDeClusters(consultas);
  gravar(
    "recorte-clusters.csv",
    paraCsv(
      [
        { titulo: "aeroporto", valor: (l) => l.aeroporto },
        { titulo: "cluster", valor: (l) => l.cluster },
        { titulo: "consultas", valor: (l) => l.consultas },
        { titulo: "cliques", valor: (l) => l.cliques },
        { titulo: "impressoes", valor: (l) => l.impressoes },
        { titulo: "posicao_media", valor: (l) => numero(l.posicao, 2) },
      ],
      recorte,
    ),
  );

  const classificadas = classificarConsultas(consultas);
  gravar(
    "recorte-consultas.csv",
    paraCsv(
      [
        { titulo: "consulta", valor: (l) => l.consulta },
        { titulo: "aeroporto", valor: (l) => l.aeroporto },
        { titulo: "cluster", valor: (l) => l.cluster },
        { titulo: "clusters_casados", valor: (l) => l.clusters.join(" ") },
        ...colunasDeMetrica,
      ],
      classificadas,
    ),
  );

  gravar(
    "meta.json",
    JSON.stringify(
      {
        propriedade,
        inicio,
        fim,
        dataState: "final",
        geradoEm: new Date().toISOString(),
        script: "scripts/gsc-baseline.mjs",
        linhas: {
          consultas: consultas.length,
          paginas: paginas.length,
          consultaPagina: consultaPagina.length,
          dias: datas.length,
          consultasClassificadas: classificadas.length,
        },
      },
      null,
      2,
    ) + "\n",
  );

  gravar(
    "RESUMO.md",
    resumoEmMarkdown({ propriedade, inicio, fim, recorte, consultas, paginas }),
  );

  console.log("\nBaseline congelado. Comite a pasta para o marco zero ficar versionado.");
}

principal().catch((erro) => {
  console.error(`\n${erro.message}`);
  process.exit(1);
});
