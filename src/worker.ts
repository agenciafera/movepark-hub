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
  "aeroporto-guarulhos": "aeroporto-guarulhos",
  guarulhos: "aeroporto-guarulhos",
  "aeroporto-viracopos": "aeroporto-viracopos",
  viracopos: "aeroporto-viracopos",
  campinas: "aeroporto-viracopos",
  "aeroporto-afonso-pena": "aeroporto-curitiba",
  // Lisboa ainda não é destino publicado, então a categoria cai no índice do blog.
  "aeroporto-lisboa": null,
  "aeroporto-confins": "aeroporto-confins",
  "aeroporto-congonhas": "aeroporto-congonhas",
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
  // Viracopos · preço. Reapontado em 28/08/2026: a eleição de 15/08 mandava estes
  // slugs pro how-to de barato; a dona de preço da praça é o guia, que já recebe
  // as consultas de preço no Search Console. Ver canonicalizacao-vcp-cnf.md.
  "quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  "preco-estacionamento-aeroporto-viracopos-saiba-tudo-aqui":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  "quanto-custa-para-estacionar-no-aeroporto-viracopos":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  // Guarulhos · melhor
  "melhor-estacionamento-aeroporto-guarulhos-guia-completo-para-escolher-com-seguranca-economia-e-conforto":
    "guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024",
  // Slug de preço; apontava pra dona de melhor desde 15/08 (o título da época era
  // um "TOP 3"). Reapontado pra dona de preço em 28/08/2026, na revisão cruzada.
  "valor-de-diaria-estacionamento-aeroporto-guarulhos":
    "preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui",
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
  // Afonso Pena · melhor. Invertido em 28/08/2026: o baseline do Search Console
  // mostrou 359 cliques no top-3 contra 28 na dona de 15/08. O conteúdo revisado
  // foi portado pro slug vencedor. Ver a revisão cruzada em canonicalizacao-gru-cwb.md.
  "aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024":
    "top-3-estacionamentos-do-aeroporto-de-curitiba",
  "qual-o-melhor-estacionamento-no-aeroporto-afonso-pena-em-2024":
    "top-3-estacionamentos-do-aeroporto-de-curitiba",
  "estacionamento-no-aeroporto-de-afonso-pena-a-melhor-opcao-para-sua-viagem":
    "top-3-estacionamentos-do-aeroporto-de-curitiba",
  // Afonso Pena · preço. Invertido em 28/08/2026 pelo mesmo critério: o slug
  // absorvido tinha 891 cliques e posição 9,2 contra 1 clique e posição 36 da dona.
  "quanto-custa-um-estacionamento-do-aeroporto-afonso-pena":
    "preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui",
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
    "top-3-estacionamentos-do-aeroporto-de-curitiba",
  "facilidade-e-conforto-estacionamento-aeroporto-curitiba-cwb":
    "top-3-estacionamentos-do-aeroporto-de-curitiba",

  // ---------------------------------------------------------------------------
  // Terceira rodada (28/08/2026): Viracopos, um dono por termo. Fecha a praça
  // pelos clusters de cabeça, com as donas eleitas pelo baseline do Search
  // Console. Mapa e critério em docs/specs/canonicalizacao-vcp-cnf.md.
  // Confins ficou de fora porque os 3 posts de lá ficam.
  // ---------------------------------------------------------------------------

  // Viracopos · preço, valor, diária (a dona é o guia, que já recebe a consulta)
  "guia-completo-estacionamento-aeroporto-viracopos-2026-precos-seguranca-e-economia":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  "qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-viracopos-2024":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  "qual-e-o-valor-da-diaria-estacionamento-aeroporto-viracopos":
    "estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica",
  // Viracopos · proximidade, perto, onde deixar o carro
  "onde-estacionar-proximo-ao-aeroporto-de-viracopos":
    "onde-deixar-o-carro-estacionado-em-viracopos",
  "estacionamento-vcp-onde-deixar-o-carro-em-viracopos-sem-dor-de-cabeca":
    "onde-deixar-o-carro-estacionado-em-viracopos",
  "onde-estacionar-meu-carro-em-aeroporto-viracopos-em-2024":
    "onde-deixar-o-carro-estacionado-em-viracopos",
  // Viracopos · barato, economia, desconto
  "garanta-desconto-no-estacionamento-do-aeroporto-viracopos-com-a-movepark":
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
  "como-pagar-menos-no-estacionamento-do-aeroporto-campinas":
    "como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024",
  // Viracopos · melhor e comparativo (o vencedor é o mesmo de 15/08)
  "por-que-o-virapark-se-destaca-como-melhor-estacionamento-do-aeroporto-campinas":
    "quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024",
  // Viracopos · reserva e como funciona
  "como-reservar-vaga-no-estacionamento-do-aeroporto-de-viracopos":
    "estacionamento-aeroporto-viracopos-como-reservar-antecipadamente-e-garantir-sua-vaga",
  // Viracopos · guia do aeroporto (o que não é consulta de estacionamento)
  "viracopos-para-iniciantes-guia-para-uma-viagem-tranquila-e-sem-estresse":
    "guia-completo-descubra-o-melhor-do-aeroporto-viracopos",
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
 * no Hub, Galeão e Santos Dumont, sem página conjunta) vão para `/estacionamentos`, o mais próximo sem
 * inventar uma escolha entre os dois.
 */
