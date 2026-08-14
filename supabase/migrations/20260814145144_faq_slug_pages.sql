-- FAQ com URL própria (GEO): cada pergunta global ou de destino ganha slug estável
-- para a página /faq/<slug>, e um corpo expandido opcional (body_md) para a
-- resposta longa em markdown.
--
-- Regras:
--  * slug só existe em escopo global/destination (FAQ de unidade não tem página);
--  * formato kebab-case, único entre FAQs vivas (parcial: deleted_at is null);
--  * insert sem slug ganha um automático a partir da pergunta (trigger), para a
--    superfície de páginas crescer sem passo manual; update NÃO mexe em slug
--    (URL publicada é contrato, não acompanha edição da pergunta).

alter table public.faq add column if not exists slug text;
alter table public.faq add column if not exists body_md text;

comment on column public.faq.slug is
  'URL própria da pergunta (/faq/<slug>). Só global/destination; contrato de URL, não muda quando a pergunta é editada.';
comment on column public.faq.body_md is
  'Resposta expandida em markdown, renderizada abaixo da resposta rápida na página da pergunta.';

alter table public.faq drop constraint if exists faq_slug_format;
alter table public.faq add constraint faq_slug_format
  check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.faq drop constraint if exists faq_slug_scope;
alter table public.faq add constraint faq_slug_scope
  check (slug is null or scope in ('global', 'destination'));

create unique index if not exists faq_slug_key
  on public.faq (slug)
  where slug is not null and deleted_at is null;

-- Slug a partir de texto pt-BR: minúsculo, sem acento, hífen entre palavras.
create or replace function public.faq_slugify(t text) returns text
language sql immutable
set search_path = ''
as $$
  select nullif(trim(both '-' from regexp_replace(lower(translate(t,
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', '-', 'g')), '')
$$;

create or replace function public.faq_slug_autofill() returns trigger
language plpgsql
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if new.slug is not null or new.scope not in ('global', 'destination') then
    return new;
  end if;
  base := public.faq_slugify(new.question);
  if base is null then
    return new;
  end if;
  candidate := base;
  while exists (
    select 1 from public.faq
    where slug = candidate and deleted_at is null and id is distinct from new.id
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end $$;

-- Trigger function fora do alcance dos clientes (mesmo padrão dos sweeps de
-- revoke: o Postgres não checa EXECUTE na hora do disparo, só no create trigger).
revoke execute on function public.faq_slug_autofill() from public, anon, authenticated;

drop trigger if exists faq_slug_autofill on public.faq;
create trigger faq_slug_autofill
  before insert on public.faq
  for each row execute function public.faq_slug_autofill();

-- Backfill: toda FAQ viva global/destination ganha slug derivado da pergunta,
-- com sufixo numérico em caso de colisão (determinístico por created_at, id).
with candidatos as (
  select id,
         public.faq_slugify(question) as base,
         row_number() over (
           partition by public.faq_slugify(question)
           order by created_at, id
         ) as rn
  from public.faq
  where deleted_at is null
    and scope in ('global', 'destination')
)
update public.faq f
set slug = case when c.rn = 1 then c.base else c.base || '-' || c.rn end
from candidatos c
where c.id = f.id
  and f.slug is null
  and c.base is not null;
