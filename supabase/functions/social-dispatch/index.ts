// Edge Function: /social-dispatch
// Publicação agendada da fila do Instagram (E3.6). Chamada pelo pg_cron a cada 15 minutos.
// É o ÚNICO código que publica na conta real: o resto da fila só prepara, aprova e mostra.
//
// Uma rodada:
//   1. reconcilia post parado em `publishing` (rodada ou "Publicar agora" que caiu no meio), com a
//      chave ligada ou não: reconciliar só consulta a Meta e nunca publica;
//   2. marca `overdue` todo aprovado com mais de 6 h de atraso (com a chave ligada ou não: ligar
//      depois não despeja a fila acumulada);
//   3. escolhe UM aprovado cuja hora chegou, um por dia no fuso de São Paulo;
//   4. chave desligada (`app_setting.social_dispatch_enabled` diferente de 'true'): só grava o
//      evento `dry_run`, uma vez por post, e não muda o estado nem publica;
//   5. chave ligada: pega o post com update condicional (status = 'approved'), consulta o container
//      antigo antes de criar outro e publica. O mesmo post nunca sai duas vezes.
//
// Regras que seguram o "nunca duas vezes":
//   - o container pai é gravado ANTES do media_publish; se a gravação falhar, nada é publicado;
//   - toda escrita depois da pega é condicionada ao estado em que a rodada deixou o post
//     (`publishing`), então uma mudança concorrente não é pisada;
//   - nova tentativa com `ig_container_id` consulta a Meta antes: container PUBLISHED é
//     reconciliado pela legenda e nunca publicado de novo, e status ilegível não publica;
//   - `media_publish` com erro lê o container uma vez: a Meta às vezes publica e responde 5xx, e
//     PUBLISHED vira reconciliação, não `failed`;
//   - a pega exige `scheduled_at <= agora` e devolve a linha; a publicação sai dessa linha, então
//     um reagendamento ou uma correção no meio do caminho não publica cedo nem com conteúdo velho;
//   - na reconciliação, `published_at` é o horário da mídia na Meta, para o post contar no dia de
//     São Paulo em que foi ao ar;
//   - falha ao gravar o rastro é logada e nunca derruba a rodada.
//
// Stories (22/10/2026): `placements` diz onde o post sai (feed, story ou os dois). Com os dois, os
// stories saem logo depois do feed, um por slide 9:16 (`story_slides`), cada um com um envio
// STORIES e um media_publish. Eles têm estado próprio (`story_status`): falha de story nunca mexe
// no feed. O envio de cada story é gravado em `story_items` antes do media_publish, e nova
// tentativa consulta o envio: story publicado nunca sai de novo. Sem tempo na chamada, o resto fica
// `pending`, e a rodada sem feed para sair publica os stories que ficaram para trás (só com a chave
// ligada). Post só de stories: os stories são a publicação, e `published` quer dizer que saíram.
//
// Toda chamada à Graph API vira linha em `social_post_event`, sem o token.
//
// "Publicar agora" (modo forçado, 21/10/2026): o Manager chama a RPC `social_post_publish_now`,
// que deixa o post `approved` com a hora de agora, e depois esta Edge com o JWT de um hub_admin e
// `{ post_id }`. Nesse modo a Edge não lê a chave de disparo, não aplica o um por dia e não toca em
// nenhum outro post (sem reconciliar parados, sem marcar atrasados). A publicação em si é a mesma
// da rodada (`pegarEPublicar`): pega atômica, container antigo consultado antes, reconciliação no
// erro ambíguo e rastro de cada chamada. Então o "nunca duas vezes" vale igual.
//
// POST /functions/v1/social-dispatch  (header x-social-dispatch-key, conferido no Vault por
// cron_key_matches: o valor não passa por terminal nem por secret de Edge)
// → 200 { ok, acao, post?, permalink?, posts?, ligada?, stories?: { publicados, faltam, erro? } }
//   acao: nada | ja_publicou_hoje | em_andamento | reconciliou | dry_run | outra_rodada |
//         reconciliado | publicado
// → 502 { ok: false, acao: "falhou", post, erro }  (a Meta recusou ou a reconciliação falhou)
// → 500 { ok: false, error }  (banco), 503 (sem secrets da Meta), 401 (chave), 405
//   Caso raro: `ok: false` com `acao: "publicado"` e 500 quer dizer que a Meta publicou e a rodada
//   não conseguiu gravar o estado; o `erro` diz o que conferir.
//
// POST /functions/v1/social-dispatch  (modo forçado: Authorization: Bearer <JWT> e
// { "post_id": "<uuid>" }; sem os dois, o pedido segue o caminho do cron acima)
// → 200 { ok, acao: outra_rodada | reconciliado | publicado | stories, post, permalink?, stories? }
//   (post já publicado no feed com stories pendentes: acao "stories", sai só o que falta deles)
// → 502 { ok: false, acao: "falhou", post, erro }
// → 409 { ok: false, post, error }  (o post não está aprovado para agora; texto pt-BR)
// → 404 (post), 400 (post_id), 401 (sessão), 403 (não é hub_admin), 503, 500
// OPTIONS responde o CORS, porque o Manager chama do navegador.
//
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional).
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  acharMidiaPorLegenda,
  criarStory,
  esperarContainer,
  type GraphCall,
  type IgConfig,
  igConfigFromEnv,
  lerPermalink,
  type Opcoes,
  publicar,
  publicarEnvio,
  statusDoContainer,
} from "../_shared/instagram.ts";
import {
  ATRASO_MAXIMO_MS,
  atrasados,
  escolher,
  type EtapaDoStory,
  instanteDaMeta,
  jaPublicado,
  motivoParaNaoPublicarAgora,
  parados,
  PUBLICANDO_PARADO_MS,
  type PostFila,
  proximoComStories,
  textoDaFalha,
  textoDaFalhaDoStory,
} from "./logic.ts";

