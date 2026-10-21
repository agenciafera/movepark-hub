// Edge Function: /social-draft
// Entrada da fila de publicação do Instagram (E3.6).
//
// POST multipart  (header x-social-draft-key: <SOCIAL_DRAFT_KEY>)
//   campo "post": JSON do front matter da skill + "caption"; um arquivo por slide, com o nome do
//   "arquivo" do front matter.
//   → 200 { ok, id, status, validation } | 401 | 409 (rascunho já aprovado) | 422 { erros }
//   Problema de arquivo ou de formato devolve 422 e não grava nada. Problema de texto fica em
//   `validation` e trava a aprovação, para a tela mostrar o motivo.
//
// POST JSON { action: "update_caption", id, caption }  (Authorization: Bearer <JWT hub_admin>)
//   → 200 { ok, validation } | 401 | 403 | 404 | 409 | 422
//   Corrigir a legenda devolve o post para "pending_review": o texto aprovado deixou de existir.
//
// verify_jwt = false: o script da skill não tem JWT, e a chave basta para criar rascunho, que não
// publica nem aprova nada. A correção de legenda confere hub_admin aqui dentro.
// Secrets: SOCIAL_DRAFT_KEY. Ver docs/specs/instagram-fila-de-publicacao.md.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conferirImagem, conferirTexto, lerJpeg } from "../_shared/instagram-validate.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  lerRascunho,
  podeCorrigirLegenda,
  podeReenviar,
  urlPublica,
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

// @ts-expect-error - Deno env
const env = (k: string): string | undefined => Deno.env.get(k);

async function versaoDe(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...h.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function submeter(req: Request, admin: Admin, supabaseUrl: string): Promise<Response> {
  if (!chaveConfere(env("SOCIAL_DRAFT_KEY"), req.headers.get("x-social-draft-key"))) {
    return json({ error: "unauthorized" }, 401);
  }
  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, erros: ["multipart inválido"] }, 422);

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(form.get("post") ?? ""));
  } catch {
    return json({ ok: false, erros: ["o campo post não é JSON"] }, 422);
  }
  const lido = lerRascunho(bruto);
  if (!lido.ok) return json({ ok: false, erros: lido.erros }, 422);
  const r = lido.rascunho;

  const arquivos: { nome: string; bytes: Uint8Array }[] = [];
  const erros: string[] = [];
  for (const s of r.slides) {
    const f = form.get(s.arquivo);
    if (!(f instanceof File)) {
      erros.push(`faltou o arquivo ${s.arquivo}`);
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
    .select("id, status")
    .eq("draft_key", chave)
    .maybeSingle();
  if (e1) return json({ error: e1.message }, 500);
  if (existente && !podeReenviar(existente.status)) {
    return json({ ok: false, erros: [`este rascunho já está ${existente.status} e não é sobrescrito`] }, 409);
  }

  const slides = [];
  for (const [i, a] of arquivos.entries()) {
    const caminho = caminhoNoBucket(r.origem, a.nome);
    const { error } = await admin.storage
      .from("assets-public")
      .upload(caminho, a.bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    if (error) return json({ error: `upload de ${a.nome}: ${error.message}` }, 500);
    const s = r.slides[i];
    slides.push({ url: urlPublica(supabaseUrl, caminho, await versaoDe(a.bytes)), path: caminho, alt: s.alt, texto: s.texto });
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
  const { data: salvo, error: e2 } = await admin
    .from("social_post")
    .upsert(linha, { onConflict: "draft_key" })
    .select("id")
    .single();
  if (e2) return json({ error: e2.message }, 500);

  await admin.from("social_post_event").insert({
    social_post_id: salvo.id,
    kind: "draft_received",
    note: `${slides.length} slide(s)`,
    response: validation,
  });
  return json({ ok: true, id: salvo.id, status: "pending_review", validation });
}

async function corrigirLegenda(req: Request, admin: Admin): Promise<Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: u, error: eu } = await admin.auth.getUser(token);
  if (eu || !u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (perfil?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  const corpo = await req.json().catch(() => ({}));
  if (corpo.action !== "update_caption") return json({ error: `action desconhecida: ${corpo.action}` }, 400);
  const caption = typeof corpo.caption === "string" ? corpo.caption.trim() : "";
  if (!caption) return json({ ok: false, erros: ["A legenda está vazia."] }, 422);

  const { data: post } = await admin
    .from("social_post")
    .select("id, status, caption, slides, keyphrase, price_date")
    .eq("id", corpo.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) return json({ error: "post não encontrado" }, 404);
  if (!podeCorrigirLegenda(post.status)) {
    return json({ ok: false, erros: [`Post ${post.status} não tem a legenda corrigida.`] }, 409);
  }

  const validation = conferirTexto({ caption, slides: post.slides, keyphrase: post.keyphrase, priceDate: post.price_date });
  const { error } = await admin
    .from("social_post")
    .update({ caption, validation, status: "pending_review", approved_by: null, approved_at: null })
    .eq("id", post.id);
  if (error) return json({ error: error.message }, 500);

  await admin.from("social_post_event").insert({
    social_post_id: post.id,
    kind: "caption_edited",
    actor: u.user.id,
    request: { antes: post.caption, depois: caption },
    response: validation,
  });
  return json({ ok: true, validation });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = env("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) return await submeter(req, admin, supabaseUrl);
  return await corrigirLegenda(req, admin);
});
