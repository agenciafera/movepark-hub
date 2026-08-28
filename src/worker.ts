import { DEFAULT_SITE_URL } from "./lib/site-host.mjs";

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
 * Desde 18/08/2026 o Hub atende o próprio `movepark.co`, e a lista sai do host
 * canônico em vez de repetir a string: trocar o domínio não exige lembrar deste
 * arquivo. Antes disso o projeto respondia em `hub.movepark.co`, endereço técnico
 * que ficava fora do Google porque o conteúdo público daqui (`/destinos/*`, `/p/*`)
 * disputava a mesma intenção que o `movepark.co` já publicava.
 *
 * A regra continua sendo allowlist, e não um `noindex` chumbado (em `public/_headers`,
 * num meta fixo ou num robots.txt estático): o chumbado viajaria junto numa migração
 * e apagaria o site do índice. O `hub.movepark.co`, enquanto continuar respondendo,
 * cai automaticamente no `noindex` por não estar na lista.
 *
 * Efeito colateral desejado: qualquer host fora da lista (`*.pages.dev`,
 * `*.workers.dev`, staging, preview) fica fora do índice permanentemente.
 */
const INDEXABLE_HOSTS = new Set([new URL(DEFAULT_SITE_URL).hostname]);

/** O `www.` do host canônico. Existe só para ser redirecionado. */
const HOST_WWW = `www.${new URL(DEFAULT_SITE_URL).hostname}`;

/**
 * `www.movepark.co` → 301 para o apex, com caminho e query preservados.
 *
 * Medido em 18/08/2026: o `www` tinha registro DNS proxiado apontando para uma origem que
 * não existe mais, e respondia **522**. Isso é pior que não existir: 522 é erro de origem,
 * então o Google trata como falha temporária e volta, em vez de entender que o endereço
 * certo é outro. Quem digitou `www.` na barra também via só uma página de erro da Cloudflare.
 *
 * O redirect vive aqui, e não numa Redirect Rule do painel, porque a borda deste projeto é
 * este arquivo: regra no painel é invisível no repo, não entra em teste e ninguém descobre
 * que ela existe. O custo é uma invocação de worker por request no `www`, que é tráfego
 * residual.
 *
 * 301 e não 302: o endereço canônico não vai mudar, e é o permanente que transfere sinal.
 */
function redirecionaWww(url: URL): Response | null {
  if (url.hostname !== HOST_WWW) return null;

  const destino = new URL(url.toString());
  destino.hostname = new URL(DEFAULT_SITE_URL).hostname;
  return Response.redirect(destino.toString(), 301);
}

/**
 * `/destinos/` e afins redirecionam 301 para a forma sem barra, que é a canônica.
 * O blog fica de fora porque lá o contrato de URL é o inverso (hub e posts COM
 * barra, herdado da migração), e URL que não é rota conhecida também: redirecionar
 * lixo só adia o 404. A raiz não tem o que normalizar.
 */
export function normalizaBarraFinal(url: URL): Response | null {
  if (url.pathname === "/" || !url.pathname.endsWith("/")) return null;
  if (url.pathname === "/blog/" || url.pathname.startsWith("/blog/")) return null;

  const semBarra = url.pathname.replace(/\/+$/, "") || "/";
  if (!ehRotaDeApp(semBarra) && !ehRotaPrivada(semBarra)) return null;

  const destino = new URL(url.toString());
  destino.pathname = semBarra;
  return Response.redirect(destino.toString(), 301);
}