// O Manager chama o "Publicar agora" pelo navegador. O cron não precisa disso, e não perde nada.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As colunas que a publicação lê do post. */
const CAMPOS =
  "id, status, scheduled_at, published_at, updated_at, caption, slides, ig_container_id, attempts, " +
  "placements, story_slides, story_status, story_items, story_claimed_at";

/**
 * Até quando uma chamada começa um story novo, contado do início dela. A Edge tem 150 s de
 * relógio; o feed de um carrossel leva cerca de 50 s e cada story uns 8 s. O que passar fica
 * `pending` para a próxima rodada. Pelo menos um story sai por chamada, para a fila andar.
 */
const PRAZO_STORIES_MS = 100_000;

const env = (k: string): string | undefined => Deno.env.get(k);

// deno-lint-ignore no-explicit-any
export type Admin = any;

/** Um story da lista: o envio (gravado antes do media_publish) e a mídia, quando saiu. */
interface ItemDeStory {
  container_id?: string | null;
  media_id?: string | null;
  publicado?: boolean;
}

type PostCompleto = PostFila & {
  caption: string;
  slides: Array<{ url: string; alt: string | null }>;
  ig_container_id: string | null;
  attempts: number;
  placements?: string[] | null;
  story_slides?: Array<{ url: string }> | null;
  story_status?: string | null;
  story_items?: ItemDeStory[] | null;
  story_claimed_at?: string | null;
};

/** Sem a coluna (linha antiga, teste antigo), o post é só de feed. */
const lugares = (p: PostCompleto) => (p.placements?.length ? p.placements : ["feed"]);

export interface RodadaDeps {
  admin: Admin;
  cfg: IgConfig;
  /** O instante da rodada. Nos testes é fixo; na Edge é `new Date()`. */
  agora: Date;
  /** O relógio das escritas feitas durante a rodada (`published_at`). Na Edge é `new Date()`. */
  relogio?: () => Date;
  /** Cliente HTTP da Graph API. Nos testes é o de mentira; na Edge é o `fetch`. */
  fetcher?: typeof fetch;
}

export interface Resultado {
  status: number;
  body: Record<string, unknown>;
}

interface Ctx {
  admin: Admin;
  cfg: IgConfig;
  fetcher?: typeof fetch;
  relogio: () => Date;
}

/** Tira o token de um texto antes de ele ir para o log ou para o banco. */
const limpar = (cfg: IgConfig, texto: string) => (cfg.token ? texto.replaceAll(cfg.token, "[token]") : texto);

const ok = (body: Record<string, unknown>): Resultado => ({ status: 200, body: { ok: true, ...body } });
const erroDeBanco = (msg: string): Resultado => ({ status: 500, body: { ok: false, error: msg } });
const falhou = (post: string, erro: string): Resultado => ({
  status: 502,
  body: { ok: false, acao: "falhou", post, erro },
});

/** Grava o evento do rastro. Falhar aqui é logado e nunca derruba a rodada. */
async function registrar(ctx: Ctx, postId: string, kind: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const { error } = await ctx.admin.from("social_post_event").insert({ social_post_id: postId, kind, ...extra });
    if (!error) return true;
    console.error("social-dispatch: evento do rastro não gravado", {
      kind,
      social_post_id: postId,
      code: error.code,
      message: limpar(ctx.cfg, String(error.message)),
    });
  } catch (e) {
    console.error("social-dispatch: evento do rastro estourou", {
      kind,
      social_post_id: postId,
      message: limpar(ctx.cfg, String(e)),
    });
  }
  return false;
}

