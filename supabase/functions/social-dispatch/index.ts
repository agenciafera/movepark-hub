// Edge Function: /social-dispatch
// Publicação agendada da fila do Instagram (E3.6). Chamada pelo pg_cron a cada 15 minutos.
// É o ÚNICO código que publica na conta real: o resto da fila só prepara, aprova e mostra.
//
// Uma rodada:
//   1. com a chave ligada, reconcilia post parado em `publishing` (rodada que caiu no meio);
//   2. marca `overdue` todo aprovado com mais de 6 h de atraso (com a chave ligada ou não: ligar
//      depois não despeja a fila acumulada);
//   3. escolhe UM aprovado cuja hora chegou, um por dia no fuso de São Paulo;
//   4. chave desligada (`app_setting.social_dispatch_enabled` diferente de 'true'): só grava o
//      evento `dry_run`, uma vez por post, e não muda o estado nem fala com a Meta;
//   5. chave ligada: pega o post com update condicional (status = 'approved'), consulta o container
//      antigo antes de criar outro e publica. O mesmo post nunca sai duas vezes.
//
// Regras que seguram o "nunca duas vezes":
//   - o container pai é gravado ANTES do media_publish; se a gravação falhar, nada é publicado;
//   - toda escrita depois da pega é condicionada ao estado em que a rodada deixou o post
//     (`publishing`), então uma mudança concorrente não é pisada;
//   - nova tentativa com `ig_container_id` consulta a Meta antes: container PUBLISHED é
//     reconciliado pela legenda e nunca publicado de novo;
//   - falha ao gravar o rastro é logada e nunca derruba a rodada.
//
// Toda chamada à Graph API vira linha em `social_post_event`, sem o token.
//
// POST /functions/v1/social-dispatch  (header x-social-dispatch-key, conferido no Vault por
// cron_key_matches: o valor não passa por terminal nem por secret de Edge)
// → 200 { ok, acao, post?, permalink?, posts?, ligada? }
//   acao: nada | ja_publicou_hoje | em_andamento | reconciliou | dry_run | outra_rodada |
//         reconciliado | publicado
// → 502 { ok: false, acao: "falhou", post, erro }  (a Meta recusou ou a reconciliação falhou)
// → 500 { ok: false, error }  (banco), 503 (sem secrets da Meta), 401 (chave), 405
//   Caso raro: `ok: false` com `acao: "publicado"` e 500 quer dizer que a Meta publicou e a rodada
//   não conseguiu gravar o estado; o `erro` diz o que conferir.
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional).
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  acharMidiaPorLegenda,
  type GraphCall,
  type IgConfig,
  igConfigFromEnv,
  lerPermalink,
  type Opcoes,
  publicar,
  statusDoContainer,
} from "../_shared/instagram.ts";
import { atrasados, escolher, jaPublicado, parados, type PostFila, resumoDoErro } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const env = (k: string): string | undefined => Deno.env.get(k);

// deno-lint-ignore no-explicit-any
export type Admin = any;

type PostCompleto = PostFila & {
  caption: string;
  slides: Array<{ url: string; alt: string | null }>;
  ig_container_id: string | null;
  attempts: number;
};

