// Edge Function: /social-draft
// Entrada da fila de publicação do Instagram (E3.6).
//
// POST multipart  (header x-social-draft-key: <SOCIAL_DRAFT_KEY>)
//   campo "post": JSON do front matter da skill + "caption"; um arquivo por slide, com o nome do
//   "arquivo" do front matter. "placements" diz onde o post sai (feed, story ou os dois; sem o
//   campo, os dois) e "stories" lista as imagens 9:16, uma por story, anexadas do mesmo jeito.
//   → 200 { ok, id, status, validation, aviso? } | 401 | 409 (rascunho que saiu de pending_review) | 422 { erros }
//   Reenviar vale em `pending_review` e também em `rejected` sem `ig_container_id` (a Meta nunca
//   recebeu nada): é o "recusar e mandar de novo" da skill. A linha volta para `pending_review`.
//   Problema de arquivo ou de formato devolve 422 e não grava nada. Problema de texto fica em
//   `validation` e trava a aprovação, para a tela mostrar o motivo. O JPEG sobe para
//   social/<origem>/<corte>/<hash do conteúdo>/<arquivo>, sem sobrescrever (upsert false): bytes
//   diferentes caem em outro caminho, então a imagem de um post aprovado nunca muda.
//   O status é conferido na própria escrita (update condicionado ao status lido, e ao container nulo
//   no caso de recusado, ou insert com unique), nunca só numa leitura antes: duas chamadas ao mesmo
//   tempo não pisam no aprovado.
//
// POST JSON { action: "update_caption", id, caption, expected_updated_at }  (Authorization: Bearer <JWT hub_admin>)
//   → 200 { ok, validation, aviso? } | 401 | 403 | 404 | 409 | 422
//   Corrigir a legenda devolve o post para "pending_review": o texto aprovado deixou de existir.
//   `expected_updated_at` é o `updated_at` do post que a pessoa abriu (obrigatório, 422 sem ele):
//   o update só vale se a linha ainda estiver nessa versão, senão 409. Assim a correção nunca
//   pisa numa legenda que outra pessoa mudou depois.
//   `aviso` aparece quando o post foi salvo mas o evento do rastro não foi gravado.
//
// Reel (10/11/2026): `tipo: "reel"` no post, a capa como slide único (JPEG 9:16) e `video` com o
//   que o ffprobe mediu ({ arquivo, hash, bytes, duracao_s, largura, altura, fps, codec, audio }).
//   O MP4 não passa por aqui: ele sobe antes, direto para o bucket `social-video`, pela URL
//   assinada do pedido abaixo. Na hora do rascunho, a Edge confere que o objeto está no bucket com
//   o tamanho declarado; senão, 422. Reel sai só no feed.
//
// POST JSON { action: "video_upload_url", origem, corte, arquivo, hash, bytes }  (header x-social-draft-key)
//   → 200 { ok, path, signed_url?, token?, ja_existe } | 401 | 422 { erros }
//   O caminho é social/<origem>/<corte>/<hash>/<arquivo>.mp4, com upsert desligado: o mesmo hash é
//   o mesmo arquivo, e aí `ja_existe` vem true e não há URL (o script pula o envio).
//
// verify_jwt = false: o script da skill não tem JWT, e a chave basta para criar rascunho, que não
// publica nem aprova nada. A correção de legenda confere hub_admin aqui dentro.
// A chave vale se bater com o secret SOCIAL_DRAFT_KEY ou com `social_draft_key` no Vault (conferida
// por cron_key_matches, como a do disparo): a do Vault dá para criar e trocar pelo banco, sem CLI.
// Ver docs/specs/instagram-fila-de-publicacao.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conferirImagem, conferirStory, conferirTexto, conferirVideo, LIMITES_REEL, lerJpeg } from "../_shared/instagram-validate.ts";
import {
  BUCKET_VIDEO,
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  ehUuid,
  erroDoArquivoDeVideo,
  lerRascunho,
  motivoDoReenvioRecusado,
  objetoJaExiste,
  podeCorrigirLegenda,
  podeReenviar,
  rotuloStatus,
  TEXTO_VERSAO_VELHA,
  urlPublica,
  versaoValida,
} from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-draft-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const env = (k: string): string | undefined => Deno.env.get(k);