/** Uma opção de chamada à Graph API que grava o rastro de cada chamada, sem o token. */
function opcoes(ctx: Ctx, postId: string): Opcoes {
  return {
    fetcher: ctx.fetcher,
    onCall: async (c: GraphCall) => {
      await registrar(ctx, postId, c.kind, {
        http_status: c.result.status || null,
        request: { metodo: c.metodo, caminho: c.caminho, campos: c.campos },
        response: c.result.body,
      });
    },
  };
}

/**
 * Escreve no post SÓ se ele ainda está em `de`. Devolve se a escrita valeu. Zero linhas quer dizer
 * que outra rodada ou uma pessoa mudou o estado no meio do caminho: o que mudou fica como está.
 * `agendadoAntesDe` exige também que a hora marcada ainda seja anterior a esse instante: é o que
 * impede de marcar como atrasado um post que uma pessoa reagendou, ainda como `approved`, entre a
 * leitura e a escrita.
 */
async function escrever(
  ctx: Ctx,
  id: string,
  de: string,
  campos: Record<string, unknown>,
  opts: { agendadoAntesDe?: string } = {},
): Promise<boolean> {
  let q = ctx.admin.from("social_post").update(campos).eq("id", id).eq("status", de);
  if (opts.agendadoAntesDe) q = q.lt("scheduled_at", opts.agendadoAntesDe);
  const { data, error } = await q.select("id");
  if (error) {
    console.error("social-dispatch: escrita no post falhou", {
      social_post_id: id,
      de,
      para: campos.status,
      code: error.code,
      message: limpar(ctx.cfg, String(error.message)),
    });
    return false;
  }
  if (!data?.length) {
    console.error("social-dispatch: o post mudou de estado antes da escrita; nada foi alterado", {
      social_post_id: id,
      de,
      para: campos.status,
    });
    return false;
  }
  return true;
}

/** `resposta` é o que a Meta devolveu, cru: fica no evento. O Manager lê só o texto em `last_error`. */
async function marcarFalha(ctx: Ctx, id: string, msg: string, resposta?: unknown): Promise<void> {
  if (await escrever(ctx, id, "publishing", { status: "failed", last_error: msg })) {
    await registrar(ctx, id, "failed", { note: msg, ...(resposta === undefined ? {} : { response: resposta }) });
  }
}

/**
 * O post saiu na Meta. Marca `published`; o evento de quem chama só vale se a escrita valeu.
 * `publicadoEm` é o instante real da publicação (a reconciliação o lê da mídia); sem ele, é agora.
 */
const marcarPublicado = (ctx: Ctx, id: string, mediaId: string, permalink: string | null, publicadoEm?: string) =>
  escrever(ctx, id, "publishing", {
    status: "published",
    ig_media_id: mediaId,
    ig_permalink: permalink,
    published_at: publicadoEm ?? ctx.relogio().toISOString(),
    last_error: null,
  });

type Reconciliacao = { ok: true } | { ok: false; erro: string };

/**
 * Rodada que caiu no meio do caminho, ou nova tentativa de post com container: decide pelo
 * container da Meta, nunca publicando de novo às cegas. `statusConhecido` evita ler o container
 * duas vezes quando quem chama já leu.
 */
async function reconciliar(ctx: Ctx, p: PostCompleto, statusConhecido?: string): Promise<Reconciliacao> {
  const falha = async (msg: string): Promise<Reconciliacao> => {
    await marcarFalha(ctx, p.id, msg);
    return { ok: false, erro: msg };
  };
  if (!p.ig_container_id) {
    return await falha("A publicação parou antes de criar o envio na Meta. Reagende para tentar de novo.");
  }
  const st = statusConhecido ?? (await statusDoContainer(ctx.cfg, p.ig_container_id, opcoes(ctx, p.id)));
  if (!jaPublicado(st)) {
    return await falha(`A publicação parou com o envio na Meta em ${st || "estado desconhecido"}. Reagende para tentar de novo.`);
  }
  const midia = await acharMidiaPorLegenda(ctx.cfg, p.caption, opcoes(ctx, p.id));
  if (!midia) {
    return await falha(
      "O envio aparece como publicado na Meta, mas o post não foi achado no perfil. Confira no Instagram antes de reagendar.",
    );
  }
  // O dia em São Paulo do post é o de quando ele foi ao ar, não o de quando a rodada o achou.
  const publicadoEm = instanteDaMeta(midia.timestamp, ctx.relogio());
  if (!(await marcarPublicado(ctx, p.id, midia.id, midia.permalink, publicadoEm))) {
    return { ok: false, erro: "O post mudou de estado durante a reconciliação e ficou como está." };
  }
  await registrar(ctx, p.id, "reconciled", {
    note: "O envio já estava publicado na Meta. Nada foi publicado de novo.",
    response: midia,
  });
  return { ok: true };
}

/** Falha que acontece antes do media_publish, com a certeza de que nada saiu no Instagram. */
class NadaPublicado extends Error {}