/**
 * Prefixos de área privada. Ficam fora do índice em **qualquer host**, inclusive no canônico.
 *
 * Hoje `/manager` e `/operator` estão fora do Google por tabela: o host inteiro responde
 * `noindex`. Isso é efeito colateral, não política. No dia em que o apex entrar no
 * `INDEXABLE_HOSTS`, a mesma linha que devolve o site ao índice devolveria junto o painel do
 * parceiro, a conta do cliente e o checkout. E não é hipótese: o baseline de 04/08/2026 do
 * Search Console já trazia `/operator` e `/operator/api-keys` indexados.
 *
 * A lista é a mesma família de caminhos que o sitemap já recusa (`SITEMAP_PRIVATE_PREFIXES` e
 * o `PRIVADOS` do `scripts/canonicalize-sitemap.mjs`), com a diferença de que aqui a regra
 * sobrevive à migração: não depende de host nenhum.
 *
 * O `robots.txt` **não** ganha `Disallow` para estes caminhos, de propósito. URL bloqueada
 * ali nunca chega a ser aberta, o `noindex` nunca é lido, e o que já está indexado fica preso
 * como "indexada, porém bloqueada pelo robots.txt". O caminho de saída é o oposto: deixar
 * rastrear para que o cabeçalho seja lido. Ver docs/specs/seo-indexacao.md.
 */
export const ROTAS_PRIVADAS = [
  "/manager",
  "/operator",
  "/account",
  "/checkout",
  "/bookings",
  "/onboarding",
  "/voucher",
  // Página de saída da lista de marketing. Recebe o destinatário em `?t=<token>`, então
  // indexá-la publica o token no índice do Google, e não só uma página magra. Estava de fora
  // até 18/08/2026: constava do opt-out do sitemap, que não emite `noindex`, só deixa de
  // anunciar. Enquanto o host inteiro respondia `noindex` isso não aparecia.
  "/descadastro",
  // Retorno de autenticação. Nada aqui é conteúdo.
  "/auth",
  // Ferramentas internas: catálogo visual e simulador de preço. Públicas por descuido de
  // roteamento, nunca por decisão.
  "/motor-preview",
  "/design-system",
] as const;

/**
 * Compara em minúsculas e sem barra final, pelo mesmo motivo da checagem de 404: o macOS
 * aceita `/Operator` como o mesmo arquivo e o crawler pode ter as duas formas na fila.
 * Casa o prefixo exato ou o que vem abaixo dele, nunca o vizinho de nome parecido
 * (`/accounting` não é `/account`).
 */
