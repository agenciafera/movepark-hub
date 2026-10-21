// Edge Function: /social-draft
// Entrada da fila de publicação do Instagram (E3.6).
//
// POST multipart  (header x-social-draft-key: <SOCIAL_DRAFT_KEY>)
//   campo "post": JSON do front matter da skill + "caption"; um arquivo por slide, com o nome do
//   "arquivo" do front matter.
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
// verify_jwt = false: o script da skill não tem JWT, e a chave basta para criar rascunho, que não
// publica nem aprova nada. A correção de legenda confere hub_admin aqui dentro.
// Secrets: SOCIAL_DRAFT_KEY. Ver docs/specs/instagram-fila-de-publicacao.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conferirImagem, conferirTexto, lerJpeg } from "../_shared/instagram-validate.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  ehUuid,
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

export async function submeter(req: Request, admin: Admin, supabaseUrl: string): Promise<Response> {
  if (!chaveConfere(env("SOCIAL_DRAFT_KEY"), req.headers.get("x-social-draft-key"))) {
    return json({ error: "unauthorized" }, 401);
  }
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
    erros.push(...conferirImagem(lerJpeg(bytes), s.arquivo));
    arquivos.push({ nome: s.arquivo, bytes });
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

  const validation = conferirTexto({ caption: r.caption, slides, keyphrase: r.keyphrase, priceDate: r.priceDate });

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
    kind: slides.length > 1 ? "carousel" : "image",
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
    note: reenvioDeRecusado
      ? `${slides.length} slide(s). Reenviado depois de uma recusa.`
      : `${slides.length} slide(s)`,
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
  return await corrigirLegenda(req, admin);
}

if (import.meta.main) Deno.serve(handler);
