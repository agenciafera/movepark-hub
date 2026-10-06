/**
 * Lógica pura da auditoria do site (`scripts/auditoria-site.mjs`): ler sitemap, extrair os fatos
 * de uma página e transformar o que foi coletado em lista de problemas. Nada aqui faz rede, para
 * a regra ser testada sem subir o site.
 *
 * Por que existe: o Semrush do projeto é do plano gratuito e audita 100 páginas, contra mais de mil
 * no sitemap (docs/specs/plano-autoridade-backlinks.md, seção 2.6). As checagens do build já
 * cobrem link interno, dado estruturado e meta de SERP, mas nenhuma olha o site inteiro NO AR.
 */

/** Toda `<loc>` de um sitemap ou de um índice de sitemaps. */
export function locsDoSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeEntidades(m[1]));
}

export function decodeEntidades(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Extensão de arquivo no fim do caminho: `.png`, `.css`, `.xml`... Página não tem. */
const EXTENSAO = /\.[a-z0-9]{2,5}$/i;

/**
 * Valor de um atributo dentro de uma tag. Aceita aspas duplas ou simples e qualquer ordem de
 * atributos, que é como o react-helmet e o build escrevem.
 */
function atributo(tag, nome) {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntidades(m[2] ?? m[3] ?? "") : null;
}

function tags(html, nome) {
  return html.match(new RegExp(`<${nome}\\b[^>]*>`, "gi")) ?? [];
}

/**
 * O que a auditoria precisa saber de uma página: meta de SERP, canonical, robots, H1 e links.
 * Link interno sai como caminho, sem query e sem âncora, porque `?dest=GRU&vaga=valet` abre a
 * mesma página e checá-la de novo seria só mais requisição.
 */
export function fatosDaPagina(html, url) {
  const base = new URL(url);
  const titulo = decodeEntidades(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();

  const metas = tags(html, "meta");
  const metaPorNome = (nome) =>
    metas.find((t) => (atributo(t, "name") ?? "").toLowerCase() === nome);
  const descricao = (atributo(metaPorNome("description") ?? "", "content") ?? "").trim();
  const robots = (atributo(metaPorNome("robots") ?? "", "content") ?? "").trim();

  const canonicalTag = tags(html, "link").find((t) =>
    (atributo(t, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"),
  );
  const canonical = canonicalTag ? atributo(canonicalTag, "href") : null;

  const h1 = (html.match(/<h1\b/gi) ?? []).length;

  const internos = new Set();
  const externos = new Set();
  for (const a of tags(html, "a")) {
    const href = atributo(a, "href");
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let alvo;
    try {
      alvo = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(alvo.protocol)) continue;
    if (alvo.hostname === base.hostname) {
      if (EXTENSAO.test(alvo.pathname) && !/\.html?$/i.test(alvo.pathname)) continue;
      internos.add(alvo.pathname);
    } else {
      alvo.hash = "";
      externos.add(alvo.toString());
    }
  }

  return { titulo, descricao, robots, canonical, h1, internos, externos };
}

/** `noindex` em meta ou cabeçalho, em qualquer combinação (`noindex, follow`, `none`). */
export function temNoindex(valor) {
  return /\b(noindex|none)\b/i.test(valor ?? "");
}

/** Status que é redirect. */
const ehRedirect = (s) => s >= 300 && s < 400;

/**
 * Status que provavelmente é o site de fora barrando robô, não link morto. Vira aviso fraco,
 * separado do link quebrado de verdade, para não mandar ninguém "consertar" um link que abre no
 * navegador.
 */
const ehBloqueioDeRobo = (s) => s === 401 || s === 403 || s === 405 || s === 429 || s === 999;

/**
 * Transforma a coleta em problemas.
 *
 * @param {object} coleta
 * @param {Map<string, {status:number, location?:string|null, xRobots?:string|null, fatos?:object}>} coleta.paginas
 *   Cada URL do sitemap, buscada sem seguir redirect.
 * @param {Map<string, {status:number, location?:string|null}>} coleta.alvosInternos
 *   Caminhos linkados que NÃO estão no sitemap, buscados sem seguir redirect.
 * @param {Map<string, {status:number, erro?:string}>} [coleta.externos]
 *   Links de saída, buscados seguindo redirect. Ausente quando a checagem foi pulada.
 * @param {string} coleta.base  Origem auditada, ex.: `https://movepark.co` ou o preview.
 * @param {string} [coleta.hostCanonico]  Host que o canonical tem que trazer. Padrão: o da base.
 */
export function diagnostica({ paginas, alvosInternos, externos, base, hostCanonico }) {
  const host = hostCanonico ?? new URL(base).hostname;
  const problemas = [];
  const add = (severidade, tipo, url, detalhe) =>
    problemas.push({ severidade, tipo, url, detalhe });

  const caminhosDoSitemap = new Set([...paginas.keys()].map((u) => new URL(u).pathname));
  const entrantes = new Map([...caminhosDoSitemap].map((c) => [c, 0]));
  const quemLinka = new Map();
  const titulos = new Map();
  const descricoes = new Map();

  for (const [url, p] of paginas) {
    const caminho = new URL(url).pathname;

    if (p.status !== 200) {
      const destino = p.location ? ` para ${p.location}` : "";
      add("erro", "sitemap-sem-200", url, `responde ${p.status || "sem resposta"}${destino}`);
      continue;
    }

    if (temNoindex(p.xRobots)) add("erro", "noindex", url, `X-Robots-Tag: ${p.xRobots}`);
    const f = p.fatos;
    if (!f) continue;
    if (temNoindex(f.robots)) add("erro", "noindex", url, `meta robots: ${f.robots}`);

    if (!f.canonical) add("aviso", "sem-canonical", url, "página sem rel=canonical");
    else {
      // Compara caminho e host canônico, não a URL inteira: contra o preview a página é servida
      // em localhost e o canonical continua dizendo o domínio de produção, como deve.
      let c = null;
      try {
        c = new URL(f.canonical, url);
      } catch {
        /* canonical ilegível cai no erro abaixo */
      }
      if (!c || c.pathname !== caminho || c.search || c.hostname !== host) {
        add("erro", "canonical-diferente", url, `canonical aponta para ${f.canonical}`);
      }
    }

    if (!f.titulo) add("erro", "sem-title", url, "página sem <title>");
    else titulos.set(f.titulo, [...(titulos.get(f.titulo) ?? []), url]);

    if (!f.descricao) add("aviso", "sem-description", url, "página sem meta description");
    else descricoes.set(f.descricao, [...(descricoes.get(f.descricao) ?? []), url]);

    if (f.h1 === 0) add("aviso", "sem-h1", url, "página sem <h1>");
    if (f.h1 > 1) add("aviso", "varios-h1", url, `${f.h1} <h1> na página`);

    for (const alvo of f.internos) {
      if (alvo === caminho) continue;
      if (entrantes.has(alvo)) entrantes.set(alvo, entrantes.get(alvo) + 1);
      else quemLinka.set(alvo, [...(quemLinka.get(alvo) ?? []), url]);
    }
  }

  for (const [texto, urls] of titulos) {
    if (urls.length > 1)
      add(
        "aviso",
        "title-duplicado",
        urls[0],
        `"${texto}" em ${urls.length} páginas: ${urls.join(", ")}`,
      );
  }
  for (const [texto, urls] of descricoes) {
    if (urls.length > 1) {
      add(
        "aviso",
        "description-duplicada",
        urls[0],
        `"${texto.slice(0, 80)}…" em ${urls.length} páginas: ${urls.join(", ")}`,
      );
    }
  }

  for (const [caminho, n] of entrantes) {
    if (n === 0 && caminho !== "/")
      add("aviso", "orfa", base + caminho, "nenhuma página do sitemap linka para ela");
  }

  for (const [caminho, origens] of quemLinka) {
    const alvo = alvosInternos.get(caminho);
    if (!alvo) continue;
    const onde = `linkado de ${origens.length} página(s), ex.: ${origens[0]}`;
    if (alvo.status >= 400 || !alvo.status) {
      add(
        "erro",
        "link-interno-quebrado",
        base + caminho,
        `responde ${alvo.status || "sem resposta"}; ${onde}`,
      );
    } else if (ehRedirect(alvo.status)) {
      add(
        "aviso",
        "link-interno-redirect",
        base + caminho,
        `responde ${alvo.status} para ${alvo.location ?? "?"}; ${onde}`,
      );
    }
  }

  for (const [url, r] of externos ?? []) {
    if (r.status >= 200 && r.status < 400) continue;
    // Sem status é erro de rede ou de certificado (conexão derrubada, cadeia TLS incompleta),
    // que costuma abrir no navegador. Só 4xx e 5xx de verdade contam como link morto.
    if (!r.status)
      add("info", "externo-sem-resposta", url, `não respondeu ao robô: ${r.erro ?? "?"}`);
    else if (ehBloqueioDeRobo(r.status))
      add("info", "externo-bloqueia-robo", url, `responde ${r.status} ao robô`);
    else add("aviso", "link-externo-quebrado", url, `responde ${r.status}`);
  }

  return problemas;
}

const ORDEM = { erro: 0, aviso: 1, info: 2 };

/** Relatório em Markdown: resumo por tipo e a lista de cada tipo, cortada em `limite` itens. */
export function relatorioMarkdown({ problemas, base, totalPaginas, data, limite = 50 }) {
  const porTipo = new Map();
  for (const p of problemas) porTipo.set(p.tipo, [...(porTipo.get(p.tipo) ?? []), p]);
  const tipos = [...porTipo.entries()].sort(
    ([, a], [, b]) => ORDEM[a[0].severidade] - ORDEM[b[0].severidade] || b.length - a.length,
  );
  const conta = (s) => problemas.filter((p) => p.severidade === s).length;

  const linhas = [
    `# Auditoria do site: ${base}`,
    "",
    `${data} · ${totalPaginas} URLs do sitemap · ${conta("erro")} erros · ${conta("aviso")} avisos · ${conta("info")} informativos`,
    "",
  ];
  if (tipos.length === 0) return [...linhas, "Nenhum problema encontrado."].join("\n") + "\n";

  linhas.push("| Severidade | Tipo | Ocorrências |", "|---|---|---|");
  for (const [tipo, lista] of tipos)
    linhas.push(`| ${lista[0].severidade} | \`${tipo}\` | ${lista.length} |`);

  for (const [tipo, lista] of tipos) {
    linhas.push("", `## ${tipo} (${lista.length})`, "");
    for (const p of lista.slice(0, limite)) linhas.push(`- ${p.url}: ${p.detalhe}`);
    if (lista.length > limite)
      linhas.push(`- … e mais ${lista.length - limite} (lista completa no JSON)`);
  }
  return linhas.join("\n") + "\n";
}