export function ehRotaPrivada(pathname: string): boolean {
  const caminho = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  return ROTAS_PRIVADAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/**
 * Marca a resposta como não-indexável quando o host não é o canônico, ou quando o caminho é
 * de área privada (aí vale em qualquer host, o canônico incluído).
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
  if (INDEXABLE_HOSTS.has(url.hostname) && !ehRotaPrivada(url.pathname)) return response;

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

/**
 * Consolidação por intenção (15/08/2026): o acervo herdado do WordPress tinha até
 * oito posts disputando a MESMA consulta ("melhor estacionamento Viracopos"), e o
 * Google não elege vencedor entre páginas irmãs. Um vencedor por intenção e por
 * aeroporto, escolhido pelos cliques de 16 meses do Search Console (planilha de
 * migração); os demais respondem 301 pra ele e saíram de publicação no banco.
 * Navegantes ficou de fora: o comparativo de 2026 é recente e a escolha lá é
 * editorial. Reverter = republicar o post e tirar a entrada daqui.
 */
export const BLOG_CONSOLIDATED_SLUGS: Record<string, string> = {
  // Viracopos · melhor
  "qual-e-o-melhor-estacionamento-do-aeroporto-de-viracopos":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  "qual-o-melhor-estacionamento-no-aeroporto-de-viracopos-guia-completo-para-economizar-e-viajar-com-tranquilidade":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  "top-5-melhores-estacionamentos-aeroporto-viracopos":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  "qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  "top-3-estacionamentos-do-aeroporto-de-viracopos":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  // Viracopos · preço
  "quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias":
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
  "preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui":
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
  "quanto-custa-para-estacionar-no-aeroporto-viracopos":
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
  // Guarulhos · melhor
  "melhor-estacionamento-aeroporto-guarulhos-guia-completo-para-escolher-com-seguranca-economia-e-conforto":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "valor-de-diaria-estacionamento-aeroporto-guarulhos":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "melhores-opcoes-de-estacionamento-gru-airport":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "como-encontrar-o-melhor-estacionamento-no-aeroporto-de-guarulhos":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "qual-o-melhor-estacionamento-no-aeroporto-de-guarulhos-em-2024":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "melhor-estacionamento-aeroporto-guarulhos-2022":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  // Guarulhos · preço
  "qual-e-o-preco-medio-do-estacionamento-no-aeroporto-guarulhos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
  "como-pagar-mais-barato-no-estacionamento-do-aeroporto-guarulhos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
  "estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
  // Afonso Pena · melhor
  "top-3-estacionamentos-do-aeroporto-de-curitiba":
    "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024",
  "qual-o-melhor-estacionamento-no-aeroporto-afonso-pena-em-2024":
    "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024",
  "estacionamento-no-aeroporto-de-afonso-pena-a-melhor-opcao-para-sua-viagem":
    "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024",
  // Afonso Pena · preço
  "preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui":
    "quanto-custa-um-estacionamento-do-aeroporto-afonso-pena",
  // Lisboa · melhor
  "qual-o-melhor-estacionamento-no-aeroporto-lisboa-em-2024":
    "descubra-o-melhor-parque-low-cost-junto-ao-aeroporto-de-lisboa",
  "encontre-o-melhor-estacionamento-perto-do-aeroporto-de-lisboa":
    "descubra-o-melhor-parque-low-cost-junto-ao-aeroporto-de-lisboa",
  // Lisboa · preço
  "quanto-custa-um-estacionamento-do-aeroporto-lisboa":
    "quanto-custa-o-estacionamento-no-aeroporto-lisboa",
  "como-pagar-mais-barato-no-estacionamento-do-aeroporto-de-lisboa":
    "quanto-custa-o-estacionamento-no-aeroporto-lisboa",

  // ---------------------------------------------------------------------------
  // Segunda rodada (27/08/2026): Guarulhos e Afonso Pena, um dono por termo.
  // A rodada de 15/08 fundiu só "melhor" e "preço". Esta fecha as praças inteiras
  // pelos clusters de cabeça do plano de conteúdo. Mapa e critério em
  // docs/specs/canonicalizacao-gru-cwb.md.
  // ---------------------------------------------------------------------------

  // Guarulhos · preço, valor, diária
  "qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-guarulhos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
  "qual-e-o-valor-da-diaria-estacionamento-aeroporto-guarulhos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
  // Guarulhos · barato, economia, desconto
  "as-melhores-estrategias-para-economizar-no-estacionamento-do-aeroporto-de-guarulhos":
    "como-estacionar-barato-no-aeroporto-de-guarulhos",
  "estacionamento-com-desconto-perto-aeroporto-guarulhos":
    "como-estacionar-barato-no-aeroporto-de-guarulhos",
  "estacionamento-aeroporto-guarulhos-gru-economia-recorde-seguranca-e-translado-gratuito-com-a-move-park":
    "como-estacionar-barato-no-aeroporto-de-guarulhos",
  // Guarulhos · proximidade, perto, onde deixar o carro
  "conheca-o-estacionamento-mais-proximo-do-aeroporto-guarulhos-em-2024-2":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  "estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  "dicas-de-viagem-encontre-o-estacionamento-perfeito-perto-do-aeroporto-de-guarulhos-com-o-movepark":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  "onde-deixar-meu-carro-em-aeroporto-guarulhos":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  "onde-estacionar-o-carro-no-aeroporto-de-guarulhos":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  "encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos":
    "estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
  // Guarulhos · melhor e comparativo (o vencedor é o mesmo de 15/08)
  "conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  "vantagens-de-reservar-seu-estacionamento-proximo-ao-gru-airport-com-a-movepark":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  // Guarulhos · segurança
  "como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos":
    "estacionamento-aeroporto-guarulhos-seguranca-do-seu-veiculo-e-prioridade",
  // Guarulhos · guia do aeroporto (o que não é consulta de estacionamento)
  "5-dicas-para-transformar-sua-escala-no-aeroporto-guarulhos-em-uma-aventura-inesquecivel":
    "guia-completo-sobre-o-aeroporto-de-guarulhos",
  "seu-guia-definitivo-para-uma-partida-descomplicada-dicas-valiosas-do-aeroporto-de-guarulhos":
    "guia-completo-sobre-o-aeroporto-de-guarulhos",
  "os-beneficios-de-ir-de-carro-para-o-aeroporto-de-guarulhos-em-2024":
    "guia-completo-sobre-o-aeroporto-de-guarulhos",

  // Afonso Pena · barato, economia, desconto
  "estacionamento-aeroporto-curitiba-cwb-a-solucao-economica-e-segura-com-a-move-park":
    "estacionamento-barato-aeroporto-curitiba",
  "5-maneiras-inteligentes-de-economizar-no-aeroporto-afonso-pena":
    "estacionamento-barato-aeroporto-curitiba",
  "estacionamento-aeroporto-curitiba-alternativas-economicas-e-servicos-de-transporte":
    "estacionamento-barato-aeroporto-curitiba",
  // Afonso Pena · melhor e comparativo (o vencedor é o mesmo de 15/08)
  "5-vantagens-de-estacionar-no-aeroporto-de-curitiba":
    "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024",
  "facilidade-e-conforto-estacionamento-aeroporto-curitiba-cwb":
    "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024",
};

const redirect301 = (to: string) =>
  new Response(null, { status: 301, headers: { Location: to, "Cache-Control": "no-cache" } });

// Irmão temporário do 301, para quando o destino final ainda vai mudar. O
// `no-cache` importa mais aqui do que lá: o navegador guardaria o salto e
// continuaria mandando o visitante para o lugar provisório depois da correção.
const redirect302 = (to: string) =>
  new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-cache" } });

/**
 * URLs institucionais do WordPress fora do namespace `/blog/`. Nomes diferentes dos do Hub,
 * então a migração precisa de 301 e não de URL igual (`sitemapRoutes.test.ts` trava os nomes
 * novos). `/agendar-teste/` e `/o-sistema/` eram formulário de demonstração e página de produto
 * do site de vendas antigo; o Hub não separa "sistema" de site, então caem no destino mais
 * próximo (seja-parceiro e como-funciona). `/` e `/blog/` não entram: já respondem no mesmo
 * caminho nos dois lados, redirecionar seria salto para o próprio destino.
 */
const WP_INSTITUTIONAL_REDIRECTS: Record<string, string> = {
  "/termos-de-uso": "/termos",
  "/politica-de-privacidade": "/privacidade",
  "/agendar-teste": "/seja-parceiro",
  "/o-sistema": "/como-funciona",
};

/**
 * Índices de aeroporto do WordPress (`/estacionamentos/<slug>/`), para a página de destino
 * equivalente no Hub. Levantado em 18/08/2026 contra `docs/specs/wp-inventory/page-sitemap.xml`
 * e a tabela `destination` do Supabase — ver docs/specs/inventario-urls-wordpress.md.
 *
 * `/estacionamentos/` (o índice) e `/estacionamentos/rio-de-janeiro/` (RJ tem dois aeroportos
 * no Hub, Galeão e Santos Dumont, sem página conjunta) vão para `/destinos`, o mais próximo sem
 * inventar uma escolha entre os dois.
 */
const WP_AEROPORTO_REDIRECTS: Record<string, string> = {
  "/estacionamentos": "/destinos",
  "/estacionamentos/rio-de-janeiro": "/destinos",
  "/estacionamentos/aeroporto-viracopos": "/destinos/aeroporto-de-viracopos",
  "/estacionamentos/aeroporto-afonso-pena": "/destinos/aeroporto-afonso-pena",
  "/estacionamentos/aeroporto-confins": "/destinos/aeroporto-de-confins",
  "/estacionamentos/aeroporto-navegantes": "/destinos/aeroporto-internacional-de-navegantes",
  "/estacionamentos/aeroporto-congonhas": "/destinos/aeroporto-de-congonhas",
  "/estacionamentos/aeroporto-brasilia": "/destinos/aeroporto-de-brasilia",
  "/estacionamentos/aeroporto-joao-pessoa": "/destinos/aeroporto-de-joao-pessoa",
  "/estacionamentos/aeroporto-londrina": "/destinos/aeroporto-de-londrina",
  "/estacionamentos/aeroporto-maceio": "/destinos/aeroporto-de-maceio",
  "/estacionamentos/aeroporto-rio-galeao": "/destinos/aeroporto-do-galeao",
  "/estacionamentos/aeroporto-salgado-filho": "/destinos/aeroporto-salgado-filho",
  "/estacionamentos/aeroporto-santos-dumont-rio": "/destinos/aeroporto-santos-dumont",
  "/estacionamentos/aeroporto-recife": "/destinos/aeroporto-internacional-do-recife-guararapes",
  "/estacionamentos/aeroporto-cuiaba": "/destinos/aeroporto-de-cuiaba",
  "/estacionamentos/terminal-rodoviario-tiete": "/destinos/terminal-rodoviario-tiete",
  "/estacionamentos/aeroporto-guarulhos": "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
};

/**
 * As 39 fichas de estacionamento do WordPress (custom post type `estacionamento`), uma por
 * uma, contra o catálogo real do Hub em 18/08/2026. Três destinos possíveis, nesta ordem de
 * preferência:
 *
 * 1. **Parceiro ativo do Hub**: vai para a ficha de reserva (`/p/<empresa>/<unidade>/<tipo>`).
 * 2. **Lote mapeado publicado** (ADR-010, mesma marca): vai para a ficha de vitrine
 *    (`/estacionamentos/<destino>/<slug>`), sem reserva mas com o conteúdo equivalente.
 * 3. **Sem par confiável no Hub** (marca não encontrada, ou achada mas não publicada): vai para
 *    a página do destino (`/destinos/<slug>`) — nunca 404, e nunca um chute de marca errada.
 *
 * `bandeira-park` é o caso notável do grupo 3: o WordPress publica a página dela sob Viracopos,
 * mas o lote mapeado equivalente no Hub está em Guarulhos e não publicado (ver o card
 * "Aeropark GRU publica as fotos do Bandeira Park como se fossem dela"). Redirecionar para uma
 * ficha não publicada não abriria nada; vai para o destino Guarulhos, que é o correto segundo o
 * Hub, não o WordPress.
 */
const WP_ESTACIONAMENTO_REDIRECTS: Record<string, string> = {
  // Parceiros ativos do Hub
  "/estacionamentos/aeroporto-guarulhos/aerovalet-estacionamento-aeroporto-guarulhos":
    "/p/aerovalet/aeroporto-guarulhos/covered",
  "/estacionamentos/aeroporto-congonhas/aerovalet-congonhas-estacionamento-aeroporto-congonhas":
    "/p/aerovalet/aeroporto-congonhas/covered",
  "/estacionamentos/terminal-rodoviario-tiete/aerovalet-tiete-terminal-rodoviario-tiete":
    "/p/aerovalet/terminal-rodoviario-tiete/covered",
  "/estacionamentos/aeroporto-congonhas/plenty-park": "/p/plenty/aeroporto-congonhas/covered",
  "/estacionamentos/aeroporto-guarulhos/aeropark-guarulhos": "/p/aeropark/aeroporto-guarulhos/covered",
  "/estacionamentos/aeroporto-afonso-pena/abba-park-estacionamento-aeroporto-afonso-pena":
    "/p/abbapark/aeroporto-afonso-pena/covered",
  "/estacionamentos/aeroporto-afonso-pena/estacionamento-aeroporto-afonso-pena-curitiba":
    "/p/nationpark/aeroporto-afonso-pena/covered",
  // O tipo de vaga do Garageinn foi renomeado de "uncovered" para "avulsa" depois deste
  // mapa ter sido escrito (18/08). Alvo desatualizado não vira 404 (o padrão /p/x/y/z em
  // ROTAS_DE_APP deixa passar de propósito), vira 200 com a casca da home e canonical
  // apontando pra ela — Google não indexa isso como página própria. Sintoma medido em
  // produção em 21/08: /p/garageinn/aeroporto-viracopos/uncovered não tinha listagem, e
  // <link rel="canonical"> saía como "https://movepark.co" em vez de se auto-referenciar.
  "/estacionamentos/aeroporto-viracopos/garage-inn-aeroporto-viracopos":
    "/p/garageinn/aeroporto-viracopos/avulsa",
  "/estacionamentos/aeroporto-viracopos/virapark-estacionamento-viracopos": "/p/virapark/virapark/covered",
  // Lote mapeado publicado (mesma marca, mesmo destino)
  "/estacionamentos/aeroporto-de-viracopos/br-parking-viracopos": "/estacionamentos/aeroporto-de-viracopos/br-parking-viracopos",
  "/estacionamentos/aeroporto-viracopos/br-parking": "/estacionamentos/aeroporto-de-viracopos/br-parking-viracopos",
  "/estacionamentos/aeroporto-viracopos/yellow-parking": "/estacionamentos/aeroporto-de-viracopos/yellow-parking-viracopos",
  "/estacionamentos/aeroporto-confins/aeropark-confins-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-de-confins/aeropark-confins-aeroporto-confins",
  "/estacionamentos/aeroporto-confins/park-confins-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-de-confins/park-confins-aeroporto-confins",
  "/estacionamentos/aeroporto-guarulhos/econopark-gru":
    "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/econopark-aeroporto-de-guarulhos-aeroporto-guarulhos",
  "/estacionamentos/aeroporto-guarulhos/decolar-park-gru":
    "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/decolar-park-estacionamento-aeroporto-guarulhos",
  "/estacionamentos/aeroporto-guarulhos/flypark-gru":
    "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/flypark-aeroporto-guarulhos",
  "/estacionamentos/aeroporto-congonhas/congonhas-park-cgh":
    "/estacionamentos/aeroporto-de-congonhas/congonhas-park-aeroporto-congonhas",
  "/estacionamentos/aeroporto-congonhas/one-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-de-congonhas/one-parking-congonhas-aeroporto-congonhas",
  "/estacionamentos/cgh/the-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-de-congonhas/the-parking-estacionamento-aeroporto-congonhas",
  "/estacionamento/express-parking": "/estacionamentos/aeroporto-de-congonhas/express-parking-aeroporto-congonhas",
  "/estacionamentos/aeroporto-congonhas/grand-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-de-congonhas/grand-parking-aeroporto-congonhas",
  "/estacionamentos/aeroporto-confins/estacionamento-patio-confins":
    "/estacionamentos/aeroporto-de-confins/estacionamento-patio-aeroporto-confins",
  "/estacionamentos/aeroporto-guarulhos/urban-park-estacionamento-aeroporto-guarulhos-cumbica":
    "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/urban-park-aeroporto-guarulhos",
  // Sem par confiável no Hub: vai para o destino, nunca 404 nem chute de marca
  "/estacionamentos/aeroporto-guarulhos/bandeira-park": "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
  "/estacionamentos/aeroporto-santos-dumont-rio/bh-park-estacionamento-aeroporto-santos-dumont":
    "/destinos/aeroporto-santos-dumont",
  "/estacionamentos/aeroporto-santos-dumont-rio/bossa-nova-mall-estacionamento-aeroporto-santos-dumont":
    "/destinos/aeroporto-santos-dumont",
  "/estacionamentos/aeroporto-rio-galeao/estapar-estacionamento-aeroporto-galeao": "/destinos/aeroporto-do-galeao",
  "/estacionamentos/aeroporto-confins/premium-park-estacionamento-aeroporto-confins":
    "/destinos/aeroporto-de-confins",
  "/estacionamentos/aeroporto-confins/super-park-estacionamento-aeroporto-confins": "/destinos/aeroporto-de-confins",
  "/estacionamentos/aeroporto-guarulhos/aeroparking-gru":
    "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
  "/estacionamentos/aeroporto-guarulhos/viaje-park-gru": "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
  "/estacionamentos/aeroporto-congonhas/arai-park-cgh": "/destinos/aeroporto-de-congonhas",
  "/estacionamentos/aeroporto-congonhas/mobi-city-cgh": "/destinos/aeroporto-de-congonhas",
  "/estacionamentos/rio-de-janeiro/move-parking-nova-iguacu": "/destinos/centro-de-nova-iguacu",
  "/estacionamentos/aeroporto-recife/aero-park-estacionamento-aeroporto-recife":
    "/destinos/aeroporto-internacional-do-recife-guararapes",
  "/estacionamentos/aeroporto-navegantes/prime-estacionamento-aeroporto-navegantes":
    "/destinos/aeroporto-internacional-de-navegantes",
  "/estacionamentos/aeroporto-confins/central-park-confins-estacionamento-aeroporto-confins":
    "/destinos/aeroporto-de-confins",
  "/estacionamentos/aeroporto-confins/be-park-estacionamento-aeroporto-confins": "/destinos/aeroporto-de-confins",
  "/estacionamentos/aeroporto-guarulhos/parkindigo-estacionamento-aeroporto-guarulhos":
    "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
};

/**
 * 301 das URLs institucionais, de aeroporto e de ficha de estacionamento do WordPress. Junta
 * os três mapas acima num só lookup, pela mesma razão do `BLOG_LEGACY_PATHS`: são URLs que já
 * têm clique e/ou backlink e não podem virar 404 silencioso no dia do corte. Roda antes de
 * `blogRedirect` porque nenhum destes caminhos é `/blog/*`, então a ordem entre os dois não
 * importa — mas rodar antes do fallback de asset/404 importa sempre.
 */
export function wpLegacyRedirect(url: URL): Response | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const destino =
    WP_INSTITUTIONAL_REDIRECTS[path] ?? WP_AEROPORTO_REDIRECTS[path] ?? WP_ESTACIONAMENTO_REDIRECTS[path];
  return destino ? redirect301(destino + url.search) : null;
}

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