/** Os 8 primeiros bytes do SHA-256 em hex: o endereço do conteúdo no caminho do bucket. */
async function hashDe(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
export type Admin = any;

const AVISO_RASTRO = "o rastro não foi gravado";

/** Grava o evento do rastro. Falhar aqui não desfaz o post, mas também não passa em silêncio. */
async function registrar(admin: Admin, evento: Record<string, unknown>): Promise<boolean> {
  const { error } = await admin.from("social_post_event").insert(evento);
  if (!error) return true;
  console.error("social-draft: evento do rastro não gravado", {
    kind: evento.kind,
    social_post_id: evento.social_post_id,
    code: error.code,
    message: error.message,
  });
  return false;
}

/** A chave do script: o secret da Edge ou o segredo `social_draft_key` do Vault. */
async function chaveValida(admin: Admin, req: Request): Promise<boolean> {
  const recebida = req.headers.get("x-social-draft-key");
  if (chaveConfere(env("SOCIAL_DRAFT_KEY"), recebida)) return true;
  if (!recebida) return false;
  const { data, error } = await admin.rpc("cron_key_matches", { p_name: "social_draft_key", p_key: recebida });
  if (error) {
    console.error("social-draft: não consegui conferir a chave no Vault", error.message);
    return false;
  }
  return data === true;
}

/** O objeto do vídeo no bucket, com o tamanho, ou nulo se ele não está lá. */
async function videoNoBucket(admin: Admin, caminho: string): Promise<{ bytes: number } | null> {
  const corte = caminho.lastIndexOf("/");
  const nome = caminho.slice(corte + 1);
  const { data, error } = await admin.storage.from(BUCKET_VIDEO).list(caminho.slice(0, corte), { search: nome });
  if (error) throw new Error(error.message);
  const obj = (data ?? []).find((o: { name: string }) => o.name === nome);
  return obj ? { bytes: Number(obj.metadata?.size ?? 0) } : null;
}

/** A URL assinada para o script subir o MP4 do reel direto para o bucket. */
export async function urlDeEnvioDoVideo(req: Request, admin: Admin): Promise<Response> {
  if (!(await chaveValida(admin, req))) return json({ error: "unauthorized" }, 401);
  const lido = await req.json().catch(() => null);
  const m = (lido && typeof lido === "object" ? lido : {}) as Record<string, unknown>;
  if (m.action !== "video_upload_url") return json({ error: `Ação desconhecida: ${String(m.action)}.` }, 400);

  const erros: string[] = [];
  const origem = typeof m.origem === "string" ? m.origem.trim() : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(origem)) erros.push("A origem é obrigatória e vai em kebab-case, sem acento.");
  const corte = m.corte === undefined || m.corte === null || m.corte === "" ? null : Number(m.corte);
  if (corte !== null && (!Number.isInteger(corte) || corte < 1 || corte > 4)) erros.push("O corte vai de 1 a 4.");
  const erroDoArquivo = erroDoArquivoDeVideo(m.arquivo, m.hash);
  if (erroDoArquivo) erros.push(erroDoArquivo);
  const bytes = Number(m.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0) erros.push("Diga o tamanho do vídeo em bytes.");
  else if (bytes > LIMITES_REEL.bytes) erros.push(`O vídeo tem ${(bytes / 1048576).toFixed(0)} MB. O limite é 300 MB.`);
  if (erros.length) return json({ ok: false, erros }, 422);

  const caminho = caminhoNoBucket(origem, corte, String(m.hash), String(m.arquivo));
  try {
    const existente = await videoNoBucket(admin, caminho);
    if (existente) {
      if (existente.bytes !== bytes) {
        return json({ ok: false, erros: ["Já existe um vídeo com esse hash e outro tamanho. Confira o arquivo."] }, 422);
      }
      return json({ ok: true, path: caminho, ja_existe: true });
    }
  } catch (e) {
    return json({ error: `Não consegui consultar o bucket: ${String(e)}` }, 500);
  }
  const { data, error } = await admin.storage.from(BUCKET_VIDEO).createSignedUploadUrl(caminho);
  if (error || !data) return json({ error: `Não consegui gerar a URL de envio: ${error?.message ?? "sem resposta"}` }, 500);
  return json({ ok: true, path: caminho, signed_url: data.signedUrl, token: data.token, ja_existe: false });
}

