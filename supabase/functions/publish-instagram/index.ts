// Edge Function: /publish-instagram
// Publica um post (imagem única ou carrossel) na conta profissional do Instagram
// da Movepark (@moveparkestacionamento), pela Content Publishing API da Meta.
//
// O fluxo da Meta é sempre de dois passos, e não existe agendamento nativo:
//   POST /{ig-user-id}/media          -> creation_id (o "container", expira em 24h)
//   POST /{ig-user-id}/media_publish  -> publica o creation_id
// No carrossel, cada slide vira um container com is_carousel_item, e um container
// pai com media_type=CAROUSEL amarra todos. Detalhe em
// .claude/skills/instagram/references/api-instagram.md
//
// POST /functions/v1/publish-instagram   (header: x-publish-instagram-key: <PUBLISH_INSTAGRAM_KEY>)
//   { "action": "diagnose" }
//     → confere token, permissões e a conta ligada. Não escreve nada.
//   { "action": "publish", "caption": "...", "images": [{url, alt}], "dryRun": true }
//     → valida tudo e diz o que faria. NÃO publica.
//   { "action": "publish", ..., "dryRun": false }
//     → publica de verdade.
//
// dryRun nasce true de propósito, mesmo padrão do marketing_dispatch_enabled:
// ferramenta de publicação que nasce ligada posta na conta real no primeiro teste.
//
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional),
//          PUBLISH_INSTAGRAM_KEY

import { autorizado, ehCarrossel, validar, type Imagem } from "./logic.ts";

const VERSAO_PADRAO = "v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Config {
  token: string;
  igUserId: string;
  versao: string;
}

function lerConfig(): Config | null {
  const token = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  if (!token) return null;
  return {
    token,
    igUserId: Deno.env.get("INSTAGRAM_USER_ID") ?? "",
    versao: Deno.env.get("INSTAGRAM_API_VERSION") ?? VERSAO_PADRAO,
  };
}

/**
 * Descobre o id da conta do Instagram a partir das Páginas do token.
 * Poupa um passo manual: com o token em mãos, o INSTAGRAM_USER_ID sai daqui.
 */
async function descobrirConta(cfg: Config) {
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

async function graph(
  cfg: Config,
  caminho: string,
  metodo: "GET" | "POST",
  campos: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const url = new URL(`https://graph.facebook.com/${cfg.versao}/${caminho}`);
  const params = new URLSearchParams({ ...campos, access_token: cfg.token });
  const init: RequestInit = { method: metodo };
  if (metodo === "GET") url.search = params.toString();
  else {
    init.body = params;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

/** O container do carrossel demora para ficar pronto; publicar antes falha. */
async function esperarContainer(cfg: Config, id: string, tentativas = 12) {
  for (let i = 0; i < tentativas; i++) {
    const r = await graph(cfg, id, "GET", { fields: "status_code,status" });
    const status = String(r.body.status_code ?? "");
    if (status === "FINISHED") return { pronto: true, status };
    if (status === "ERROR" || status === "EXPIRED") {
      return { pronto: false, status, detalhe: r.body.status };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { pronto: false, status: "TIMEOUT" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!autorizado(Deno.env.get("PUBLISH_INSTAGRAM_KEY"), req.headers.get("x-publish-instagram-key"))) {
    return json({ error: "unauthorized" }, 401);
  }

  const cfg = lerConfig();
  if (!cfg) {
    return json({
      error: "falta o token",
      detalhe: "defina INSTAGRAM_ACCESS_TOKEN nos secrets do projeto. O INSTAGRAM_USER_ID a " +
        "própria função descobre: rode com action diagnose.",
    }, 503);
  }

  const corpo = await req.json().catch(() => ({}));
  const action = corpo.action ?? "diagnose";

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

  // Publicar NUNCA usa conta descoberta: o id tem que estar configurado, senão
  // um token com duas Páginas postaria na errada sem ninguém escolher.
  if (!cfg.igUserId) {
    return json({
      error: "INSTAGRAM_USER_ID não configurado",
      detalhe: "rode action diagnose, pegue o instagram_user_id da conta certa e grave no secret",
    }, 503);
  }

  // ---- publish --------------------------------------------------------------
  const caption: string = corpo.caption ?? "";
  const images: Imagem[] = Array.isArray(corpo.images) ? corpo.images : [];
  const dryRun = corpo.dryRun !== false; // nasce travado

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

  const carrossel = ehCarrossel(images);
  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      publicaria: {
        tipo: carrossel ? "carrossel" : "post único",
        slides: images.length,
        caracteres: caption.length,
        hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
        conta: cfg.igUserId,
      },
      aviso: "nada foi publicado. Repita com dryRun: false para publicar de verdade.",
    });
  }

  const containers: string[] = [];

  if (carrossel) {
    for (const [i, img] of images.entries()) {
      const r = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
        image_url: img.url,
        is_carousel_item: "true",
        ...(img.alt ? { alt_text: img.alt } : {}),
      });
      if (!r.ok || !r.body.id) {
        return json({ ok: false, etapa: `container do slide ${i + 1}`, resposta: r.body }, 502);
      }
      containers.push(String(r.body.id));
    }
    const pai = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
      media_type: "CAROUSEL",
      children: containers.join(","),
      caption,
    });
    if (!pai.ok || !pai.body.id) {
      return json({ ok: false, etapa: "container do carrossel", resposta: pai.body, containers }, 502);
    }
    const espera = await esperarContainer(cfg, String(pai.body.id));
    if (!espera.pronto) {
      return json({ ok: false, etapa: "container não ficou pronto", ...espera }, 502);
    }
    const pub = await graph(cfg, `${cfg.igUserId}/media_publish`, "POST", {
      creation_id: String(pai.body.id),
    });
    if (!pub.ok) return json({ ok: false, etapa: "media_publish", resposta: pub.body }, 502);
    return json({ ok: true, tipo: "carrossel", slides: images.length, media_id: pub.body.id });
  }

  const unico = images[0];
  const c = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
    image_url: unico.url,
    caption,
    ...(unico.alt ? { alt_text: unico.alt } : {}),
  });
  if (!c.ok || !c.body.id) return json({ ok: false, etapa: "container", resposta: c.body }, 502);
  const espera = await esperarContainer(cfg, String(c.body.id));
  if (!espera.pronto) return json({ ok: false, etapa: "container não ficou pronto", ...espera }, 502);
  const pub = await graph(cfg, `${cfg.igUserId}/media_publish`, "POST", {
    creation_id: String(c.body.id),
  });
  if (!pub.ok) return json({ ok: false, etapa: "media_publish", resposta: pub.body }, 502);
  return json({ ok: true, tipo: "post único", media_id: pub.body.id });
});