type DesfechoDosStories =
  | { pego: false }
  | { pego: true; publicados: number; faltam: number; erro?: string; primeiraMidia: string | null };

const resumoDosStories = (d: Extract<DesfechoDosStories, { pego: true }>) => ({
  publicados: d.publicados,
  faltam: d.faltam,
  ...(d.erro ? { erro: d.erro } : {}),
});

/** Escreve nos stories do post SÓ se esta chamada ainda é dona deles (`story_status = publishing`). */
async function escreverStories(ctx: Ctx, id: string, campos: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await ctx.admin
    .from("social_post")
    .update(campos)
    .eq("id", id)
    .eq("story_status", "publishing")
    .select("id");
  if (error) {
    console.error("social-dispatch: escrita nos stories falhou", {
      social_post_id: id,
      code: error.code,
      message: limpar(ctx.cfg, String(error.message)),
    });
    return false;
  }
  return !!data?.length;
}

/**
 * Publica os stories do post, um por slide 9:16, na ordem. Cada story é um envio STORIES e um
 * media_publish; o envio é gravado em `story_items` ANTES do media_publish. Nova tentativa:
 * story com `publicado` é pulado, envio PUBLISHED conta como publicado, envio pronto é publicado
 * sem criar outro, e envio com erro ou vencido dá lugar a um novo. Assim nenhum story sai duas
 * vezes. `de` são os estados de onde esta chamada pega os stories; `publishing` só vale parado.
 * Passado o `prazo`, o resto volta para `pending` e sai na próxima rodada.
 */
async function publicarStories(
  ctx: Ctx,
  post: PostCompleto,
  de: string[],
  prazo = Number.POSITIVE_INFINITY,
): Promise<DesfechoDosStories> {
  const agoraIso = ctx.relogio().toISOString();
  let pega = ctx.admin
    .from("social_post")
    .update({ story_status: "publishing", story_claimed_at: agoraIso })
    .eq("id", post.id)
    .in("story_status", de);
  if (de.includes("publishing")) {
    pega = pega.lt("story_claimed_at", new Date(Date.parse(agoraIso) - PUBLICANDO_PARADO_MS).toISOString());
  }
  const { data: pego, error } = await pega.select("id, story_slides, story_items");
  if (error) {
    console.error("social-dispatch: a pega dos stories falhou", limpar(ctx.cfg, String(error.message)));
    return { pego: false };
  }
  if (!pego?.length) return { pego: false };

  const slides = (pego[0].story_slides ?? []) as Array<{ url: string }>;
  const itens: ItemDeStory[] = slides.map((_, i) => ({ ...((pego[0].story_items ?? [])[i] ?? {}) }));
  const op = opcoes(ctx, post.id);
  const feitos = () => itens.filter((i) => i.publicado).length;
  const primeiraMidia = () => itens.find((i) => i.media_id)?.media_id ?? null;
  let nestaChamada = 0;

  const falhar = async (n: number, etapa: EtapaDoStory, resposta: unknown): Promise<DesfechoDosStories> => {
    const erro = textoDaFalhaDoStory(n, etapa, resposta);
    if (await escreverStories(ctx, post.id, { story_status: "failed", story_error: erro, story_items: itens })) {
      await registrar(ctx, post.id, "story_failed", { note: erro, ...(resposta === undefined ? {} : { response: resposta }) });
    }
    return { pego: true, publicados: feitos(), faltam: itens.length - feitos(), erro, primeiraMidia: primeiraMidia() };
  };

  for (const [i, slide] of slides.entries()) {
    const n = i + 1;
    const item = itens[i];
    if (item.publicado) continue;
    if (nestaChamada > 0 && ctx.relogio().getTime() > prazo) {
      // Sem tempo para mais um: o resto sai na próxima rodada, do ponto em que parou.
      await escreverStories(ctx, post.id, { story_status: "pending", story_items: itens });
      return { pego: true, publicados: feitos(), faltam: itens.length - feitos(), primeiraMidia: primeiraMidia() };
    }
    nestaChamada++;

    // Envio de uma tentativa anterior: a Meta diz se ele já saiu, se está pronto ou se não serve.
    let envio = item.container_id ?? null;
    let pronto = false;
    if (envio) {
      const st = await statusDoContainer(ctx.cfg, envio, op);
      if (jaPublicado(st)) {
        itens[i] = { container_id: envio, media_id: null, publicado: true };
        await escreverStories(ctx, post.id, { story_items: itens });
        continue;
      }
      if (st === "FINISHED") pronto = true;
      else if (st !== "IN_PROGRESS") envio = null;
    }

    if (!envio) {
      const criado = await criarStory(ctx.cfg, slide.url, op);
      if (!criado.ok) return await falhar(n, "envio", criado.resposta);
      envio = criado.containerId;
      itens[i] = { container_id: envio };
      // Sem o envio gravado, não publica: uma queda depois do media_publish publicaria de novo.
      if (!(await escreverStories(ctx, post.id, { story_items: itens }))) return await falhar(n, "gravacao", undefined);
    }

    if (!pronto) {
      const espera = await esperarContainer(ctx.cfg, envio, op);
      if (!espera.pronto) return await falhar(n, "processamento", espera);
    }

    const pub = await publicarEnvio(ctx.cfg, envio, op, "story_publish");
    if (!pub.ok) {
      // A Meta às vezes publica e responde erro: olha o envio uma vez antes de dar por falho.
      if (jaPublicado(await statusDoContainer(ctx.cfg, envio, op))) {
        itens[i] = { container_id: envio, media_id: null, publicado: true };
      } else {
        return await falhar(n, "publicacao", pub.resposta);
      }
    } else {
      itens[i] = { container_id: envio, media_id: pub.mediaId, publicado: true };
    }
    // Se esta escrita falhar, o envio já está gravado: a próxima tentativa o acha PUBLISHED.
    await escreverStories(ctx, post.id, { story_items: itens });
  }

  if (
    await escreverStories(ctx, post.id, {
      story_status: "published",
      story_items: itens,
      story_error: null,
      story_published_at: ctx.relogio().toISOString(),
    })
  ) {
    await registrar(ctx, post.id, "story_published", { note: `${itens.length} stories publicados.` });
  }
  return { pego: true, publicados: feitos(), faltam: 0, primeiraMidia: primeiraMidia() };
}

