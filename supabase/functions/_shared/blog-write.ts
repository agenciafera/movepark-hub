// Escrita do blog — registro único, servido por duas superfícies.
//
// As mesmas três operações atendem a rota interna da API v1 (`internalRoute()` em
// `api/router.ts`) e as tools do MCP de Manager (`/mcp/manager`). Elas moram aqui
// porque duplicar a validação entre as duas superfícies é drift garantido: a que
// não fosse tocada aceitaria um payload que a outra recusa, e ninguém descobre
// até um post entrar torto.
//
// Nenhuma delas checa credencial. Quem autentica é a superfície: a API v1 exige o
// escopo de plataforma `blog:write` na chave, e o MCP de Manager exige chave sem
// empresa com o mesmo escopo. Aqui só existe a regra do domínio.
//
// Ver docs/specs/blog.md (§ "Escrita") e docs/specs/mcp.md.

/** Resultado sem exceção para erro previsível: cada superfície traduz no seu formato. */
export type BlogWriteResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: "invalid_request" | "not_found"; message: string };

const falha = (
  code: "invalid_request" | "not_found",
  message: string,
): BlogWriteResult => ({ ok: false, code, message });

/**
 * Resolve categoria, autor e destino por SLUG.
 *
 * A escrita fala slug, não uuid: id interno não é contrato, e quem escreve um
 * post conhece "precos" e "aeroporto-de-viracopos", não o uuid deles.
 */
async function resolveBlogRefs(
  // deno-lint-ignore no-explicit-any
  admin: any,
  b: Record<string, unknown>,
): Promise<{ ids: Record<string, string | null> } | { error: string }> {
  const ids: Record<string, string | null> = {
    category_id: null,
    author_id: null,
    destination_id: null,
  };
  const alvos: [string, string, string][] = [
    ["category", "blog_category", "category_id"],
    ["author", "blog_author", "author_id"],
    ["destination", "destination", "destination_id"],
  ];

  for (const [campo, tabela, coluna] of alvos) {
    const slug = b[campo];
    if (slug == null || slug === "") continue;
    const { data, error } = await admin
      .from(tabela)
      .select("id")
      .eq("slug", String(slug))
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: `${campo} "${slug}" não existe.` };
    ids[coluna] = data.id;
  }
  return { ids };
}

/** Substitui as tags do post. Devolve mensagem de erro, ou null se deu certo. */
async function setBlogPostTags(
  // deno-lint-ignore no-explicit-any
  admin: any,
  postId: string,
  slugs: string[],
): Promise<string | null> {
  const { data: tags, error: tagErr } = await admin
    .from("blog_tag")
    .select("id, slug")
    .in("slug", slugs);
  if (tagErr) throw tagErr;

  const achados = new Set((tags ?? []).map((t: { slug: string }) => t.slug));
  const faltando = slugs.filter((s) => !achados.has(s));
  if (faltando.length) return `tags inexistentes: ${faltando.join(", ")}.`;

  const { error: delErr } = await admin.from("blog_post_tag").delete().eq("post_id", postId);
  if (delErr) throw delErr;
  if (!tags?.length) return null;

  const { error } = await admin
    .from("blog_post_tag")
    .insert(tags.map((t: { id: string }) => ({ post_id: postId, tag_id: t.id })));
  if (error) throw error;
  return null;
}

/** Cria o post, ou atualiza o que já tem o mesmo slug. */
export async function upsertBlogPost(
  // deno-lint-ignore no-explicit-any
  admin: any,
  b: Record<string, unknown>,
): Promise<BlogWriteResult> {
  if (!b.slug || !b.title || !b.body_md) {
    return falha("invalid_request", "slug, title e body_md são obrigatórios.");
  }
  const resolved = await resolveBlogRefs(admin, b);
  if ("error" in resolved) return falha("invalid_request", resolved.error);

  const { data, error } = await admin
    .from("blog_post")
    .upsert(
      {
        slug: String(b.slug),
        title: String(b.title),
        body_md: String(b.body_md),
        excerpt: b.excerpt == null ? null : String(b.excerpt),
        cover_image_url: b.cover_image_url == null ? null : String(b.cover_image_url),
        meta_title: b.meta_title == null ? null : String(b.meta_title),
        meta_description: b.meta_description == null ? null : String(b.meta_description),
        ...resolved.ids,
        is_published: b.is_published === true,
      },
      { onConflict: "slug" },
    )
    .select("id, slug")
    .single();
  if (error) throw error;

  if (Array.isArray(b.tags)) {
    const applied = await setBlogPostTags(admin, data.id, b.tags as string[]);
    if (applied) return falha("invalid_request", applied);
  }
  return { ok: true, data };
}

/** Publica ou despublica. `is_published` ausente significa publicar. */
export async function publishBlogPost(
  // deno-lint-ignore no-explicit-any
  admin: any,
  slug: string,
  isPublished: unknown,
): Promise<BlogWriteResult> {
  const { data, error } = await admin
    .from("blog_post")
    .update({ is_published: isPublished !== false })
    .eq("slug", slug)
    .is("deleted_at", null)
    .select("slug, is_published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return falha("not_found", "Post não encontrado.");
  return { ok: true, data };
}

/**
 * Soft delete: a linha guarda `legacy_wp_id` e `legacy_url`, que são o rastro da
 * migração do WordPress e não se recupera depois.
 */
export async function deleteBlogPost(
  // deno-lint-ignore no-explicit-any
  admin: any,
  slug: string,
): Promise<BlogWriteResult> {
  const { data, error } = await admin
    .from("blog_post")
    .update({ deleted_at: new Date().toISOString() })
    .eq("slug", slug)
    .is("deleted_at", null)
    .select("slug")
    .maybeSingle();
  if (error) throw error;
  if (!data) return falha("not_found", "Post não encontrado.");
  return { ok: true, data: { slug: data.slug, deleted: true } };
}
