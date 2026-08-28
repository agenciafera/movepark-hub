/**
 * Manifesto dos caminhos que existem como arquivo no `dist`.
 *
 * É o que permite ao worker devolver 404 de verdade sem enterrar rota de app. A borda
 * sozinha não consegue distinguir "URL inexistente" de "rota do app que não tem HTML
 * pré-renderizado" (`/checkout/:code`, `/operator/*`): o Workers Assets só sabe se existe
 * arquivo. Quem sabe é o `routes.tsx`, e é por isso que o worker cruza este manifesto com
 * uma lista de padrões de rota. Ver docs/specs/borda-cloudflare.md.
 *
 * Roda depois do `vite-react-ssg build`, junto do canonicalize-sitemap.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST = "dist";
const SAIDA = join(DIST, "paths-manifest.json");

/**
 * Caminhos que o SSG emite na RAIZ do dist por engano e que NÃO são URLs públicas.
 *
 * Por causa dos pais sem `path` (`<RequireScope>` em src/routes.tsx), oito telas do
 * operator saem como `dist/pricing.html` em vez de `dist/operator/pricing.html`. Sem esta
 * lista o manifesto declararia `/pricing` como caminho conhecido, o worker responderia 200
 * com a casca do operator e o cliente renderizaria o 404: a mudança feita para acabar com
 * soft 404 criaria oito novos. Esta lista morre junto com o defeito de geração.
 */
const EMITIDOS_FORA_DO_LUGAR = new Set([
  "/pricing",
  "/finance",
  "/api-keys",
  "/occupancy",
  "/addons",
  "/coupons",
  "/reviews",
  "/users",
]);

/** Arquivos de configuração do Cloudflare que moram no dist e não são página. */
const NAO_E_PAGINA = new Set(["/_headers", "/_redirects", "/_routes.json"]);

function varrer(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // `assets/` só tem bundle com hash, e cada um deles vira ruído no manifesto. O
      // worker trata asset em outro bloco, antes desta checagem.
      if (nome === "assets") continue;
      achados.push(...varrer(caminho));
      continue;
    }
    achados.push(caminho);
  }
  return achados;
}

const arquivos = varrer(DIST);
const caminhos = new Set();

for (const arquivo of arquivos) {
  // `sep` em vez de "/" porque no Windows o join usa barra invertida.
  const rel = "/" + relative(DIST, arquivo).split(sep).join("/");

  if (rel.endsWith(".html")) {
    // `dist/index.html` é a raiz; `dist/sobre.html` é `/sobre`.
    const semExtensao = rel === "/index.html" ? "/" : rel.slice(0, -".html".length);
    caminhos.add(semExtensao);
    continue;
  }
  // Arquivo sem extensão é servido como está e precisa entrar: é o caso do
  // /.well-known/api-catalog e do oauth-protected-resource, que morreriam em silêncio.
  if (!/\.[a-z0-9]+$/i.test(rel)) caminhos.add(rel);
}

for (const fora of [...EMITIDOS_FORA_DO_LUGAR, ...NAO_E_PAGINA]) caminhos.delete(fora);

// Caixa: o repo tem `public/Estacionamentos/` (imagens) e a rota `/estacionamentos/...`.
// No macOS os dois viram a MESMA pasta no dist; no Linux do CI e do Cloudflare são duas.
// Um manifesto gerado em build local ficaria com a caixa errada e mandaria 404 numa página
// que existe. Comparar em minúsculas dos dois lados resolve, e o worker faz o mesmo.
const lista = [...caminhos].map((c) => c.toLowerCase()).sort();

/**
 * Guarda por invariante, não por contagem.
 *
 * Se o Supabase estiver fora no build, os `getStaticPaths` devolvem vazio e o dist sai com
 * as páginas estáticas e NENHUMA dinâmica. A contagem não é zero, o build passa, e o
 * manifesto viaja incompleto. Exigir uma entrada de cada família é o que detecta isso.
 */
const FAMILIAS = [
  // Uma pasta para o catálogo: o destino tem 2 segmentos e a ficha tem 3, então a checagem
  // olha a profundidade, senão "existe alguma coisa em /estacionamentos/" passaria com só
  // metade do catálogo no ar. Ver docs/specs/url-estacionamentos.md.
  [(c) => /^\/estacionamentos\/[^/]+$/.test(c), "destinos"],
  [(c) => /^\/estacionamentos\/[^/]+\/[^/]+$/.test(c), "fichas de estacionamento"],
  [(c) => c.startsWith("/blog/"), "posts do blog"],
];
const faltando = FAMILIAS.filter(([bate]) => !lista.some((c) => bate(c))).map(([, nome]) => nome);
if (faltando.length > 0) {
  console.error(
    `paths-manifest: build sem ${faltando.join(", ")}. ` +
      "Sinal de que o Supabase não respondeu durante o build. Abortando para o manifesto " +
      "não viajar incompleto e enterrar essas URLs em 404.",
  );
  process.exit(1);
}

writeFileSync(SAIDA, JSON.stringify(lista));
console.log(`paths-manifest: ${lista.length} caminhos`);