const WP_AEROPORTO_REDIRECTS: Record<string, string> = {
  "/estacionamentos/rio-de-janeiro": "/estacionamentos",
  "/estacionamentos/aeroporto-afonso-pena": "/estacionamentos/aeroporto-curitiba",
  "/estacionamentos/aeroporto-rio-galeao": "/estacionamentos/aeroporto-galeao",
  "/estacionamentos/aeroporto-salgado-filho": "/estacionamentos/aeroporto-porto-alegre",
  "/estacionamentos/aeroporto-santos-dumont-rio": "/estacionamentos/aeroporto-santos-dumont",
  "/estacionamentos/terminal-rodoviario-tiete": "/estacionamentos/rodoviaria-tiete",
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
 *    a página do destino (`/estacionamentos/<destino>`), nunca 404 e nunca um chute de marca errada.
 *
 * `bandeira-park` era o caso notável do grupo 3 e deixou de ser: o lote mapeado dela em
 * Guarulhos foi publicado em 29/08/2026, a ficha existe e a URL do WordPress é EXATAMENTE o
 * endereço dela aqui. A entrada saiu do mapa em 31/08 porque, com a página no ar, o 301
 * roubava a própria página e mandava a pessoa para o destino. É a mesma classe de entrada
 * identidade que a virada de URL removeu, e a varredura de link a pegou porque a URL estava
 * no sitemap e respondia 301.
 */
const WP_ESTACIONAMENTO_REDIRECTS: Record<string, string> = {
  // Parceiros ativos do Hub
  "/estacionamentos/aeroporto-guarulhos/aerovalet-estacionamento-aeroporto-guarulhos":
    "/estacionamentos/aeroporto-guarulhos/aerovalet",
  "/estacionamentos/aeroporto-congonhas/aerovalet-congonhas-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-congonhas/aerovalet",
  "/estacionamentos/terminal-rodoviario-tiete/aerovalet-tiete-terminal-rodoviario-tiete":
    "/estacionamentos/rodoviaria-tiete/aerovalet",
  "/estacionamentos/aeroporto-guarulhos/aeropark-guarulhos": "/estacionamentos/aeroporto-guarulhos/aeropark",
  "/estacionamentos/aeroporto-afonso-pena/abba-park-estacionamento-aeroporto-afonso-pena":
    "/estacionamentos/aeroporto-curitiba/abbapark",
  "/estacionamentos/aeroporto-afonso-pena/estacionamento-aeroporto-afonso-pena-curitiba":
    "/estacionamentos/aeroporto-curitiba/nationpark",
  // O alvo deixou de citar tipo de vaga, que era o que envelhecia aqui: em 21/08 o
  // Garageinn renomeou "uncovered" para "avulsa" e este mapa passou a apontar para uma URL
  // sem página, que respondia 200 com a casca da home. A ficha é uma só por lote agora.
  "/estacionamentos/aeroporto-viracopos/garage-inn-aeroporto-viracopos":
    "/estacionamentos/aeroporto-viracopos/garageinn",
  "/estacionamentos/aeroporto-viracopos/virapark-estacionamento-viracopos": "/estacionamentos/aeroporto-viracopos/virapark",
  "/estacionamentos/aeroporto-confins/aeropark-confins-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-confins/aeropark",
  "/estacionamentos/aeroporto-confins/park-confins-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-confins/park-confins",
  "/estacionamentos/aeroporto-guarulhos/econopark-gru":
    "/estacionamentos/aeroporto-guarulhos/econopark",
  "/estacionamentos/aeroporto-guarulhos/decolar-park-gru":
    "/estacionamentos/aeroporto-guarulhos/decolar-park",
  "/estacionamentos/aeroporto-guarulhos/flypark-gru":
    "/estacionamentos/aeroporto-guarulhos/flypark",
  "/estacionamentos/aeroporto-congonhas/congonhas-park-cgh":
    "/estacionamentos/aeroporto-congonhas/congonhas-park",
  "/estacionamentos/aeroporto-congonhas/one-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-congonhas/one-parking",
  "/estacionamentos/cgh/the-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-congonhas/the-parking",
  "/estacionamento/express-parking": "/estacionamentos/aeroporto-congonhas/express-parking",
  "/estacionamentos/aeroporto-congonhas/grand-parking-estacionamento-aeroporto-congonhas":
    "/estacionamentos/aeroporto-congonhas/grand-parking",
  "/estacionamentos/aeroporto-confins/estacionamento-patio-confins":
    "/estacionamentos/aeroporto-confins/patio",
  "/estacionamentos/aeroporto-guarulhos/urban-park-estacionamento-aeroporto-guarulhos-cumbica":
    "/estacionamentos/aeroporto-guarulhos/urban-park",
  // Sem par confiável no Hub: vai para o destino, nunca 404 nem chute de marca
  "/estacionamentos/aeroporto-santos-dumont-rio/bh-park-estacionamento-aeroporto-santos-dumont":
    "/estacionamentos/aeroporto-santos-dumont",
  "/estacionamentos/aeroporto-santos-dumont-rio/bossa-nova-mall-estacionamento-aeroporto-santos-dumont":
    "/estacionamentos/aeroporto-santos-dumont",
  "/estacionamentos/aeroporto-rio-galeao/estapar-estacionamento-aeroporto-galeao": "/estacionamentos/aeroporto-galeao",
  "/estacionamentos/aeroporto-confins/premium-park-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-confins",
  "/estacionamentos/aeroporto-confins/super-park-estacionamento-aeroporto-confins": "/estacionamentos/aeroporto-confins",
  "/estacionamentos/aeroporto-guarulhos/aeroparking-gru":
    "/estacionamentos/aeroporto-guarulhos",
  "/estacionamentos/aeroporto-guarulhos/viaje-park-gru": "/estacionamentos/aeroporto-guarulhos",
  "/estacionamentos/aeroporto-congonhas/arai-park-cgh": "/estacionamentos/aeroporto-congonhas",
  "/estacionamentos/aeroporto-congonhas/mobi-city-cgh": "/estacionamentos/aeroporto-congonhas",
  "/estacionamentos/rio-de-janeiro/move-parking-nova-iguacu": "/estacionamentos/centro-de-nova-iguacu",
  "/estacionamentos/aeroporto-recife/aero-park-estacionamento-aeroporto-recife":
    "/estacionamentos/aeroporto-recife",
  "/estacionamentos/aeroporto-navegantes/prime-estacionamento-aeroporto-navegantes":
    "/estacionamentos/aeroporto-navegantes",
  "/estacionamentos/aeroporto-confins/central-park-confins-estacionamento-aeroporto-confins":
    "/estacionamentos/aeroporto-confins",
  "/estacionamentos/aeroporto-confins/be-park-estacionamento-aeroporto-confins": "/estacionamentos/aeroporto-confins",
  "/estacionamentos/aeroporto-guarulhos/parkindigo-estacionamento-aeroporto-guarulhos":
    "/estacionamentos/aeroporto-guarulhos",
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
  // URL do WordPress idêntica à do Hub (a ficha manteve o slug): redirecionar
  // seria um 301 para ela mesma, e o loop derruba a página inteira. Aconteceu
  // com a br-parking-viracopos, que ficou inacessível até 28/08/2026.
  if (!destino || destino === path) return null;
  return redirect301(destino + url.search);
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

  // Gêmeo markdown do post: `/blog/<slug>.md` é o que agente de IA busca, e ele precisa
  // seguir o MESMO mapa de consolidação do HTML. Sem isto o `.md` de um slug canibalizado
  // respondia 200 com o artigo velho enquanto o HTML do mesmo slug já ia de 301 para o
  // vencedor: a consolidação valia para o Google e não valia para a IA, que é justamente
  // quem lê markdown. Achado em 31/08/2026, com 59 arquivos nessa situação.
  const ultimo = segments[segments.length - 1];
  if (ultimo.endsWith(".md") && segments.length === 1) {
    const semExtensao = `/blog/${ultimo.slice(0, -3)}`;
    const alvo = BLOG_LEGACY_PATHS[semExtensao] ?? BLOG_CONSOLIDATED_SLUGS[ultimo.slice(0, -3)];
    if (alvo) {
      const destino = alvo.startsWith("/") ? alvo : `/blog/${alvo}`;
      return redirect301(`${destino.replace(/\/+$/, "")}.md${url.search}`);
    }
    return null;
  }

  // Arquivo servido de dentro do /blog (feed.xml): não é slug de post, não entra
  // no contrato de barra final. Sem isto, /blog/feed.xml virava 301 pra forma com
  // barra e o RSS nunca abria.
  if (/\.[a-z0-9]+$/i.test(ultimo)) return null;

  const semBarra = !url.pathname.endsWith("/");
  const paraCanonica = () => redirect301(`${path}/${url.search}`);

  if (BLOG_LISTING_PREFIXES.has(segments[0])) {
    // `/blog/categoria/<aeroporto>` é a forma que o Yoast emitia, e continua
    // indo para o destino: o slug de aeroporto nunca virou categoria editorial.
    if (segments[0] === "categoria" && segments[1] in BLOG_CATEGORY_TO_DESTINATION) {
      const destination = BLOG_CATEGORY_TO_DESTINATION[segments[1]];
      return redirect301(destination ? `/estacionamentos/${destination}` : "/blog/");
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
    return redirect301(destination ? `/estacionamentos/${destination}` : "/blog/");
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
 * O mapa de 301 da virada de URL, carregado UMA vez por isolate.
 *
 * Ele responde por todas as URLs antigas do próprio Hub: `/p/<empresa>/<unidade>/<tipo>`
 * (as três de um mesmo lote colapsaram numa ficha só), `/destinos/*`, `/precos/*`,
 * `/estacionamento-mais-barato/*` e o slug velho dos lotes mapeados. Ver
 * docs/specs/url-estacionamentos.md.
 *
 * Uma consulta por isolate, e não uma por requisição como fazia a versão anterior (a RPC
 * `prospect_redirect_target`, chamada por URL): a partir da virada, `/estacionamentos/*` é a
 * rota principal do site, e consultar o banco em cada visita a uma ficha seria pagar latência
 * de origem no caminho mais quente para atender um punhado de URLs velhas. São ~140 linhas.
 *
 * Falha NÃO entra em cache e não redireciona nada (fail-open): redirecionamento que não sai
 * custa o ranking de uma URL; página que não abre custa o site inteiro. A RPC nunca devolve
 * linha onde origem e destino coincidem, então o mapa não consegue criar loop.
 */
type AlvoLegado = { target: string; permanent: boolean };
let mapaLegado: Map<string, AlvoLegado> | undefined;
let mapaLegadoEm = 0;
/** Cinco minutos: destino publicado no Manager entra sem esperar o isolate morrer. */
const MAPA_LEGADO_TTL_MS = 5 * 60_000;

/** Prefixos que podem carregar URL antiga. Fora deles nem vale consultar o mapa. */
const PREFIXOS_LEGADOS = ["/p", "/destinos", "/precos", "/estacionamento-mais-barato", "/estacionamentos"];

async function carregarMapaLegado(env: Env): Promise<Map<string, AlvoLegado> | null> {
  const agora = Date.now();
  if (mapaLegado && agora - mapaLegadoEm < MAPA_LEGADO_TTL_MS) return mapaLegado;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  try {
    const consulta = new URL("/rest/v1/rpc/url_legacy_map", env.SUPABASE_URL);
    const res = await fetch(consulta, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) return null;

    const linhas = (await res.json()) as unknown;
    if (!Array.isArray(linhas) || linhas.length === 0) return null;

    const mapa = new Map<string, AlvoLegado>();
    for (const linha of linhas as Partial<AlvoLegado & { legacy_path: string; target_path: string }>[]) {
      const de = linha.legacy_path;
      const para = linha.target_path;
      // Guarda de loop também aqui, e não só no banco: um mapa que mande uma URL para ela
      // mesma trava o navegador em redirecionamento infinito, e já aconteceu em produção.
      if (typeof de !== "string" || typeof para !== "string" || de === para) continue;
      mapa.set(de, { target: para, permanent: linha.permanent !== false });
    }
    if (mapa.size === 0) return null;

    mapaLegado = mapa;
    mapaLegadoEm = agora;
    return mapa;
  } catch {
    return null;
  }
}

export async function legacyRedirect(url: URL, env: Env): Promise<Response | null> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!PREFIXOS_LEGADOS.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const mapa = await carregarMapaLegado(env);
  const alvo = mapa?.get(path);
  if (!alvo) return null;
  return alvo.permanent
    ? redirect301(alvo.target + url.search)
    : redirect302(alvo.target + url.search);
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
 * O catálogo inteiro (`/estacionamentos/*`) entra mesmo tendo
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
  // Uma pasta para o catálogo inteiro: índice, destino, ficha, preços e mais barato.
  // Continua em 200 mesmo com HTML pré-renderizado, porque o manifesto nasce no build e o
  // site é SSG: publicar um destino no Manager o deixaria em 404 até alguém empurrar um
  // commit. Cobre também as URLs de aeroporto do WordPress, que agora são as nossas.
  /^\/estacionamentos(\/[^/]+){0,2}$/,
  // Mesma razão do catálogo: as páginas de pergunta (/faq/<slug>) são SSG, e uma FAQ
  // publicada no Manager depois do build precisa abrir antes do próximo deploy.
  /^\/faq(\/[^/]+)?$/,
  // Idem para o que ainda não migrou de endereço: o 301 do mapa cobre, e se ele falhar a
  // página abre pelo cliente em vez de virar 404.
  /^\/p\/[^/]+\/[^/]+\/[^/]+$/,
  /^\/destinos(\/[^/]+)?$/,
  /^\/precos(\/[^/]+)?$/,
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
  mapaLegado = undefined;
  mapaLegadoEm = 0;
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

  // URL antiga do próprio Hub (a virada de /p/, /destinos/, /precos/ e do slug velho dos
  // lotes mapeados) antes da negociação de conteúdo, de propósito: depois dela, um agente
  // pedindo `Accept: text/markdown` receberia o .md do endereço velho em vez do 301.
  const legadoHop = await legacyRedirect(url, env);
  if (legadoHop) return legadoHop;

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