/**
 * Post só de stories, já pego (`publishing`): os stories são a publicação. Saíram todos, o post
 * fica `published` com a mídia do primeiro story; falhou, fica `failed` com o motivo do story.
 */
async function publicarSoStories(ctx: Ctx, post: PostCompleto): Promise<Resultado> {
  const st = await publicarStories(ctx, post, ["pending", "failed"]);
  if (!st.pego) {
    const msg = "Os stories deste post não estavam prontos para sair. Reagende para tentar de novo.";
    await marcarFalha(ctx, post.id, msg);
    return falhou(post.id, msg);
  }
  if (st.erro) {
    await marcarFalha(ctx, post.id, st.erro);
    return falhou(post.id, st.erro);
  }
  if (!(await marcarPublicado(ctx, post.id, st.primeiraMidia ?? "", null))) {
    return {
      status: 500,
      body: { ok: false, acao: "publicado", post: post.id, erro: "Os stories saíram, mas não consegui marcar o post como publicado." },
    };
  }
  return ok({ acao: "publicado", post: post.id, permalink: null, stories: resumoDosStories(st) });
}

/**
 * Pega o post e publica: o único caminho de publicação da Edge, usado pela rodada (o post que
 * `escolher` indicou) e pelo "Publicar agora" (o post que a pessoa clicou). `lido` é o post como
 * quem chama o leu; daqui em diante vale a linha que a pega devolver.
 */
async function pegarEPublicar(ctx: Ctx, lido: PostCompleto, agora: Date, prazo: number): Promise<Resultado> {
  // Pega o post. Se outra rodada pegou antes, ou se um reagendamento empurrou a hora para o
  // futuro entre a leitura e agora, a linha não volta e a rodada para aqui.
  const { data: pego, error: ePega } = await ctx.admin
    .from("social_post")
    .update({ status: "publishing", attempts: lido.attempts + 1 })
    .eq("id", lido.id)
    .eq("status", "approved")
    .lte("scheduled_at", agora.toISOString())
    .is("deleted_at", null)
    .select("id, scheduled_at, caption, slides, ig_container_id, attempts, placements, story_slides, story_status, story_items");
  if (ePega) {
    console.error("social-dispatch: a pega do post falhou", limpar(ctx.cfg, String(ePega.message)));
    return erroDeBanco("Não consegui pegar o post para publicar.");
  }
  if (!pego?.length) return ok({ acao: "outra_rodada", post: lido.id });
  // Daqui em diante vale a linha que a pega devolveu, não a lida antes: legenda, slides e container
  // são os de agora, então uma correção que chegou no meio não publica conteúdo velho.
  const post = { ...lido, ...pego[0] } as PostCompleto;

  if (!lugares(post).includes("feed")) return await publicarSoStories(ctx, post);
  const r = await publicarFeed(ctx, post);
  // Os stories saem logo depois do feed, na mesma chamada. Falha deles nunca mexe no feed.
  if (r.status === 200 && lugares(post).includes("story") && (r.body.acao === "publicado" || r.body.acao === "reconciliado")) {
    const st = await publicarStories(ctx, post, ["pending", "failed"], prazo);
    if (st.pego) r.body.stories = resumoDosStories(st);
  }
  return r;
}