export async function submeter(req: Request, admin: Admin, supabaseUrl: string): Promise<Response> {
  if (!(await chaveValida(admin, req))) return json({ error: "unauthorized" }, 401);
  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, erros: ["O envio não é um multipart válido."] }, 422);

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(form.get("post") ?? ""));
  } catch {
    return json({ ok: false, erros: ["O campo post não é um JSON válido."] }, 422);
  }
  const lido = lerRascunho(bruto);
  if (!lido.ok) return json({ ok: false, erros: lido.erros }, 422);
  const r = lido.rascunho;

  const arquivos: { nome: string; bytes: Uint8Array }[] = [];
  const erros: string[] = [];
  for (const s of r.slides) {
    const f = form.get(s.arquivo);
    if (!(f instanceof File)) {
      erros.push(`Faltou anexar o arquivo ${s.arquivo}.`);
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    // A capa do reel é vertical como o vídeo: a mesma régua do story.
    const info = lerJpeg(bytes);
    erros.push(...(r.tipo === "reel" ? conferirStory(info, s.arquivo) : conferirImagem(info, s.arquivo)));
    arquivos.push({ nome: s.arquivo, bytes });
  }
  const arquivosDeStory: { nome: string; bytes: Uint8Array }[] = [];
  for (const s of r.stories) {
    const f = form.get(s.arquivo);
    if (!(f instanceof File)) {
      erros.push(`Faltou anexar o arquivo ${s.arquivo}.`);
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    erros.push(...conferirStory(lerJpeg(bytes), s.arquivo));
    arquivosDeStory.push({ nome: s.arquivo, bytes });
  }
  // O MP4 subiu antes, pela URL assinada. Aqui só se confere que ele está lá, inteiro.
  let video: Record<string, unknown> | null = null;
  if (r.video) {
    const caminho = caminhoNoBucket(r.origem, r.corte, r.video.hash, r.video.arquivo);
    let noBucket: { bytes: number } | null;
    try {
      noBucket = await videoNoBucket(admin, caminho);
    } catch (e) {
      return json({ error: `Não consegui consultar o bucket: ${String(e)}` }, 500);
    }
    if (!noBucket) erros.push(`O vídeo ${r.video.arquivo} não está no bucket. Suba o MP4 pela URL de envio antes do rascunho.`);
    else if (noBucket.bytes !== r.video.bytes) {
      erros.push(`O vídeo no bucket tem ${noBucket.bytes} bytes, e o rascunho diz ${r.video.bytes}. Envie de novo.`);
    }
    video = {
      url: urlPublica(supabaseUrl, caminho, BUCKET_VIDEO),
      path: caminho,
      bytes: r.video.bytes,
      duracao_s: r.video.duracaoS,
      largura: r.video.largura,
      altura: r.video.altura,
    };
  }
  if (erros.length) return json({ ok: false, erros }, 422);

  const chave = draftKey(r.origem, r.corte);
  const { data: existente, error: e1 } = await admin
    .from("social_post")
    .select("id, status, ig_container_id")
    .eq("draft_key", chave)
    .maybeSingle();
  if (e1) return json({ error: `Não consegui consultar a fila: ${e1.message}` }, 500);
  if (existente && !podeReenviar(existente.status, existente.ig_container_id ?? null)) {
    return json({ ok: false, erros: [motivoDoReenvioRecusado(existente.status)] }, 409);
  }
  const reenvioDeRecusado = existente?.status === "rejected";

  // Objeto imutável: o hash do conteúdo está no caminho e o upload nunca sobrescreve. Bytes
  // diferentes vão para outro caminho, então nenhum reenvio (nem o que perde uma corrida) troca a
  // imagem que um post aprovado já aponta. Caminho ocupado é o mesmo conteúdo: conta como sucesso.
  const slides = [];
  for (const [i, a] of arquivos.entries()) {
    const caminho = caminhoNoBucket(r.origem, r.corte, await hashDe(a.bytes), a.nome);
    const { error } = await admin.storage
      .from("assets-public")
      .upload(caminho, a.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (error && !objetoJaExiste(error)) {
      return json({ error: `Não consegui subir ${a.nome}: ${error.message}` }, 500);
    }
    const s = r.slides[i];
    slides.push({ url: urlPublica(supabaseUrl, caminho), path: caminho, alt: s.alt, texto: s.texto });
  }
  // As imagens dos stories seguem a mesma regra: caminho com o hash, nunca sobrescritas.
  const storySlides = [];
  for (const a of arquivosDeStory) {
    const caminho = caminhoNoBucket(r.origem, r.corte, await hashDe(a.bytes), a.nome);
    const { error } = await admin.storage
      .from("assets-public")
      .upload(caminho, a.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (error && !objetoJaExiste(error)) {
      return json({ error: `Não consegui subir ${a.nome}: ${error.message}` }, 500);
    }
    storySlides.push({ url: urlPublica(supabaseUrl, caminho), path: caminho });
  }
  const comStories = r.placements.includes("story");

  const texto = conferirTexto({ caption: r.caption, slides, keyphrase: r.keyphrase, priceDate: r.priceDate, reel: r.tipo === "reel" });
  const doVideo = r.video ? conferirVideo(r.video) : { blockers: [], warnings: [] };
  const validation = {
    blockers: [...texto.blockers, ...doVideo.blockers],
    warnings: [...texto.warnings, ...doVideo.warnings],
  };

  const { data: post } = await admin
    .from("blog_post")
    .select("id")
    .eq("slug", r.origem)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: destino } = r.destination
    ? await admin.from("destination").select("id").eq("slug", r.destination).maybeSingle()
    : { data: null };

  const linha = {
    draft_key: chave,
    status: "pending_review",
    kind: r.tipo === "reel" ? "reel" : slides.length > 1 ? "carousel" : "image",
    video,
    caption: r.caption,
    slides,
    keyphrase: r.keyphrase,
    cut_number: r.corte,
    blog_post_id: post?.id ?? null,
    destination_id: destino?.id ?? null,
    cta_url: r.ctaUrl,
    price_date: r.priceDate,
    scheduled_at: r.publicarEm,
    validation,
    approved_by: null,
    approved_at: null,
    last_error: null,
    deleted_at: null,
    placements: r.placements,
    story_slides: storySlides,
    story_status: comStories ? "pending" : null,
    story_items: [],
    story_error: null,
    story_published_at: null,
    story_claimed_at: null,
  };

  // O status é conferido na escrita, não numa leitura antes dela: se o rascunho foi aprovado entre
  // a leitura e aqui, o update não acha linha no status lido e nada é sobrescrito. Recusado só
  // volta se a Meta nunca recebeu nada dele (container nulo), conferido na mesma escrita.
  let id: string;
  if (existente) {
    const alvo = admin.from("social_post").update(linha).eq("id", existente.id);
    const { data, error } = await (reenvioDeRecusado
      ? alvo.eq("status", "rejected").is("ig_container_id", null)
      : alvo.eq("status", "pending_review")).select("id");
    if (error) return json({ error: `Não consegui gravar o rascunho: ${error.message}` }, 500);
    if (!data?.length) {
      return json(
        { ok: false, erros: ["Este rascunho mudou de estado durante o envio. A versão enviada foi descartada e o post na fila ficou como estava."] },
        409,
      );
    }
    id = data[0].id;
  } else {
    const { data, error } = await admin.from("social_post").insert(linha).select("id").single();
    if (error?.code === "23505") {
      return json({ ok: false, erros: ["Outro envio deste rascunho chegou primeiro. Envie de novo."] }, 409);
    }
    if (error) return json({ error: `Não consegui gravar o rascunho: ${error.message}` }, 500);
    id = data.id;
  }

  const rastro = await registrar(admin, {
    social_post_id: id,
    kind: "draft_received",
    note: `${r.video ? `Reel de ${Math.round(r.video.duracaoS)} s` : `${slides.length} slide(s)`}${
      reenvioDeRecusado ? ". Reenviado depois de uma recusa." : ""
    }`,
    response: validation,
  });
  return json({ ok: true, id, status: "pending_review", validation, ...(rastro ? {} : { aviso: AVISO_RASTRO }) });
}

export async function corrigirLegenda(req: Request, admin: Admin): Promise<Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: u, error: eu } = await admin.auth.getUser(token);
  if (eu || !u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (perfil?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  const lido = await req.json().catch(() => null);
  const corpo = (lido && typeof lido === "object" ? lido : {}) as Record<string, unknown>;
  if (corpo.action !== "update_caption") return json({ error: `Ação desconhecida: ${String(corpo.action)}.` }, 400);
  const caption = typeof corpo.caption === "string" ? corpo.caption.trim() : "";
  if (!caption) return json({ ok: false, erros: ["A legenda está vazia."] }, 422);
  if (!versaoValida(corpo.expected_updated_at)) {
    return json({ ok: false, erros: ["Não deu para saber qual versão do post estava aberta. Feche e abra o post de novo."] }, 422);
  }
  const versaoAberta = corpo.expected_updated_at;
  if (!ehUuid(corpo.id)) return json({ error: "Post não encontrado." }, 404);

  const { data: post, error: e1 } = await admin
    .from("social_post")
    .select("id, status, caption, slides, keyphrase, price_date")
    .eq("id", corpo.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (e1) return json({ error: `Não consegui consultar a fila: ${e1.message}` }, 500);
  if (!post) return json({ error: "Post não encontrado." }, 404);
  if (!podeCorrigirLegenda(post.status)) {
    return json({ ok: false, erros: [`Não dá para corrigir a legenda: o post está ${rotuloStatus(post.status)}.`] }, 409);
  }

  const validation = conferirTexto({ caption, slides: post.slides, keyphrase: post.keyphrase, priceDate: post.price_date });
  // Mesma regra da entrada: o status vai na escrita. Se o post foi publicado ou recusado nesse
  // meio tempo, o update não acha linha e a legenda antiga fica como está. A versão também: se o
  // post mudou desde que a pessoa o abriu (outra correção, um reenvio), a legenda dela não pisa.
  const { data: atualizado, error: e2 } = await admin
    .from("social_post")
    .update({ caption, validation, status: "pending_review", approved_by: null, approved_at: null })
    .eq("id", post.id)
    .is("deleted_at", null)
    .in("status", ["pending_review", "approved"])
    .eq("updated_at", versaoAberta)
    .select("id");
  if (e2) return json({ error: `Não consegui gravar a legenda: ${e2.message}` }, 500);
  if (!atualizado?.length) return json({ ok: false, erros: [TEXTO_VERSAO_VELHA] }, 409);

  const rastro = await registrar(admin, {
    social_post_id: post.id,
    kind: "caption_edited",
    actor: u.user.id,
    request: { antes: post.caption, depois: caption },
    response: validation,
  });
  return json({ ok: true, validation, ...(rastro ? {} : { aviso: AVISO_RASTRO }) });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = env("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) return await submeter(req, admin, supabaseUrl);
  // JSON com a chave do script é o pedido da URL de envio do vídeo; com JWT, a correção de legenda.
  if (req.headers.get("x-social-draft-key")) return await urlDeEnvioDoVideo(req, admin);
  return await corrigirLegenda(req, admin);
}

if (import.meta.main) Deno.serve(handler);
