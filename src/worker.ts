interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  // Só leitura pública, com a anon key (pública por design). Serve para confirmar
  // slug de post que o manifesto do build ainda não conhece.
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/**
 * Hosts liberados para indexação por buscador. É uma **allowlist**, de propósito.
 *
 * Hoje o Hub responde em `hub.movepark.co`, que é endereço técnico e NÃO pode
 * aparecer no Google: o conteúdo público daqui (`/destinos/*`, `/p/*`) disputa a
 * mesma intenção de busca que o `movepark.co` já publica, e dois domínios na mesma
 * intenção se canibalizam.
 *
 * A regra é allowlist porque o Hub vai **substituir** o `movepark.co`. No dia em que
 * este projeto atender o apex, o host já está na lista e a indexação volta sozinha.
 * Um `noindex` chumbado (em `public/_headers`, num meta fixo ou num robots.txt
 * estático) viajaria junto na migração e apagaria o site novo do índice. É esse o
 * acidente que a allowlist existe para evitar.
 *
 * Efeito colateral desejado: qualquer host fora da lista (`*.pages.dev`,
 * `*.workers.dev`, staging, preview) fica fora do índice permanentemente.
 */
const INDEXABLE_HOSTS = new Set(["movepark.co"]);

/**
 * Marca a resposta como não-indexável quando o host não é o canônico.
 *
 * `follow` de propósito: os links continuam sendo rastreados, então a autoridade
 * que o Hub aponta para fora não é descartada.
 *
 * O `robots.txt` segue com `Allow: /` e continua anunciando o sitemap, e isso não é
 * descuido. O Google só respeita `noindex` na página que ele consegue **abrir**;
 * bloquear no robots.txt deixaria as URLs já indexadas presas como "indexada, porém
 * bloqueada pelo robots.txt", sem descrição e sem previsão de saída. Manter o crawl
 * liberado é o que faz o `noindex` ser lido e as URLs caírem do índice.
 */
