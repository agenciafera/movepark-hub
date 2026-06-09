-- Destinos: campos de conteúdo/SEO + slug para página própria por destino.

alter table public.destination
  add column slug text,
  add column meta_title text,
  add column meta_description text,
  add column intro text,
  add column hero_image_url text,
  add column is_published boolean not null default true;

-- backfill de slug único a partir do nome (sufixo -2/-3 em colisões)
with d as (
  select id,
         public.slugify(name) as base,
         row_number() over (partition by public.slugify(name) order by sort_order, code) as rn
  from public.destination
)
update public.destination dst
set slug = case when d.rn = 1 then d.base else d.base || '-' || d.rn end
from d where d.id = dst.id;

alter table public.destination
  alter column slug set not null,
  add constraint destination_slug_key unique (slug);

create index destination_published_idx on public.destination (is_published, sort_order);

-- preenche slug a partir do nome quando vier vazio (seed/insert sem slug)
create or replace function public.destination_set_slug()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.slugify(new.name);
  end if;
  return new;
end $$;

create trigger destination_set_slug_trg
  before insert on public.destination
  for each row execute function public.destination_set_slug();