/** O feed do post já pego: carrossel ou imagem única, com a reconciliação de sempre. */
async function publicarFeed(ctx: Ctx, post: PostCompleto): Promise<Resultado> {

  if (post.ig_container_id) {
    const st = await statusDoContainer(ctx.cfg, post.ig_container_id, opcoes(ctx, post.id));
    if (jaPublicado(st)) {
      const r = await reconciliar(ctx, post, st);
      return r.ok ? ok({ acao: "reconciliado", post: post.id }) : falhou(post.id, r.erro);
    }
    if (!st) {
      // Não li o status (a Meta falhou). Seguir adiante publicaria de novo se o envio antigo já
      // saiu. Só um status conhecido e diferente de PUBLISHED libera um container novo.
      const msg = "O envio anterior deste post não pôde ser conferido na Meta, então nada foi publicado. Reagende para tentar de novo.";
      await marcarFalha(ctx, post.id, msg);
      return falhou(post.id, msg);
    }
  }

  let res;
  try {
    res = await publicar(
      ctx.cfg,
      { caption: post.caption, images: post.slides.map((s) => ({ url: s.url, alt: s.alt })) },
      {
        ...opcoes(ctx, post.id),
        // Sem o container gravado, a nova tentativa não teria como saber que ele existe e
        // publicaria de novo. Então, se a gravação falha, a rodada para ANTES do media_publish.
        onContainer: async (id) => {
          if (!(await escrever(ctx, post.id, "publishing", { ig_container_id: id }))) {
            throw new NadaPublicado("o envio criado na Meta não pôde ser gravado");
          }
        },
      },
    );
  } catch (e) {
    const msg = e instanceof NadaPublicado
      ? `Nada foi publicado: ${e.message}. Reagende para tentar de novo.`
      : `A publicação parou por um erro inesperado (${limpar(ctx.cfg, String(e)).slice(0, 200)}). Confira no Instagram antes de reagendar.`;
    await marcarFalha(ctx, post.id, msg);
    return falhou(post.id, msg);
  }
  if (!res.ok) {
    // A Meta às vezes publica e responde 5xx ou estoura o tempo. Antes de dar o post por falho,
    // olha o container uma vez: PUBLISHED é post no ar, e reconcilia em vez de falhar.
    if (res.etapa === "media_publish" && res.containerId) {
      const st = await statusDoContainer(ctx.cfg, res.containerId, opcoes(ctx, post.id));
      if (jaPublicado(st)) {
        const r = await reconciliar(ctx, { ...post, ig_container_id: res.containerId }, st);
        return r.ok ? ok({ acao: "reconciliado", post: post.id }) : falhou(post.id, r.erro);
      }
    }
    const msg = textoDaFalha(res.etapa, res.resposta);
    await marcarFalha(ctx, post.id, msg, res.resposta);
    return falhou(post.id, msg);
  }

  const permalink = await lerPermalink(ctx.cfg, res.mediaId, opcoes(ctx, post.id));
  if (!(await marcarPublicado(ctx, post.id, res.mediaId, permalink))) {
    // Está no Instagram e o banco não sabe. O container já está gravado, então a próxima tentativa
    // reconcilia pela legenda em vez de publicar de novo.
    return {
      status: 500,
      body: {
        ok: false,
        acao: "publicado",
        post: post.id,
        permalink,
        erro: "A Meta publicou, mas o estado do post não foi gravado. Confira o post na fila antes de reagendar.",
      },
    };
  }
  return ok({ acao: "publicado", post: post.id, permalink });
}

/**
 * A vez dos stories que ficaram para trás: post publicado no feed com stories `pending` (o resto de
 * uma chamada sem tempo, ou um post antigo que ganhou stories) ou parados em `publishing`. Um post
 * por rodada. Devolve nulo quando não há nenhum.
 */
async function rodadaDeStories(ctx: Ctx, agora: Date, prazo: number): Promise<Resultado | null> {
  const { data, error } = await ctx.admin
    .from("social_post")
    .select(CAMPOS)
    .is("deleted_at", null)
    .eq("status", "published")
    .in("story_status", ["pending", "publishing"]);
  if (error) {
    console.error("social-dispatch: não li os stories pendentes", limpar(ctx.cfg, String(error.message)));
    return null;
  }
  const posts = (data ?? []) as PostCompleto[];
  const vez = proximoComStories(
    posts.map((p) => ({ ...p, story_status: p.story_status ?? null, story_claimed_at: p.story_claimed_at ?? null })),
    agora,
  );
  if (!vez) return null;
  const post = posts.find((p) => p.id === vez.id)!;
  const st = await publicarStories(ctx, post, [vez.de], prazo);
  if (!st.pego) return ok({ acao: "outra_rodada", post: post.id });
  return ok({ acao: "stories", post: post.id, stories: resumoDosStories(st) });
}

