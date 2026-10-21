// Edge Function: /publish-instagram
// Diagnóstico do token e ensaio de publicação (dry run) da conta profissional do Instagram da
// Movepark (@moveparkestacionamento). Esta função NÃO publica: a publicação real sai só pela fila
// (`/manager/social`), pela Edge `social-dispatch`, que exige aprovação humana, um post por dia,
// a conferência de marca e grava o rastro. Ambas usam o mesmo cliente da Graph API
// (`_shared/instagram.ts`). Detalhe em .claude/skills/instagram/references/api-instagram.md.
//
// POST /functions/v1/publish-instagram   (header: x-publish-instagram-key: <PUBLISH_INSTAGRAM_KEY>)
//   { "action": "diagnose" }
//     → confere token, permissões e a conta ligada. Não escreve nada.
//   { "action": "publish", "caption": "...", "images": [{url, alt}] }          (dryRun é true)
//     → valida tudo e diz o que faria. NÃO publica.
//   { "action": "publish", ..., "dryRun": false }
//     → 403 `{ ok: false, erros: ["Publicação real só pela fila (/manager/social)."] }`, antes de
//       qualquer chamada à Meta. Esta rota nunca foi o caminho da publicação: ela não passa pela
//       aprovação, pelo limite de um por dia, pela conferência da marca nem pelo rastro.
//
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional),
//          PUBLISH_INSTAGRAM_KEY

import { autorizado, ehCarrossel, validar, type Imagem } from "./logic.ts";
import { graph, type IgConfig, igConfigFromEnv } from "../_shared/instagram.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const env = (k: string): string | undefined => Deno.env.get(k);

export const PUBLICACAO_SO_PELA_FILA = "Publicação real só pela fila (/manager/social).";

/**
 * Descobre o id da conta do Instagram a partir das Páginas do token.
 * Poupa um passo manual: com o token em mãos, o INSTAGRAM_USER_ID sai daqui.
 */
async function descobrirConta(cfg: IgConfig) {
  const r = await graph(cfg, "me/accounts", "GET", {
    fields: "id,name,instagram_business_account{id,username}",
  });
  const paginas = Array.isArray(r.body.data) ? (r.body.data as Array<Record<string, any>>) : [];
  const comIg = paginas
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      pagina: p.name,
      page_id: p.id,
      instagram_user_id: p.instagram_business_account.id,
      username: p.instagram_business_account.username,
    }));
  return { ok: r.ok, paginas: paginas.length, contas: comIg, resposta: r.ok ? undefined : r.body };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!autorizado(env("PUBLISH_INSTAGRAM_KEY"), req.headers.get("x-publish-instagram-key"))) {
    return json({ error: "unauthorized" }, 401);
  }

  const lido = await req.json().catch(() => null);
  const corpo = (lido && typeof lido === "object" ? lido : {}) as Record<string, any>;
  const action = corpo.action ?? "diagnose";

  // Publicar de verdade não é desta rota. A recusa vem antes de ler o token e de qualquer chamada
  // à Meta ou ao servidor das imagens: nada sai daqui por engano, nem com a chave certa.
  if (action === "publish" && corpo.dryRun === false) {
    return json({ ok: false, erros: [PUBLICACAO_SO_PELA_FILA] }, 403);
  }

  const cfg = igConfigFromEnv(env);
  if (!cfg) {
    return json({
      error: "falta o token",
      detalhe: "defina INSTAGRAM_ACCESS_TOKEN nos secrets do projeto. O INSTAGRAM_USER_ID a " +
        "própria função descobre: rode com action diagnose.",
    }, 503);
  }

  // ---- diagnose: confere o token antes de qualquer escrita ------------------
  if (action === "diagnose") {
    const permissoes = await graph(cfg, "me/permissions", "GET");
    const descoberta = await descobrirConta(cfg);

    // Sem o id configurado, usa o primeiro descoberto para já dizer se dá certo.
    const idParaChecar = cfg.igUserId || descoberta.contas[0]?.instagram_user_id;
    if (!idParaChecar) {
      const concedidasSemConta = Array.isArray(permissoes.body.data)
        ? (permissoes.body.data as Array<Record<string, string>>)
            .filter((p) => p.status === "granted").map((p) => p.permission)
        : [];
      return json({
        ok: false,
        motivo: "o token não enxerga nenhuma Página com conta do Instagram ligada",
        permissoes_concedidas: concedidasSemConta,
        paginas_vistas: descoberta.paginas,
        dica: "confirme que a conta é profissional, que está ligada a uma Página, e que o token " +
          "tem pages_show_list além das permissões de Instagram",
        resposta_da_meta: descoberta.resposta,
      }, 400);
    }

    const conta = await graph(cfg, idParaChecar, "GET", {
      fields: "id,username,name,followers_count,media_count",
    });
    const concedidas = Array.isArray(permissoes.body.data)
      ? (permissoes.body.data as Array<Record<string, string>>)
          .filter((p) => p.status === "granted")
          .map((p) => p.permission)
      : [];
    const precisa = ["instagram_basic", "instagram_content_publish"];
    const alternativa = ["instagram_business_basic", "instagram_business_content_publish"];
    const temPublicacao =
      concedidas.includes("instagram_content_publish") ||
      concedidas.includes("instagram_business_content_publish");
    return json({
      ok: conta.ok && temPublicacao,
      conta: conta.ok ? conta.body : { erro: conta.body },
      contas_encontradas: descoberta.contas,
      instagram_user_id_em_uso: idParaChecar,
      instagram_user_id_configurado: cfg.igUserId || null,
      permissoes_concedidas: concedidas,
      pode_publicar: temPublicacao,
      falta: temPublicacao ? [] : [precisa[1], `ou ${alternativa[1]}`],
    }, conta.ok ? 200 : 400);
  }

  if (action !== "publish") return json({ error: `action desconhecida: ${action}` }, 400);

  // O ensaio também exige o id configurado, para o resumo mostrar a conta que a fila usaria.
  if (!cfg.igUserId) {
    return json({
      error: "INSTAGRAM_USER_ID não configurado",
      detalhe: "rode action diagnose, pegue o instagram_user_id da conta certa e grave no secret",
    }, 503);
  }

  // ---- publish (só ensaio) --------------------------------------------------
  const caption: string = corpo.caption ?? "";
  const images: Imagem[] = Array.isArray(corpo.images) ? corpo.images : [];

  const erros = validar({ caption, images });
  if (erros.length) return json({ ok: false, erros }, 422);

  // As URLs precisam responder para a Meta, que busca do servidor dela.
  const inacessiveis: string[] = [];
  for (const img of images) {
    const r = await fetch(img.url, { method: "HEAD" }).catch(() => null);
    if (!r || !r.ok) inacessiveis.push(img.url);
    else if (!/image\/jpeg/i.test(r.headers.get("content-type") ?? "")) {
      inacessiveis.push(`${img.url} (content-type ${r.headers.get("content-type")})`);
    }
  }
  if (inacessiveis.length) {
    return json({ ok: false, erros: ["imagem não acessível ou não é JPEG"], inacessiveis }, 422);
  }

  return json({
    ok: true,
    dryRun: true,
    publicaria: {
      tipo: ehCarrossel(images) ? "carrossel" : "post único",
      slides: images.length,
      caracteres: caption.length,
      hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
      conta: cfg.igUserId,
    },
    aviso: "Nada foi publicado. A publicação real só sai pela fila, em /manager/social.",
  });
}

if (import.meta.main) Deno.serve(handler);