export interface RodadaDeps {
  admin: Admin;
  cfg: IgConfig;
  /** O instante da rodada. Nos testes é fixo; na Edge é `new Date()`. */
  agora: Date;
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
 */
async function escrever(ctx: Ctx, id: string, de: string, campos: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await ctx.admin.from("social_post").update(campos).eq("id", id).eq("status", de).select("id");
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

async function marcarFalha(ctx: Ctx, id: string, msg: string): Promise<void> {
  if (await escrever(ctx, id, "publishing", { status: "failed", last_error: msg })) {
    await registrar(ctx, id, "failed", { note: msg });
  }
}

/** O post saiu na Meta. Marca `published`; o evento de quem chama só vale se a escrita valeu. */
const marcarPublicado = (ctx: Ctx, id: string, mediaId: string, permalink: string | null) =>
  escrever(ctx, id, "publishing", {
    status: "published",
    ig_media_id: mediaId,
    ig_permalink: permalink,
    published_at: new Date().toISOString(),
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
    return await falha("A rodada caiu antes de criar o envio na Meta. Reagende para tentar de novo.");
  }
  const st = statusConhecido ?? (await statusDoContainer(ctx.cfg, p.ig_container_id, opcoes(ctx, p.id)));
  if (!jaPublicado(st)) {
    return await falha(`A rodada caiu com o envio na Meta em ${st || "estado desconhecido"}. Reagende para tentar de novo.`);
  }
  const midia = await acharMidiaPorLegenda(ctx.cfg, p.caption, opcoes(ctx, p.id));
  if (!midia) {
    return await falha(
      "O envio aparece como publicado na Meta, mas o post não foi achado no perfil. Confira no Instagram antes de reagendar.",
    );
  }
  if (!(await marcarPublicado(ctx, p.id, midia.id, midia.permalink))) {
    return { ok: false, erro: "O post mudou de estado durante a reconciliação e ficou como está." };
  }
  await registrar(ctx, p.id, "reconciled", {
    note: "o envio já estava publicado; nada foi publicado de novo",
    response: midia,
  });
  return { ok: true };
}

/** Falha que acontece antes do media_publish, com a certeza de que nada saiu no Instagram. */
class NadaPublicado extends Error {}

export async function rodada(deps: RodadaDeps): Promise<Resultado> {
  const { admin, cfg, agora } = deps;
  const ctx: Ctx = { admin, cfg, fetcher: deps.fetcher };

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
  const campos = "id, status, scheduled_at, published_at, updated_at, caption, slides, ig_container_id, attempts";
  const { data: ativos, error: e1 } = await admin
    .from("social_post")
    .select(campos)
    .is("deleted_at", null)
    .in("status", ["approved", "publishing"]);
  const { data: recentes, error: e2 } = await admin
    .from("social_post")
    .select(campos)
    .is("deleted_at", null)
    .eq("status", "published")
    .gte("published_at", desde);
  if (e1 || e2) {
    console.error("social-dispatch: não li a fila", limpar(cfg, String((e1 ?? e2).message)));
    return erroDeBanco("Não consegui ler a fila.");
  }
  const posts = [...(ativos ?? []), ...(recentes ?? [])] as PostCompleto[];

  // 1. Rodada que caiu no meio do caminho.
  if (ligada) {
    const ids = parados(posts, agora);
    for (const id of ids) {
      await reconciliar(ctx, posts.find((x) => x.id === id)!);
    }
    if (ids.length) return ok({ acao: "reconciliou", posts: ids });
  }

  // 2. Atrasados saem da fila.
  for (const id of atrasados(posts, agora)) {
    if (await escrever(ctx, id, "approved", { status: "overdue" })) {
      await registrar(ctx, id, "overdue", {
        note: "Passou mais de 6 horas da hora marcada sem publicar. Reagende para voltar à fila.",
      });
    }
  }

  // 3. Quem sai agora.
  const escolha = escolher(posts, agora);
  if (!("id" in escolha)) return ok({ acao: escolha.motivo, ligada });
  const post = posts.find((p) => p.id === escolha.id)!;

  // 4. Chave desligada: registra o que faria, uma vez, e não toca em mais nada.
  if (!ligada) {
    const { count, error } = await admin
      .from("social_post_event")
      .select("id", { count: "exact", head: true })
      .eq("social_post_id", post.id)
      .eq("kind", "dry_run");
    if (error) {
      // Sem saber se já existe, não grava outro: o dry_run é uma vez por post.
      console.error("social-dispatch: não contei os dry_run", limpar(cfg, String(error.message)));
    } else if (!count) {
      await registrar(ctx, post.id, "dry_run", {
        note: "Publicaria agora. A publicação automática está desligada.",
        request: { slides: post.slides.length, caracteres: post.caption.length, scheduled_at: post.scheduled_at },
      });
    }
    return ok({ acao: "dry_run", post: post.id });
  }

  // 5. Pega o post. Se outra rodada pegou antes, a linha não volta.
  const { data: pego, error: ePega } = await admin
    .from("social_post")
    .update({ status: "publishing", attempts: post.attempts + 1 })
    .eq("id", post.id)
    .eq("status", "approved")
    .is("deleted_at", null)
    .select("id");
  if (ePega) {
    console.error("social-dispatch: a pega do post falhou", limpar(cfg, String(ePega.message)));
    return erroDeBanco("Não consegui pegar o post para publicar.");
  }
  if (!pego?.length) return ok({ acao: "outra_rodada", post: post.id });

  if (post.ig_container_id) {
    const st = await statusDoContainer(cfg, post.ig_container_id, opcoes(ctx, post.id));
    if (jaPublicado(st)) {
      const r = await reconciliar(ctx, post, st);
      return r.ok ? ok({ acao: "reconciliado", post: post.id }) : falhou(post.id, r.erro);
    }
  }

  let res;
  try {
    res = await publicar(
      cfg,
      { caption: post.caption, images: post.slides.map((s) => ({ url: s.url, alt: s.alt })) },
      {
        ...opcoes(ctx, post.id),
        // Sem o container gravado, a nova tentativa não teria como saber que ele existe e
        // publicaria de novo. Então, se a gravação falha, a rodada para ANTES do media_publish.
        onContainer: async (id) => {
          if (!(await escrever(ctx, post.id, "publishing", { ig_container_id: id }))) {
            throw new NadaPublicado("não consegui gravar o envio criado na Meta");
          }
        },
      },
    );
  } catch (e) {
    const msg = e instanceof NadaPublicado
      ? `Nada foi publicado: ${e.message}. Reagende para tentar de novo.`
      : `A rodada parou por um erro inesperado (${limpar(cfg, String(e)).slice(0, 200)}). Confira no Instagram antes de reagendar.`;
    await marcarFalha(ctx, post.id, msg);
    return falhou(post.id, msg);
  }
  if (!res.ok) {
    const msg = resumoDoErro(res.etapa, res.resposta);
    await marcarFalha(ctx, post.id, msg);
    return falhou(post.id, msg);
  }

  const permalink = await lerPermalink(cfg, res.mediaId, opcoes(ctx, post.id));
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
        erro: "A Meta publicou, mas não consegui gravar o estado do post. Confira o post na fila antes de reagendar.",
      },
    };
  }
  return ok({ acao: "publicado", post: post.id, permalink });
}

export interface HandlerDeps {
  admin?: Admin;
  getEnv?: (k: string) => string | undefined;
  agora?: Date;
  fetcher?: typeof fetch;
}

export async function handler(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const getEnv = deps.getEnv ?? env;
  const admin = deps.admin ??
    createClient(getEnv("SUPABASE_URL")!, getEnv("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

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
