-- Tradução de conteúdo (EN e ES), fase 1: o modelo e o portão.
--
-- Aplicada no banco em 24/09/2026 pelo carimbo `i18n_traducao_de_conteudo`.
--
-- Por que existe. Auditoria de 24/09/2026: a Bandeira Park publica 84 páginas em
-- inglês e 84 em espanhol e nós nenhuma. LLM responde na língua da pergunta, e
-- consulta em inglês sobre estacionamento em GRU não tinha versão nossa para citar.
--
-- ── A regra que decide o desenho ─────────────────────────────────────────────
--
-- `is_published` por LINHA de tradução, começando em false. Uma página só existe em
-- outro idioma quando a tradução dela existe e foi liberada.
--
-- Isso não é zelo: é o que impede o pior resultado possível deste projeto, que é
-- publicar 1.100 URLs meio traduzidas. Página /en/ com texto em português é pior que
-- página /en/ inexistente, e um cluster de hreflang que aponta para tradução que não
-- existe faz o buscador desconfiar do cluster inteiro, inclusive do original. Com o
-- portão, o hreflang de cada URL lista SÓ os idiomas que de fato têm conteúdo, e a
-- tradução entra no ar uma a uma sem nunca quebrar o conjunto.
--
-- ── Português não é tradução ─────────────────────────────────────────────────
--
-- O enum tem só 'en' e 'es'. O pt-BR mora nas colunas originais e é a FONTE; tratá-lo
-- como mais uma linha de tradução abriria o estado de existir duas versões do texto
-- canônico, com o risco de a página original passar a ler a cópia.
--
-- ── Slug próprio, e opcional ─────────────────────────────────────────────────
--
-- `slug` traduzido é nulo por padrão e cai no slug original. Quando preenchido, a URL
-- daquele idioma usa a palavra que se busca naquele idioma, que é onde o concorrente
-- deixa valor na mesa: ele publica /en/estacionamento-aeroporto-viracopos, com o
-- segmento em português dentro da versão inglesa.

create type public.content_locale as enum ('en', 'es');

create table public.destination_i18n (
  destination_id   uuid not null references public.destination(id) on delete cascade,
  locale           public.content_locale not null,
  slug             text,
  seo_label        text,
  meta_title       text,
  meta_description text,
  intro            text,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (destination_id, locale),
  -- Publicar exige o mínimo que faz a página existir naquele idioma. Sem isto, uma
  -- linha vazia marcada como publicada geraria uma URL em branco no sitemap.
  constraint destination_i18n_publicavel check (
    not is_published or (coalesce(btrim(meta_title), '') <> '' and coalesce(btrim(intro), '') <> '')
  )
);
create unique index destination_i18n_slug_key on public.destination_i18n (locale, slug) where slug is not null;
create index destination_i18n_publicado_idx on public.destination_i18n (locale) where is_published;

create table public.faq_i18n (
  faq_id       uuid not null references public.faq(id) on delete cascade,
  locale       public.content_locale not null,
  slug         text,
  question     text,
  answer       text,
  body_md      text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (faq_id, locale),
  constraint faq_i18n_publicavel check (
    not is_published or (coalesce(btrim(question), '') <> '' and coalesce(btrim(answer), '') <> '')
  )
);
create unique index faq_i18n_slug_key on public.faq_i18n (locale, slug) where slug is not null;
create index faq_i18n_publicado_idx on public.faq_i18n (locale) where is_published;

create table public.blog_post_i18n (
  blog_post_id     uuid not null references public.blog_post(id) on delete cascade,
  locale           public.content_locale not null,
  slug             text,
  title            text,
  excerpt          text,
  meta_title       text,
  meta_description text,
  body_md          text,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (blog_post_id, locale),
  constraint blog_post_i18n_publicavel check (
    not is_published or (coalesce(btrim(title), '') <> '' and coalesce(btrim(body_md), '') <> '')
  )
);
create unique index blog_post_i18n_slug_key on public.blog_post_i18n (locale, slug) where slug is not null;
create index blog_post_i18n_publicado_idx on public.blog_post_i18n (locale) where is_published;

create trigger destination_i18n_set_updated_at before update on public.destination_i18n
  for each row execute function public.set_updated_at();
create trigger faq_i18n_set_updated_at before update on public.faq_i18n
  for each row execute function public.set_updated_at();
create trigger blog_post_i18n_set_updated_at before update on public.blog_post_i18n
  for each row execute function public.set_updated_at();

alter table public.destination_i18n enable row level security;
alter table public.faq_i18n enable row level security;
alter table public.blog_post_i18n enable row level security;

-- Rascunho de tradução não vaza: ao contrário das tabelas originais, onde a exclusão
-- do não publicado é feita na camada de query, aqui ela é da RLS. Tradução em revisão
-- é texto meio pronto, e um `select` esquecido publicaria isso.
create policy destination_i18n_select on public.destination_i18n
  for select using (is_published or public.is_hub_admin());
create policy destination_i18n_admin on public.destination_i18n
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

create policy faq_i18n_select on public.faq_i18n
  for select using (is_published or public.is_hub_admin());
create policy faq_i18n_admin on public.faq_i18n
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

create policy blog_post_i18n_select on public.blog_post_i18n
  for select using (is_published or public.is_hub_admin());
create policy blog_post_i18n_admin on public.blog_post_i18n
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

comment on table public.destination_i18n is
  'Tradução da página de destino. pt-BR mora nas colunas originais e é a fonte; aqui só en e es. `is_published` nasce false: URL em outro idioma só existe quando a tradução existe.';
comment on table public.faq_i18n is
  'Tradução de pergunta do FAQ, com slug próprio por idioma quando preenchido.';
comment on table public.blog_post_i18n is
  'Tradução de post. `body_md` é o corpo inteiro no idioma alvo, não um resumo.';
