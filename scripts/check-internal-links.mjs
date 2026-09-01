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
 * Escopo: as famílias de CONTEÚDO, que são as que existem como arquivo no build e as que o
 * Google indexa. Nasceu só com `/estacionamentos/**` em 30/08 e cresceu no dia seguinte,
 * quando uma varredura à mão achou mais 19 alvos mortos fora dela: 14 posts canibalizados,
 * 3 URLs na gramática antiga e 1 slug de FAQ errado, todos linkados do corpo de outro post.
 * O corpo do post usa `<Link>` (`PostBody.tsx`), então cada um era um "Essa página não
 * existe" no clique, com 301 saudável no `curl`.
 *
 * Área logada e rota parametrizada (`/checkout/:code`, `/operator/*`, `/account/*`,
 * `/search`) ficam fora: não têm HTML no build por desenho, e cobrá-las aqui seria ruído.
 *
 * Roda depois do write-paths-manifest.mjs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const conhecidos = new Set(JSON.parse(readFileSync(join(DIST, "paths-manifest.json"), "utf8")));

/** Os gêmeos Markdown, que são o corpus lido por agente de IA. */
function markdown(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...markdown(caminho));
    else if (nome.endsWith(".md")) saida.push(caminho);
  }
  return saida;
}

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

/**
 * Famílias que TÊM que existir como arquivo no build. Uma URL daqui que não está no
 * manifesto ou não existe, ou existe só atrás de um 301, e nos dois casos o clique
 * dentro do app quebra.
 */
const FAMILIAS = /^\/(estacionamentos|blog|faq|destinos|precos|estacionamento-mais-barato|p)(\/|$)/;

/**
 * Todo link interno de um arquivo, em qualquer das formas que o acervo usa.
 *
 * O link ABSOLUTO (`https://movepark.co/destinos/...`) entrou aqui em 31/08/2026: a
 * varredura anterior olhava só `href="/..."` e `](/...)`, e por isso não viu os 35 links
 * para `/destinos/<slug legado>` que moravam nos gêmeos Markdown, que é justamente o
 * arquivo que agente de IA lê.
 */
function linksInternos(texto) {
  const saida = [];
  for (const [, u] of texto.matchAll(/href="(\/[^"]*)"/g)) saida.push(u);
  for (const [, u] of texto.matchAll(/\]\((\/[^)\s]*)\)/g)) saida.push(u);
  // O `\\` no corte não é enfeite: dentro do JSON-LD a URL vem escapada (`...\/blog\/x\/\"`)
  // e sem ele o alvo capturado terminava numa barra invertida que não existe na URL.
  for (const [, u] of texto.matchAll(/https:\/\/movepark\.co(\/[^\s)"'<>\\]*)/g)) saida.push(u);
  return saida;
}

const quebrados = new Map();
const arquivos = [...paginas(DIST), ...markdown(DIST)];
for (const pagina of arquivos) {
  const html = readFileSync(pagina, "utf8");
  for (const href of linksInternos(html)) {
    const semQuery = href.split(/[?#]/)[0];
    if (!FAMILIAS.test(semQuery)) continue;
    // Arquivo servido de dentro da família (blog/feed.xml, o gêmeo .md) não é página e não
    // está no manifesto, que só lista HTML.
    if (/\.[a-z0-9]+$/i.test(semQuery.split("/").pop() ?? "")) continue;
    const alvo = normaliza(href);
    if (conhecidos.has(alvo)) continue;
    if (!quebrados.has(alvo)) quebrados.set(alvo, new Set());
    quebrados.get(alvo).add(pagina.replace(`${DIST}/`, ""));
  }
}

/**
 * Gêmeo markdown sem post vivo.
 *
 * `/blog/<slug>.md` é o que agente de IA busca. Em 31/08/2026 havia 59 desses arquivos
 * para posts canibalizados: o HTML do mesmo slug já ia de 301 para o vencedor e o `.md`
 * continuava respondendo 200 com o artigo velho, competindo com o vencedor exatamente na
 * superfície onde a consolidação mais importa.
 *
 * Desde então o gêmeo é GERADO do banco pelo generate-geo-artifacts, então órfão só
 * aparece se alguém voltar a versionar arquivo em `public/blog/`. A checagem fica como
 * rede: guard barato que já pegou 59 arquivos uma vez.
 */
const orfaos = readdirSync(join(DIST, "blog"))
  .filter((n) => n.endsWith(".md"))
  .filter((n) => !conhecidos.has(`/blog/${n.slice(0, -3)}`.toLowerCase()));

if (orfaos.length > 0) {
  console.error(
    `check-internal-links: ${orfaos.length} gêmeo(s) markdown sem post vivo em public/blog/.\n` +
      "O .md responde 200 com o artigo antigo enquanto o HTML do mesmo slug vai de 301 para o\n" +
      "vencedor. O gêmeo é gerado do banco: apague o arquivo versionado em public/blog/.\n" +
      orfaos
        .slice(0, 15)
        .map((n) => `  public/blog/${n}`)
        .join("\n") +
      (orfaos.length > 15 ? `\n  ... e mais ${orfaos.length - 15}.` : ""),
  );
  process.exit(1);
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
      "React Router e não passa pela borda. Aponte para a URL que existe: `public_path` da RPC\n" +
      "no caso da ficha, e o slug vivo no caso de post e FAQ.\n" +
      linhas.join("\n") +
      resto,
  );
  process.exit(1);
}

console.log("check-internal-links: ok, todo link de conteúdo aponta para página que existe");