function applyIndexPolicy(response: Response, url: URL): Response {
  if (INDEXABLE_HOSTS.has(url.hostname)) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Categorias do blog no WordPress → destino no Hub.
 *
 * As categorias moram dentro do namespace `/blog/`, então `/blog/<categoria>/` e
 * `/blog/<slug-de-post>/` são indistinguíveis pela forma. Este é o conjunto
 * fechado das 11 categorias mais os apelidos que o legado já redirecionava; tudo
 * que não estiver aqui é tratado como post.
 *
 * `null` = não tem destino no Hub (Navegantes ainda não existe, e `dica-de-viagem`
 * não é aeroporto), então cai no índice do blog em vez de numa página genérica.
 */
const BLOG_CATEGORY_TO_DESTINATION: Record<string, string | null> = {
  "aeroporto-guarulhos": "aeroporto-internacional-de-sao-paulo-guarulhos",
  guarulhos: "aeroporto-internacional-de-sao-paulo-guarulhos",
  "aeroporto-viracopos": "aeroporto-de-viracopos",
  viracopos: "aeroporto-de-viracopos",
  campinas: "aeroporto-de-viracopos",
  "aeroporto-afonso-pena": "aeroporto-afonso-pena",
  "aeroporto-lisboa": "aeroporto-humberto-delgado",
  "aeroporto-confins": "aeroporto-de-confins",
  "aeroporto-congonhas": "aeroporto-de-congonhas",
  "aeroporto-navegantes": null,
  "dica-de-viagem": null,
  duvidas: null,
  "rio-de-janeiro": null,
  uncategorized: null,
};

/**
 * URLs legadas fora do namespace `/blog/`, vindas da tabela `ko1_redirects` do
 * plugin eps-301-redirects.
 *
 * O Search Console não enxerga nenhuma delas (o clique é atribuído ao destino do
 * redirect), então elas não aparecem em nenhum levantamento de tráfego. Nove
 * revelam que os posts já moraram na raiz do domínio, antes do prefixo `/blog/`.
 * Ver docs/specs/blog.md.
 */
const BLOG_LEGACY_PATHS: Record<string, string> = {
  "/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes":
    "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
  "/aeroporto-guarulhos/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes":
    "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
  "/qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022":
    "/blog/qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022/",
  "/qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023":
    "/blog/qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023/",
  "/estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos":
    "/blog/estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos/",
  "/quanto-custa-para-estacionar-no-aeroporto-viracopos":
    "/blog/quanto-custa-para-estacionar-no-aeroporto-viracopos/",
  "/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023":
    "/blog/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023/",
  "/estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online":
    "/blog/estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online/",
  "/como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos":
    "/blog/como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos/",
  "/encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos":
    "/blog/encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos/",
  // Post renomeado no WordPress: ponce-park virou aeropark.
  "/blog/ponce-park-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas":
    "/blog/aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/",
};

const redirect301 = (to: string) =>
  new Response(null, { status: 301, headers: { Location: to, "Cache-Control": "no-cache" } });

// Irmão temporário do 301, para quando o destino final ainda vai mudar. O
// `no-cache` importa mais aqui do que lá: o navegador guardaria o salto e
// continuaria mandando o visitante para o lugar provisório depois da correção.
const redirect302 = (to: string) =>
  new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-cache" } });

/**
 * Política de URL do blog.
 *
 * O contrato é o do WordPress, porque são 93 URLs que o Google já indexou e que
 * respondem por 22,6% dos cliques do site: `/blog/<slug>/` com barra final
 * responde 200 direto, e a versão sem barra manda 301 para ela.
 *
 * Devolve `null` quando a requisição não é do blog e segue o fluxo normal.
 */
/**
 * Prefixos de listagem do blog. Tudo que não começa por um deles, e tem um
 * segmento só, é slug de post.
 */
const BLOG_LISTING_PREFIXES = new Set(["page", "categoria", "tag", "autor", "aeroporto"]);

export function blogRedirect(url: URL): Response | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const legacy = BLOG_LEGACY_PATHS[path];
  if (legacy) return redirect301(legacy + url.search);

  if (path !== "/blog" && !path.startsWith("/blog/")) return null;

  const segments = path.slice("/blog".length).split("/").filter(Boolean);
  if (!segments.length) return null;

  const semBarra = !url.pathname.endsWith("/");
  const paraCanonica = () => redirect301(`${path}/${url.search}`);

  if (BLOG_LISTING_PREFIXES.has(segments[0])) {
    // `/blog/categoria/<aeroporto>` é a forma que o Yoast emitia, e continua
    // indo para o destino: o slug de aeroporto nunca virou categoria editorial.
    if (segments[0] === "categoria" && segments[1] in BLOG_CATEGORY_TO_DESTINATION) {
      const destination = BLOG_CATEGORY_TO_DESTINATION[segments[1]];
      return redirect301(destination ? `/destinos/${destination}` : "/blog/");
    }
    return semBarra ? paraCanonica() : null;
  }

  if (segments.length > 1) return null;

  if (segments[0] in BLOG_CATEGORY_TO_DESTINATION) {
    const destination = BLOG_CATEGORY_TO_DESTINATION[segments[0]];
    return redirect301(destination ? `/destinos/${destination}` : "/blog/");
  }

  // Post sem a barra final: a canônica é com barra, igual ao WordPress.
  return semBarra ? paraCanonica() : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return applyIndexPolicy(await serve(request, env), new URL(request.url));
  },
};

/**
 * Slugs publicados, em cache por isolate.
 *
 * Só o sucesso entra em cache. Guardar a falha faria uma leitura ruim desligar a
 * regra até o isolate morrer, e o custo de tentar de novo é uma leitura de asset
 * que só acontece enquanto o manifesto realmente não está lá.
 */
let blogSlugsCache: Set<string> | undefined;

async function blogSlugs(env: Env, url: URL): Promise<Set<string> | null> {
  if (blogSlugsCache) return blogSlugsCache;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/blog-slugs.json", url)));
    const tipo = res.headers.get("Content-Type") ?? "";
    // Manifesto ausente cai no fallback SPA (HTML). Sem manifesto confiável a
    // regra se desliga, em vez de mandar 404 em post que existe.
    if (!res.ok || !tipo.includes("json")) return null;
    blogSlugsCache = new Set((await res.json()) as string[]);
    return blogSlugsCache;
  } catch {
    return null;
  }
}

