// Cliente mínimo da Graph API para publicar no Instagram da Movepark (E3.6).
//
// Usado pela `publish-instagram` (diagnóstico e publicação manual) e pela `social-dispatch`
// (publicação agendada). O fluxo da Meta é sempre de dois passos: container e media_publish. No
// carrossel, cada slide vira um container com is_carousel_item, e um pai com media_type=CAROUSEL
// amarra todos. Detalhe em .claude/skills/instagram/references/api-instagram.md.
//
// Toda chamada passa por `onCall` com o caminho, o método e os campos SEM o token, para quem
// chama gravar o rastro. O token nunca sai deste arquivo.

export const VERSAO_PADRAO = "v21.0";

export interface IgConfig {
  token: string;
  igUserId: string;
  versao: string;
}

export interface GraphResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

export type GraphKind =
  | "container_child"
  | "container_parent"
  | "container_status"
  | "media_publish"
  | "permalink"
  | "consulta";

export interface GraphCall {
  kind: GraphKind;
  metodo: "GET" | "POST";
  caminho: string;
  campos: Record<string, string>;
  result: GraphResult;
}

export interface Opcoes {
  fetcher?: typeof fetch;
  onCall?: (c: GraphCall) => void | Promise<void>;
  esperaMs?: number;
  tentativas?: number;
}

export function igConfigFromEnv(get: (k: string) => string | undefined): IgConfig | null {
  const token = get("INSTAGRAM_ACCESS_TOKEN");
  if (!token) return null;
  return {
    token,
    igUserId: get("INSTAGRAM_USER_ID") ?? "",
    versao: get("INSTAGRAM_API_VERSION") ?? VERSAO_PADRAO,
  };
}

export async function graph(
  cfg: IgConfig,
  caminho: string,
  metodo: "GET" | "POST",
  campos: Record<string, string> = {},
  opts: Opcoes = {},
  kind: GraphKind = "consulta",
): Promise<GraphResult> {
  const f = opts.fetcher ?? fetch;
  const url = new URL(`https://graph.facebook.com/${cfg.versao}/${caminho}`);
  const params = new URLSearchParams({ ...campos, access_token: cfg.token });
  const init: RequestInit = { method: metodo };
  if (metodo === "GET") url.search = params.toString();
  else {
    init.body = params;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  let result: GraphResult;
  try {
    const r = await f(url.toString(), init);
    const body = await r.json().catch(() => ({}));
    result = { ok: r.ok, status: r.status, body: body as Record<string, unknown> };
  } catch (e) {
    result = { ok: false, status: 0, body: { erro: String(e) } };
  }
  await opts.onCall?.({ kind, metodo, caminho, campos, result });
  return result;
}

/** O container do carrossel demora para ficar pronto; publicar antes falha. */
export async function esperarContainer(
  cfg: IgConfig,
  id: string,
  opts: Opcoes = {},
): Promise<{ pronto: boolean; status: string; detalhe?: unknown }> {
  const tentativas = opts.tentativas ?? 12;
  const espera = opts.esperaMs ?? 2500;
  for (let i = 0; i < tentativas; i++) {
    const r = await graph(cfg, id, "GET", { fields: "status_code,status" }, opts, "container_status");
    const status = String(r.body.status_code ?? "");
    if (status === "FINISHED") return { pronto: true, status };
    if (status === "ERROR" || status === "EXPIRED") return { pronto: false, status, detalhe: r.body.status };
    if (i < tentativas - 1) await new Promise((res) => setTimeout(res, espera));
  }
  return { pronto: false, status: "TIMEOUT" };
}

export async function statusDoContainer(cfg: IgConfig, id: string, opts: Opcoes = {}): Promise<string> {
  const r = await graph(cfg, id, "GET", { fields: "status_code" }, opts, "container_status");
  return String(r.body.status_code ?? "");
}

export interface Imagem {
  url: string;
  alt?: string | null;
}

export type ResultadoPublicacao =
  | { ok: true; mediaId: string; containerId: string }
  | { ok: false; etapa: string; resposta: unknown; containerId?: string };

export async function publicar(
  cfg: IgConfig,
  entrada: { caption: string; images: Imagem[] },
  opts: Opcoes & { onContainer?: (id: string) => void | Promise<void> } = {},
): Promise<ResultadoPublicacao> {
  const { caption, images } = entrada;
  let containerId: string;

  if (images.length > 1) {
    const filhos: string[] = [];
    for (const [i, img] of images.entries()) {
      const r = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
        image_url: img.url,
        is_carousel_item: "true",
        ...(img.alt ? { alt_text: img.alt } : {}),
      }, opts, "container_child");
      if (!r.ok || !r.body.id) return { ok: false, etapa: `container do slide ${i + 1}`, resposta: r.body };
      filhos.push(String(r.body.id));
    }
    const pai = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
      media_type: "CAROUSEL",
      children: filhos.join(","),
      caption,
    }, opts, "container_parent");
    if (!pai.ok || !pai.body.id) return { ok: false, etapa: "container do carrossel", resposta: pai.body };
    containerId = String(pai.body.id);
  } else {
    const img = images[0];
    const c = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
      image_url: img.url,
      caption,
      ...(img.alt ? { alt_text: img.alt } : {}),
    }, opts, "container_parent");
    if (!c.ok || !c.body.id) return { ok: false, etapa: "container", resposta: c.body };
    containerId = String(c.body.id);
  }

  await opts.onContainer?.(containerId);

  const espera = await esperarContainer(cfg, containerId, opts);
  if (!espera.pronto) return { ok: false, etapa: "container não ficou pronto", resposta: espera, containerId };

  const pub = await graph(cfg, `${cfg.igUserId}/media_publish`, "POST", { creation_id: containerId }, opts, "media_publish");
  if (!pub.ok || !pub.body.id) return { ok: false, etapa: "media_publish", resposta: pub.body, containerId };
  return { ok: true, mediaId: String(pub.body.id), containerId };
}

export async function lerPermalink(cfg: IgConfig, mediaId: string, opts: Opcoes = {}): Promise<string | null> {
  const r = await graph(cfg, mediaId, "GET", { fields: "permalink" }, opts, "permalink");
  return typeof r.body.permalink === "string" ? r.body.permalink : null;
}

/** Procura, nos últimos posts da conta, a mídia com esta legenda. Usado para não publicar duas vezes. */
export async function acharMidiaPorLegenda(
  cfg: IgConfig,
  caption: string,
  opts: Opcoes = {},
): Promise<{ id: string; permalink: string | null } | null> {
  const r = await graph(cfg, `${cfg.igUserId}/media`, "GET", { fields: "id,caption,permalink,timestamp", limit: "10" }, opts, "consulta");
  const lista = Array.isArray(r.body.data) ? (r.body.data as Array<Record<string, unknown>>) : [];
  const alvo = caption.trim();
  const achada = lista.find((m) => String(m.caption ?? "").trim() === alvo);
  if (!achada) return null;
  return { id: String(achada.id), permalink: typeof achada.permalink === "string" ? achada.permalink : null };
}
