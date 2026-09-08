/**
 * Lógica pura do ping de IndexNow: leitura do sitemap, cálculo do que mudou desde a última
 * publicação, montagem do payload e a decisão de disparar ou não. Não toca em disco nem na
 * rede, para o teste (`src/lib/indexnow.test.ts`) rodar sem build e sem sair para a internet.
 * O I/O mora em `scripts/indexnow-ping.mjs`.
 *
 * Contexto em docs/specs/indexnow.md.
 */

/**
 * A chave do IndexNow.
 *
 * **Não é segredo.** O protocolo exige que ela esteja publicada em texto puro na raiz do site
 * (`/<chave>.txt`), porque é assim que o buscador confirma que quem submeteu manda no domínio.
 * Está no código pelo mesmo critério da anon key do Supabase: pública por desenho. Trocar a
 * chave é trocar as duas pontas ao mesmo tempo, esta constante e o arquivo em `public/`.
 */
export const CHAVE = "d009bb0231ab7732d03b227e6f5fc435";

/** Endpoint neutro do protocolo: ele repassa para Bing, Yandex, Seznam e Naver de uma vez. */
export const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Teto de URLs por chamada, definido pelo protocolo. */
export const LIMITE_POR_LOTE = 10000;

/**
 * A chave precisa ter de 8 a 128 caracteres entre letras, números e hífen. Validar aqui evita
 * descobrir o erro como um 403 do outro lado, que não diz qual das duas pontas está errada.
 */
export function chaveValida(chave) {
  return typeof chave === "string" && /^[a-zA-Z0-9-]{8,128}$/.test(chave);
}

/**
 * URLs de um sitemap, com o `lastmod` quando existe.
 *
 * Regex em vez de parser de XML porque o sitemap é gerado por nós, sai em uma linha só e o
 * repositório não tem dependência de XML. Se um dia o formato vier de fora, troque por parser.
 */
export function urlsDoSitemap(xml) {
  const blocos = String(xml ?? "").match(/<url\b[\s\S]*?<\/url>/g) ?? [];
  return blocos.map((bloco) => ({
    loc: (bloco.match(/<loc>([\s\S]*?)<\/loc>/) ?? [])[1]?.trim() ?? "",
    lastmod: (bloco.match(/<lastmod>([\s\S]*?)<\/lastmod>/) ?? [])[1]?.trim() ?? null,
  })).filter((u) => u.loc !== "");
}

/** Endereços dos shards declarados num índice de sitemap. */
export function shardsDoIndice(xml) {
  const blocos = String(xml ?? "").match(/<sitemap\b[\s\S]*?<\/sitemap>/g) ?? [];
  return blocos
    .map((bloco) => (bloco.match(/<loc>([\s\S]*?)<\/loc>/) ?? [])[1]?.trim() ?? "")
    .filter((loc) => loc !== "");
}

/**
 * O que submeter: URL que não existia na publicação anterior, ou que existia com outro
 * `lastmod`.
 *
 * O protocolo é para avisar mudança, não para reenviar o site inteiro: reenvio repetido
 * devolve 429 e queima a reputação da chave. Por isso o padrão é o delta, e mandar tudo é
 * uma decisão explícita (`--tudo`), para a estreia.
 *
 * URL que sumiu do sitemap **também** entra, porque o IndexNow serve para avisar remoção, e
 * o buscador que recrawleia e encontra 404 ou 301 tira a URL antiga do índice mais rápido.
 */
export function urlsParaSubmeter(atual, anterior) {
  const antes = new Map(anterior.map((u) => [u.loc, u.lastmod]));
  const agora = new Map(atual.map((u) => [u.loc, u.lastmod]));

  const mudaram = atual
    .filter((u) => !antes.has(u.loc) || antes.get(u.loc) !== u.lastmod)
    .map((u) => u.loc);
  const sumiram = anterior.filter((u) => !agora.has(u.loc)).map((u) => u.loc);

  return [...new Set([...mudaram, ...sumiram])];
}

/** Fatia a lista no teto do protocolo. Uma lista vazia não vira lote nenhum. */
export function lotes(urls, tamanho = LIMITE_POR_LOTE) {
  const saida = [];
  for (let i = 0; i < urls.length; i += tamanho) saida.push(urls.slice(i, i + tamanho));
  return saida;
}

/**
 * Corpo de uma chamada. `keyLocation` vai explícito mesmo com a chave na raiz: é barato e
 * tira a ambiguidade quando o buscador procura o arquivo.
 */
export function montarPayload({ host, chave, urls }) {
  return {
    host,
    key: chave,
    keyLocation: `https://${host}/${chave}.txt`,
    urlList: urls,
  };
}

/**
 * Se o ping deve sair neste ambiente.
 *
 * O `bun run build` roda em três lugares: na máquina do dev, no workflow do Lighthouse e no
 * Workers Builds. Só o terceiro publica, e só ele deve avisar buscador. O marcador é o
 * `WORKERS_CI`, que o Workers Builds injeta sozinho, sem precisar de variável configurada no
 * painel. A branch entra na conta porque build de preview não é o que está no ar.
 */
export function deveDisparar(env = {}, { forcar = false } = {}) {
  if (forcar) return { sim: true, motivo: "forçado por --forcar" };
  if (env.WORKERS_CI !== "1") {
    return { sim: false, motivo: "fora do Workers Builds (WORKERS_CI != 1)" };
  }
  if (env.WORKERS_CI_BRANCH && env.WORKERS_CI_BRANCH !== "main") {
    return { sim: false, motivo: `branch ${env.WORKERS_CI_BRANCH}, não é a main` };
  }
  return { sim: true, motivo: "publicação da main no Workers Builds" };
}

/** Só submeta URL do próprio host: o protocolo devolve 422 para o resto. */
export function apenasDoHost(urls, host) {
  return urls.filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
}