/**
 * Segunda opinião para o slug que o manifesto não conhece.
 *
 * O manifesto nasce no build, e o site é SSG: um post publicado pelo Manager
 * agora só entra nele no próximo deploy. Sem esta consulta, publicar deixaria a
 * URL em 404 até alguém empurrar um commit, que é pior do que o 200 vazio que o
 * 404 veio corrigir.
 *
 * Quem responde `true` é servido pela shell e renderiza no cliente, com o HTML
 * pré-renderizado chegando no build seguinte. Quem responde `false` continua 404.
 *
 * O cache guarda os dois veredictos, porque o caso barulhento é bot varrendo slug
 * inventado, e cada varredura sem cache viraria uma consulta. O teto existe para
 * a memória não crescer com entrada que o visitante escolhe.
 */
const VEREDICTO_MAX = 500;
const veredictoSlug = new Map<string, boolean>();

async function postPublicado(env: Env, slug: string): Promise<boolean> {
  const cacheado = veredictoSlug.get(slug);
  if (cacheado !== undefined) return cacheado;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;

  try {
    const consulta = new URL("/rest/v1/blog_post", env.SUPABASE_URL);
    consulta.searchParams.set("select", "slug");
    consulta.searchParams.set("slug", `eq.${slug}`);
    consulta.searchParams.set("is_published", "is.true");
    consulta.searchParams.set("deleted_at", "is.null");
    consulta.searchParams.set("limit", "1");

    const res = await fetch(consulta, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    });
    // Supabase fora do ar não é resposta: melhor servir a shell do que enterrar
    // uma URL que talvez exista. Este caso não entra em cache.
    if (!res.ok) return true;

    const existe = ((await res.json()) as unknown[]).length > 0;
    if (veredictoSlug.size >= VEREDICTO_MAX) veredictoSlug.clear();
    veredictoSlug.set(slug, existe);
    return existe;
  } catch {
    return true;
  }
}

/**
 * Alvo do redirecionamento da ficha de lote mapeado, em cache por isolate.
 *
 * O veredicto negativo (ficha que não foi convertida) entra em cache junto com o
 * positivo, e isso é aceitável porque o isolate do Worker vive minutos: uma conversão
 * feita agora passa a redirecionar assim que o isolate corrente for reciclado, sem
 * depender de deploy. O custo é uma consulta por URL por isolate frio, então um bot
 * varrendo slug inventado não vira uma consulta por requisição.
 *
 * Falha de rede NÃO entra em cache: guardar o erro desligaria a regra até o isolate
 * morrer. O teto reusa o `VEREDICTO_MAX` porque o risco é o mesmo, memória crescendo
 * com chave que o visitante escolhe.
 */
type ProspectAlvo = { target: string; permanent: boolean };
const alvoProspect = new Map<string, ProspectAlvo | null>();

/**
 * Ficha de lote mapeado que virou parceiro sai da URL antiga em redirecionamento.
 *
 * `/estacionamentos/<destino>/<slug>` é página pública com ranking próprio. Quando o
 * dono reivindica, a ficha ganha `converted_at` e some de tudo que a publicava: a RPC
 * `destination_prospect_cards` para de devolver, o `getStaticPaths` para de gerar o
 * HTML e o sitemap para de listar. Sem este bloco a URL cai no
 * `not_found_handling: "single-page-application"` do wrangler e responde 200 com a
 * casca vazia da SPA, que é soft 404: o Google mantém a URL indexada apontando para
 * uma página em branco. E entre a conversão e o próximo deploy o HTML velho segue no
 * ar dizendo que o lote não aceita reserva quando ele já é parceiro. Só o Worker cobre
 * essa janela, porque roda antes dos assets (`run_worker_first`).
 *
 * A RPC devolve zero linhas quando a ficha não existe ou não foi convertida, e aí não
 * há redirecionamento nenhum: o request segue como hoje. Convertida com a unidade já
 * listada, o alvo é `/p/<empresa>/<unidade>/<código>` e vale 301. Convertida sem
 * unidade listada, o alvo é `/destinos/<slug>` e vale 302, porque converter não
 * publica oferta (a unidade nasce inativa e sem tipo de vaga): o destino final ainda
 * vai mudar, e um 301 cravaria o provisório no cache do navegador e do Google.
 *
 * Qualquer falha é fail-open (env ausente, rede caindo, resposta não-ok, JSON
 * inesperado): devolve `null` e a página abre normalmente. Redirecionamento que não
 * sai custa ranking de uma URL; página que não abre custa o site inteiro.
 */
