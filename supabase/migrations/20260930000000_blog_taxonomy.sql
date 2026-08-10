-- Taxonomia do blog: autor, categoria editorial e tag.
--
-- Dois eixos de navegação, de propósito:
--   * aeroporto continua em `blog_post.destination_id`, que já existe e já alimenta
--     o CTA e a página /destinos/<slug>;
--   * `blog_category` é tema editorial (Preços, Comparativos, Guias...), derivado do
--     conteúdo em scripts/blog-taxonomy.mjs.
--
-- O WordPress tinha 11 categorias, 8 delas aeroporto, e 84 dos 93 posts sem tag
-- nenhuma. Não havia taxonomia editorial para importar; ela nasce aqui.
--
-- Ver docs/specs/blog.md.

create table public.blog_author (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  bio text,
  avatar_url text,
  legacy_wp_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blog_author_slug_key unique (slug),
  constraint blog_author_legacy_wp_id_key unique (legacy_wp_id)
);

create table public.blog_category (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blog_category_slug_key unique (slug)
);

create table public.blog_tag (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blog_tag_slug_key unique (slug)
);

-- Categoria e autor são opcionais: post pode nascer sem classificação, e apagar
-- uma categoria não pode levar o post junto.
alter table public.blog_post
  add column category_id uuid references public.blog_category (id) on delete set null,
  add column author_id uuid references public.blog_author (id) on delete set null;

create table public.blog_post_tag (
  post_id uuid not null references public.blog_post (id) on delete cascade,
  tag_id uuid not null references public.blog_tag (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

comment on table public.blog_category is
  'Tema editorial do post. Aeroporto NÃO entra aqui: ele é blog_post.destination_id.';
comment on table public.blog_post_tag is
  'Tags do post (N:N). Assunto transversal, derivado do texto em scripts/blog-taxonomy.mjs.';

create index blog_post_category_idx on public.blog_post (category_id) where deleted_at is null;
create index blog_post_author_idx on public.blog_post (author_id) where deleted_at is null;
create index blog_post_tag_tag_idx on public.blog_post_tag (tag_id);

create trigger blog_author_set_updated_at
  before update on public.blog_author
  for each row execute function public.set_updated_at();
create trigger blog_category_set_updated_at
  before update on public.blog_category
  for each row execute function public.set_updated_at();
create trigger blog_tag_set_updated_at
  before update on public.blog_tag
  for each row execute function public.set_updated_at();

alter table public.blog_author enable row level security;
alter table public.blog_category enable row level security;
alter table public.blog_tag enable row level security;
alter table public.blog_post_tag enable row level security;

-- Mesmo molde de `blog_post` e `destination`: leitura pública, escrita hub_admin.
create policy blog_author_select on public.blog_author for select using (true);
create policy blog_author_admin_write on public.blog_author
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

create policy blog_category_select on public.blog_category for select using (true);
create policy blog_category_admin_write on public.blog_category
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

create policy blog_tag_select on public.blog_tag for select using (true);
create policy blog_tag_admin_write on public.blog_tag
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

create policy blog_post_tag_select on public.blog_post_tag for select using (true);
create policy blog_post_tag_admin_write on public.blog_post_tag
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());