/**
 * Resolve `/blog/<slug>/` até o dono da intenção, num salto só.
 *
 * Sem isto, uma URL legada que aponta para post depois consolidado gasta dois
 * 301: um para o post, outro para o vencedor. A cadeia funciona no navegador e
 * dilui o sinal na busca, então quem já sabe o destino final entrega ele direto.
 */
function resolveConsolidado(blogPath: string): string {
  const slug = blogPath.replace(/^\/blog\//, "").replace(/\/+$/, "");
  const vencedor = BLOG_CONSOLIDATED_SLUGS[slug];
  return vencedor ? `/blog/${vencedor}/` : blogPath;
}

export function blogRedirect(url: URL): Response | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const legacy = BLOG_LEGACY_PATHS[path];
  if (legacy) return redirect301(resolveConsolidado(legacy) + url.search);

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

  // Post consolidado: a intenção dele agora mora no vencedor do grupo. Vem antes
  // da canônica de barra, senão o perdedor sem barra faria dois saltos.
  if (segments[0] in BLOG_CONSOLIDATED_SLUGS) {
    return redirect301(`/blog/${BLOG_CONSOLIDATED_SLUGS[segments[0]]}/`);
  }

  if (segments[0] in BLOG_CATEGORY_TO_DESTINATION) {
    const destination = BLOG_CATEGORY_TO_DESTINATION[segments[0]];
    return redirect301(destination ? `/destinos/${destination}` : "/blog/");
  }

  // Post sem a barra final: a canônica é com barra, igual ao WordPress.
  return semBarra ? paraCanonica() : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Antes de tudo: no `www` não há o que servir, só para onde apontar.
    const www = redirecionaWww(url);
    if (www) return www;

    // Barra final não é a forma canônica fora do blog (lá o contrato é COM barra).
    // Sem isto, quem respondia era o auto-trailing-slash do ASSETS, com 307
    // (temporário): o crawler não consolida sinal em redirect temporário. Passa
    // pela política de índice porque rota privada segue noindex até no redirect.
    const barra = normalizaBarraFinal(url);
    if (barra) return applyIndexPolicy(barra, url);

    return applyIndexPolicy(await serve(request, env), url);
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
  // Idem: destino que ganha preço depois do build abre pelo cliente até o próximo deploy.
  /^\/estacionamento-mais-barato\/[^/]+$/,
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

  // URL institucional, de aeroporto ou de ficha do WordPress: 301 antes de qualquer outra
  // coisa, pelo mesmo motivo do blog logo abaixo.
  const wpHop = wpLegacyRedirect(url);
  if (wpHop) return wpHop;

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