export async function prospectRedirect(url: URL, env: Env): Promise<Response | null> {
  const segmentos = url.pathname.split("/").filter(Boolean);
  if (segmentos.length !== 3 || segmentos[0] !== "estacionamentos") return null;

  const [, destino, slug] = segmentos;
  const chave = `${destino}/${slug}`;
  const cacheado = alvoProspect.get(chave);
  if (cacheado !== undefined) return responderProspect(cacheado);

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  try {
    const consulta = new URL("/rest/v1/rpc/prospect_redirect_target", env.SUPABASE_URL);
    const res = await fetch(consulta, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_destination_slug: destino, p_slug: slug }),
    });
    if (!res.ok) return null;

    const linhas = (await res.json()) as unknown;
    if (!Array.isArray(linhas)) return null;

    const linha = linhas[0] as Partial<ProspectAlvo> | undefined;
    let alvo: ProspectAlvo | null = null;
    if (linha) {
      // Linha com formato estranho é tratada como falha, não como "não converteu":
      // cachear o negativo aqui esconderia o problema até o isolate morrer.
      if (typeof linha.target !== "string" || typeof linha.permanent !== "boolean") return null;
      alvo = { target: linha.target, permanent: linha.permanent };
    }

    if (alvoProspect.size >= VEREDICTO_MAX) alvoProspect.clear();
    alvoProspect.set(chave, alvo);
    return responderProspect(alvo);
  } catch {
    return null;
  }
}

function responderProspect(alvo: ProspectAlvo | null): Response | null {
  if (!alvo) return null;
  return alvo.permanent ? redirect301(alvo.target) : redirect302(alvo.target);
}

/**
 * Padrões de rota do app que NÃO têm HTML próprio no `dist` e precisam continuar em 200.
 *
 * Esta lista é a razão de a regra de 404 morar no worker e não no `not_found_handling` do
 * wrangler: o Workers Assets só sabe se existe arquivo, e quem sabe o que é rota de app é o
 * `routes.tsx`. Medido em produção: `/checkout/MP-TESTE123`, `/bookings/...`,
 * `/account/reservas/...`, `/operator/pricing` e `/manager/companies/<id>/locations` todos
 * respondem hoje com o HTML da home, byte a byte, porque vivem do fallback SPA. Enterrar
 * qualquer um deles em 404 não é perda de ranking, é queda de produção.
 *
 * As três famílias de conteúdo (`/p/`, `/destinos/`, `/estacionamentos/`) entram mesmo tendo
 * HTML pré-renderizado, porque o manifesto nasce no build e o site é SSG: publicar um
 * destino no Manager o deixaria em 404 até alguém empurrar um commit. `/estacionamentos/`
 * com dois segmentos também precisa continuar abrindo, porque são as 24 páginas de aeroporto
 * do WordPress e o checklist de migração pede 301 para elas, não 404.
 *
 * `/blog` inteiro fica de fora da checagem: ele já tem regra de 404 própria, com segunda
 * opinião no banco, e duas autoridades sobre a mesma URL só criam divergência.
 */
const ROTAS_DE_APP: RegExp[] = [
  /^\/checkout(\/.*)?$/,
  /^\/bookings(\/.*)?$/,
  /^\/account(\/.*)?$/,
  /^\/manager(\/.*)?$/,
  /^\/operator(\/.*)?$/,
  /^\/onboarding$/,
  /^\/voucher(\/.*)?$/,
  /^\/blog(\/.*)?$/,
  /^\/p\/[^/]+\/[^/]+\/[^/]+$/,
  /^\/destinos(\/[^/]+)?$/,
  /^\/estacionamentos(\/[^/]+){0,2}$/,
  // Mesma razão de /destinos: as páginas de pergunta (/faq/<slug>) são SSG, e uma FAQ
  // publicada no Manager depois do build precisa abrir antes do próximo deploy.
  /^\/faq(\/[^/]+)?$/,
];

export function ehRotaDeApp(pathname: string): boolean {
  return ROTAS_DE_APP.some((r) => r.test(pathname));
}

/**
 * Caminhos que existem como arquivo no build, em cache por isolate.
 *
 * Mesmo desenho do `blogSlugs`: só o sucesso entra em cache, e manifesto ausente, com
 * Content-Type errado ou com JSON quebrado devolve `null`. Esse fail-open é obrigatório, não
 * cortesia: sem ele, um build sem o manifesto derrubaria o site inteiro em 404. Com ele, o
 * pior caso é voltar ao comportamento de hoje.
 */