export async function rodada(deps: RodadaDeps): Promise<Resultado> {
  const { admin, cfg, agora } = deps;
  const ctx: Ctx = { admin, cfg, fetcher: deps.fetcher, relogio: deps.relogio ?? (() => new Date()) };
  const prazo = ctx.relogio().getTime() + PRAZO_STORIES_MS;

  const { data: chave, error: eChave } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "social_dispatch_enabled")
    .maybeSingle();
  if (eChave) {
    console.error("social-dispatch: não li a chave de disparo", limpar(cfg, String(eChave.message)));
    return erroDeBanco("Não consegui ler a chave de disparo.");
  }
  const ligada = String(chave?.value ?? "").toLowerCase() === "true";

  const desde = new Date(agora.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const { data: ativos, error: e1 } = await admin
    .from("social_post")
    .select(CAMPOS)
    .is("deleted_at", null)
    .in("status", ["approved", "publishing"]);
  const { data: recentes, error: e2 } = await admin
    .from("social_post")
    .select(CAMPOS)
    .is("deleted_at", null)
    .eq("status", "published")
    .gte("published_at", desde);
  if (e1 || e2) {
    console.error("social-dispatch: não li a fila", limpar(cfg, String((e1 ?? e2).message)));
    return erroDeBanco("Não consegui ler a fila.");
  }
  const posts = [...(ativos ?? []), ...(recentes ?? [])] as PostCompleto[];

  // 1. Rodada que caiu no meio do caminho. Vale com a chave desligada também: o "Publicar agora"
  // publica sem a chave, então um post pode parar em `publishing` com ela desligada, e a RPC recusa
  // `publishing`. Reconciliar só consulta a Meta e grava o desfecho; nunca publica.
  const ids = parados(posts, agora);
  for (const id of ids) {
    await reconciliar(ctx, posts.find((x) => x.id === id)!);
  }
  if (ids.length) return ok({ acao: "reconciliou", posts: ids });

  // 2. Atrasados saem da fila. A escrita repete a regra do atraso (hora marcada anterior a agora
  // menos 6 h): quem reagendou o post, ainda aprovado, entre a leitura e aqui não é marcado.
  const limiteDoAtraso = new Date(agora.getTime() - ATRASO_MAXIMO_MS).toISOString();
  for (const id of atrasados(posts, agora)) {
    if (await escrever(ctx, id, "approved", { status: "overdue" }, { agendadoAntesDe: limiteDoAtraso })) {
      await registrar(ctx, id, "overdue", {
        note: "Passou mais de 6 horas da hora marcada sem publicar. Reagende para voltar à fila.",
      });
    }
  }

  // 3. Quem sai agora.
  const escolha = escolher(posts, agora);
  if (!("id" in escolha)) {
    // Nenhum feed sai agora: a vez dos stories que ficaram para trás. Só com a chave ligada, porque
    // a chave desligada segura tudo que a rodada publicaria.
    if (ligada && escolha.motivo !== "em_andamento") {
      const r = await rodadaDeStories(ctx, agora, prazo);
      if (r) return r;
    }
    return ok({ acao: escolha.motivo, ligada });
  }
  const lido = posts.find((p) => p.id === escolha.id)!;

  // 4. Chave desligada: registra o que faria, uma vez, e não toca em mais nada.
  if (!ligada) {
    const { count, error } = await admin
      .from("social_post_event")
      .select("id", { count: "exact", head: true })
      .eq("social_post_id", lido.id)
      .eq("kind", "dry_run");
    if (error) {
      // Sem saber se já existe, não grava outro: o dry_run é uma vez por post.
      console.error("social-dispatch: não contei os dry_run", limpar(cfg, String(error.message)));
    } else if (!count) {
      await registrar(ctx, lido.id, "dry_run", {
        note: "Publicaria agora. A publicação automática está desligada.",
        request: { slides: lido.slides.length, caracteres: lido.caption.length, scheduled_at: lido.scheduled_at },
      });
    }
    return ok({ acao: "dry_run", post: lido.id });
  }

  // 5. Pega o post e publica.
  return await pegarEPublicar(ctx, lido, agora, prazo);
}

/**
 * "Publicar agora" (E3.6, 21/10/2026): publica UM post, o que a pessoa clicou, fora da rodada. A
 * RPC `social_post_publish_now` já o deixou `approved` com a hora de agora. Aqui não se lê a chave
 * de disparo nem se aplica o um por dia (decisões do Kallef), e nenhum outro post é tocado. A
 * publicação é a mesma da rodada, por `pegarEPublicar`.
 */
