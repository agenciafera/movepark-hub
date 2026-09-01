/**
 * Todo link interno para o catálogo tem que apontar para uma página que existe.
 *
 * Existe por causa de 30/08/2026: a lista de distância da página de destino montava o
 * caminho da ficha com o slug LEGADO dos dois lados (`/estacionamentos/<slug antigo do
 * destino>/<slug antigo do lote>`) em vez de usar o `public_path` que a RPC já devolve.
 * Eram 131 links, um por lote mapeado, em todos os 26 destinos.
 *
 * O que escondeu o defeito por dois dias: num `curl` a URL responde 301, porque o Worker
 * tem o mapa de URL legada. Só que clique dentro do app é navegação do React Router, sem
 * requisição HTTP nenhuma: o 301 nunca roda, o roteador casa `/estacionamentos/:destino/
 * :lote` com os slugs errados, a busca não acha e a pessoa vê "Vaga não encontrada". Nem o
 * teste de componente pegou, porque ele cravava a URL errada como esperada.
 *
 * A checagem é do que dá para checar sem browser: o link aponta para um caminho que o build
 * gerou? Cruzar com o `paths-manifest.json` responde isso, e teria reprovado o build.
 *
 * Escopo de propósito estreito: só `/estacionamentos/**`, que é a família com slug legado e
 * slug público convivendo. Rota de app sem HTML pré-renderizado (`/checkout/:code`,
 * `/operator/*`) não entra aqui e continua sendo problema do worker.
 *
 * Roda depois do write-paths-manifest.mjs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const conhecidos = new Set(JSON.parse(readFileSync(join(DIST, "paths-manifest.json"), "utf8")));

function paginas(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...paginas(caminho));
    else if (nome.endsWith(".html")) saida.push(caminho);
  }
  return saida;
}

/** `/Estacionamentos/x/?a=1#b` vira `/estacionamentos/x`, que é a forma do manifesto. */
function normaliza(href) {
  const semQuery = href.split(/[?#]/)[0];
  const semBarra = semQuery.length > 1 ? semQuery.replace(/\/+$/, "") : semQuery;
  return decodeURI(semBarra).toLowerCase();
}

const quebrados = new Map();
for (const pagina of paginas(DIST)) {
  const html = readFileSync(pagina, "utf8");
  for (const [, href] of html.matchAll(/href="(\/estacionamentos\/[^"]*)"/g)) {
    const alvo = normaliza(href);
    if (conhecidos.has(alvo)) continue;
    if (!quebrados.has(alvo)) quebrados.set(alvo, new Set());
    quebrados.get(alvo).add(pagina.replace(`${DIST}/`, ""));
  }
}

if (quebrados.size > 0) {
  const linhas = [...quebrados.entries()]
    .sort()
    .slice(0, 25)
    .map(([alvo, origens]) => {
      const lista = [...origens].sort();
      const extra = lista.length > 3 ? ` (+${lista.length - 3} páginas)` : "";
      return `  ${alvo}\n    em ${lista.slice(0, 3).join(", ")}${extra}`;
    });
  const resto = quebrados.size > 25 ? `\n  ... e mais ${quebrados.size - 25} alvos.` : "";
  console.error(
    `check-internal-links: ${quebrados.size} destino(s) de link interno não existem no build.\n` +
      "Link assim funciona no curl (o Worker faz 301) e QUEBRA no clique, que é navegação do\n" +
      "React Router e não passa pela borda. Use o `public_path` que a RPC devolve.\n" +
      linhas.join("\n") +
      resto,
  );
  process.exit(1);
}

console.log(`check-internal-links: ok, todo link de /estacionamentos aponta para página que existe`);