let caminhosCache: Set<string> | undefined;

async function caminhosConhecidos(env: Env, url: URL): Promise<Set<string> | null> {
  if (caminhosCache) return caminhosCache;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/paths-manifest.json", url)));
    const tipo = res.headers.get("Content-Type") ?? "";
    if (!res.ok || !tipo.includes("json")) return null;
    caminhosCache = new Set((await res.json()) as string[]);
    return caminhosCache;
  } catch {
    return null;
  }
}

/**
 * Corpo da página de 404, com status 404.
 *
 * Busca `/404` SEM extensão de propósito. O `html_handling` do Workers Assets é
 * `auto-trailing-slash` por padrão, e pedir `/404.html` devolve 307 com corpo VAZIO: o
 * worker carimbaria 404 numa tela branca, que é justamente o que esta página existe para
 * evitar. Medido em produção: `/sobre.html` responde 307 para `/sobre`.
 *
 * Fala com o ASSETS direto, nunca reentrando em `serve()`, senão `/404` entraria em laço.
 * Se `dist/404.html` sumir do build, o ASSETS cai no fallback SPA e devolve o index: a
 * resposta ainda sai com status 404 e um corpo que hidrata no catch-all, então o pior caso
 * continua correto.
 *
 * `no-store` porque a migração do WordPress está em curso: sem ele, uma URL que passa a
 * existir fica presa em 404 na borda e no navegador.
 */
async function pagina404(env: Env, url: URL): Promise<Response> {
  const res = await env.ASSETS.fetch(new Request(new URL("/404", url)));
  return new Response(res.body, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Accept",
    },
  });
}

/** Só para o teste: o cache vive no módulo e o Vitest roda o arquivo numa instância só. */
export function __resetCachesDoWorker(): void {
  caminhosCache = undefined;
  blogSlugsCache = undefined;
  veredictoSlug.clear();
  alvoProspect.clear();
}