export async function publicarAgora(deps: RodadaDeps, postId: string): Promise<Resultado> {
  const { admin, cfg, agora } = deps;
  const ctx: Ctx = { admin, cfg, fetcher: deps.fetcher, relogio: deps.relogio ?? (() => new Date()) };

  const { data: lido, error } = await admin
    .from("social_post")
    .select(CAMPOS)
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("social-dispatch: não li o post do publicar agora", limpar(cfg, String(error.message)));
    return erroDeBanco("Não consegui ler o post.");
  }
  if (!lido) return { status: 404, body: { ok: false, error: "Post não encontrado." } };

  const motivo = motivoParaNaoPublicarAgora(lido, agora);
  if (motivo) return { status: 409, body: { ok: false, post: postId, error: motivo } };

  const prazo = ctx.relogio().getTime() + PRAZO_STORIES_MS;
  // Já publicado no feed (a RPC deixou os stories `pending`): sai só o que falta dos stories.
  if (lido.status === "published") {
    const st = await publicarStories(ctx, lido as PostCompleto, ["pending"], prazo);
    if (!st.pego) return ok({ acao: "outra_rodada", post: postId });
    if (st.erro) return { status: 502, body: { ok: false, acao: "falhou", post: postId, erro: st.erro, stories: resumoDosStories(st) } };
    return ok({ acao: "stories", post: postId, stories: resumoDosStories(st) });
  }
  return await pegarEPublicar(ctx, lido as PostCompleto, agora, prazo);
}

export interface HandlerDeps {
  admin?: Admin;
  getEnv?: (k: string) => string | undefined;
  agora?: Date;
  fetcher?: typeof fetch;
}

/** O token do `Authorization: Bearer`, ou nulo. */
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization")?.trim() ?? "");
  return m ? m[1] : null;
}

/** O corpo em JSON quando é um objeto; qualquer outra coisa (vazio, texto, lista) vira nulo. */
async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo = await req.json();
    return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? corpo : null;
  } catch {
    return null;
  }
}

/** O modo forçado: confere o hub_admin pelo JWT e publica só o post pedido. */
async function modoForcado(
  admin: Admin,
  jwt: string,
  postId: unknown,
  getEnv: (k: string) => string | undefined,
  deps: HandlerDeps,
): Promise<Response> {
  const { data: usuario, error: eUsuario } = await admin.auth.getUser(jwt);
  if (eUsuario || !usuario?.user) return json({ error: "Sua sessão expirou. Entre de novo para continuar." }, 401);

  const { data: perfil, error: ePerfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", usuario.user.id)
    .maybeSingle();
  if (ePerfil) {
    console.error("social-dispatch: não li o papel de quem pediu", String(ePerfil.message));
    return json({ error: "Não consegui conferir seu acesso." }, 500);
  }
  if (perfil?.role !== "hub_admin") return json({ error: "Só a equipe da Movepark pode publicar no Instagram." }, 403);

  if (typeof postId !== "string" || !UUID.test(postId)) return json({ error: "Faltou dizer qual post publicar." }, 400);

  const cfg = igConfigFromEnv(getEnv);
  if (!cfg || !cfg.igUserId) return json({ error: "INSTAGRAM_ACCESS_TOKEN ou INSTAGRAM_USER_ID ausente" }, 503);

  try {
    const r = await publicarAgora({ admin, cfg, agora: deps.agora ?? new Date(), fetcher: deps.fetcher }, postId);
    return json(r.body, r.status);
  } catch (e) {
    console.error("social-dispatch: o publicar agora estourou", limpar(cfg, String(e)));
    return json({ ok: false, error: "A publicação parou antes de terminar." }, 500);
  }
}

export async function handler(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const getEnv = deps.getEnv ?? env;
  const admin = deps.admin ??
    createClient(getEnv("SUPABASE_URL")!, getEnv("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // "Publicar agora": JWT de usuário e o post no corpo. Sem os dois, é o cron, como sempre foi.
  const jwt = bearer(req);
  const corpo = await lerCorpo(req);
  if (jwt && corpo && "post_id" in corpo) return await modoForcado(admin, jwt, corpo.post_id, getEnv, deps);

  const { data: autorizado, error: eAuth } = await admin.rpc("cron_key_matches", {
    p_name: "social_dispatch_key",
    p_key: req.headers.get("x-social-dispatch-key") ?? "",
  });
  if (eAuth) {
    console.error("social-dispatch: não consegui conferir a chave", String(eAuth.message));
    return json({ error: "Não consegui conferir a chave." }, 500);
  }
  if (autorizado !== true) return json({ error: "unauthorized" }, 401);

  const cfg = igConfigFromEnv(getEnv);
  if (!cfg || !cfg.igUserId) return json({ error: "INSTAGRAM_ACCESS_TOKEN ou INSTAGRAM_USER_ID ausente" }, 503);

  try {
    const r = await rodada({ admin, cfg, agora: deps.agora ?? new Date(), fetcher: deps.fetcher });
    return json(r.body, r.status);
  } catch (e) {
    console.error("social-dispatch: a rodada estourou", limpar(cfg, String(e)));
    return json({ ok: false, error: "A rodada falhou antes de terminar." }, 500);
  }
}

if (import.meta.main) Deno.serve((req) => handler(req));
