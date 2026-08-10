-- Blog no Hub (substitui o WordPress em movepark.co/blog/).
--
-- O slug é o contrato: ele vem idêntico do WordPress e é o que preserva as 93
-- URLs que respondem por 22,62% dos cliques orgânicos do site. Renomear slug
-- aqui quebra uma URL que o Google conhece. Ver docs/specs/blog.md.
--
-- Espelha o molde de `destination`: leitura pública, escrita só hub_admin,
-- is_published filtrado na camada de query (não na RLS) para o Manager
-- enxergar rascunho pela mesma policy.

create table public.blog_post (
  id uuid primary key default gen_random_uuid(),

  -- contrato de URL: /blog/<slug>/
  slug text not null,
  title text not null,
  excerpt text,
  body_md text not null,
  cover_image_url text,

  -- SEO: vem de _yoast_wpseo_title / _yoast_wpseo_metadesc na importação.
  -- Nulo cai no fallback da página (title do post).
  meta_title text,
  meta_description text,

  -- O vínculo que dá CTA ao post. Sem ele o post preserva o ranking e
  -- desperdiça a visita, porque não tem para onde mandar o leitor.
  destination_id uuid references public.destination (id) on delete set null,

  author_name text,
  published_at timestamptz not null default now(),
  is_published boolean not null default false,

  -- Rastro da migração: idempotência do importador e auditoria.
  legacy_wp_id integer,
  legacy_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint blog_post_slug_key unique (slug),
  constraint blog_post_legacy_wp_id_key unique (legacy_wp_id)
);

comment on table public.blog_post is
  'Posts do blog. O slug é herdado do WordPress e é contrato de URL: ver docs/specs/blog.md.';
comment on column public.blog_post.slug is
  'Segmento de /blog/<slug>/. Idêntico ao do WordPress. Renomear quebra URL indexada.';
comment on column public.blog_post.legacy_wp_id is
  'ID do post no WordPress. Chave de idempotência do importador (scripts/import-wp-blog.mjs).';

-- Caminho de leitura pública (índice + getStaticPaths) e listagem por destino.
create index blog_post_published_idx
  on public.blog_post (is_published, published_at desc)
  where deleted_at is null;

create index blog_post_destination_idx
  on public.blog_post (destination_id)
  where deleted_at is null;

create trigger blog_post_set_updated_at
  before update on public.blog_post
  for each row execute function public.set_updated_at();

alter table public.blog_post enable row level security;

-- Leitura pública: conteúdo de blog é informação pública. `is_published` NÃO é
-- filtrado aqui de propósito (mesma decisão de `destination`): o Manager precisa
-- enxergar rascunho pela mesma policy, e a exclusão do público acontece na
-- camada de query dos fetchers e do getStaticPaths.
create policy blog_post_select on public.blog_post
  for select using (true);

create policy blog_post_admin_write on public.blog_post
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());