async function serve(request: Request, env: Env): Promise<Response> {
  const accept = request.headers.get("Accept") ?? "";
  const url = new URL(request.url);

  // Política de URL do blog antes de tudo: categoria e URL legada saem em 301
  // sem chegar no asset. Ver docs/specs/blog.md.
  const blogHop = blogRedirect(url);
  if (blogHop) return blogHop;

  // Ficha de lote mapeado convertida antes da negociação de conteúdo, de propósito:
  // depois dela, um agente pedindo `Accept: text/markdown` receberia o .md velho da
  // ficha em vez do redirecionamento, e leria que o lote não aceita reserva.
  const prospectHop = await prospectRedirect(url, env);
  if (prospectHop) return prospectHop;

  // Requisição de asset com hash (ex.: /assets/app-XXXX.js, static-loader-data-*.json):
  // se o arquivo não existe mais (deploy novo invalidou o hash antigo), o
  // `not_found_handling: single-page-application` devolveria o index.html (200, HTML).
  // Isso faz o `.json()`/import do cliente estourar com "Unexpected token '<'". Preferimos
  // um 404 limpo: o cliente trata como "build velho" e recarrega (ver src/lib/stale-build.ts).
  //
  // Vem ANTES da checagem de existência para o bundle com hash nunca ser consultado no
  // manifesto, que não lista `assets/`.
  const lastSegment = url.pathname.split("/").pop() ?? "";
  const isAssetRequest = /\.[a-z0-9]+$/i.test(lastSegment) && !/\.html?$/i.test(lastSegment);
  if (isAssetRequest) {
    const assetResponse = await env.ASSETS.fetch(request);
    const type = assetResponse.headers.get("Content-Type") ?? "";
    if (assetResponse.ok && type.includes("text/html")) {
      // Asset ausente que caiu no fallback SPA: devolve 404 em vez de HTML.
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return assetResponse;
  }

  /*
    URL que não existe devolve 404 de verdade, e não a casca da SPA com 200.

    Medido em produção em 13/08/2026: `/pagina-que-nao-existe-xyz` respondia 200 com o HTML
    da home byte a byte, que é o que o Google trata como soft 404. Na migração do WordPress
    isso viraria soft 404 em massa, porque 68 URLs que hoje recebem tráfego não têm
    equivalente no Hub.

    A checagem vem ANTES da negociação de markdown de propósito: sem isso, um agente pedindo
    `Accept: text/markdown` numa URL inexistente recebia o `llms.txt` com 200, que é a mesma
    mentira em outro formato.

    Três saídas antes do 404, cada uma por um motivo:
      - caminho terminado em `.html` segue para o ASSETS, preservando o 307 de
        canonicalização que existe hoje (`/sobre.html` vira `/sobre`);
      - `ehRotaDeApp` cobre o que o app serve sem ter arquivo próprio;
      - manifesto ilegível desliga a regra inteira (fail-open).

    `/404` é o caso especial: o arquivo existe e entraria no manifesto, então sem este
    desvio a própria página de erro responderia 200, virando um soft 404 indexável.

    Comparação em minúsculas nos dois lados por causa de `public/Estacionamentos/`, que no
    macOS colide com a rota `/estacionamentos/` e no Linux não. Ver
    docs/specs/borda-cloudflare.md.
  */
  const caminho = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (caminho === "/404") return pagina404(env, url);
  if (!/\.html?$/i.test(caminho) && !ehRotaDeApp(caminho)) {
    const conhecidos = await caminhosConhecidos(env, url);
    if (conhecidos && !conhecidos.has(caminho)) return pagina404(env, url);
  }

  // Content negotiation: serve markdown when agents request it
  if (accept.includes("text/markdown")) {
    // Try to serve a pre-generated .md file for the path
    const mdRequest = new Request(new URL(url.pathname.replace(/\/?$/, ".md"), url), request);
    const mdResponse = await env.ASSETS.fetch(mdRequest);
    // Path sem .md correspondente cai no fallback SPA (HTML, 200): sem a checagem
    // de content-type o worker rotulava esse HTML como text/markdown, e o agente
    // recebia a casca do app achando que era o conteúdo.
    const mdType = mdResponse.headers.get("Content-Type") ?? "";
    if (mdResponse.ok && !mdType.includes("text/html")) {
      return new Response(mdResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          Vary: "Accept",
          "X-Markdown-Tokens": "reduced",
        },
      });
    }

    // Fallback: serve llms.txt as the markdown representation of the site
    const llmsResponse = await env.ASSETS.fetch(new Request(new URL("/llms.txt", url), request));
    if (llmsResponse.ok) {
      return new Response(llmsResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          Vary: "Accept",
          "X-Markdown-Tokens": "reduced",
        },
      });
    }
  }

  /*
    Post inexistente devolve 404, não a casca da SPA.

    O `not_found_handling: single-page-application` do Pages responde 200 com o
    index para qualquer caminho, e o Google trata isso como soft 404: indexa a URL
    como página real e vazia. Foi parte do que sujou o índice do site legado (94
    URLs em "rastreada, mas não indexada").

    O manifesto sai do build (`writeBlogSlugManifest` no vite.config) e fica em
    cache no escopo do módulo, então custa uma leitura por isolate, não por
    requisição.

    Fora do manifesto, `postPublicado` dá a segunda opinião: post publicado pelo
    Manager depois do último build existe no banco e ainda não existe no
    manifesto, e essa URL tem que abrir na hora.
  */
  const post = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (post && !BLOG_LISTING_PREFIXES.has(post[1])) {
    const slugs = await blogSlugs(env, url);
    if (slugs && !slugs.has(post[1]) && !(await postPublicado(env, post[1]))) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
  }

  // Barra final do blog sem salto de redirect.
  //
  // O SSG emite arquivo plano (`dist/blog/<slug>.html`), então o Cloudflare Pages
  // responderia `/blog/<slug>/` com um 307 para a versão sem barra. Isso trocaria
  // a canônica de 93 URLs indexadas e ainda por um redirect temporário. Aqui a
  // URL com barra é servida direto, buscando o asset internamente.
  if (url.pathname.startsWith("/blog/") && url.pathname.endsWith("/")) {
    const withoutSlash = new URL(url.pathname.replace(/\/+$/, ""), url);
    withoutSlash.search = url.search;
    return env.ASSETS.fetch(new Request(withoutSlash, request));
  }

  // Default: serve static assets normally
  return env.ASSETS.fetch(request);
}
