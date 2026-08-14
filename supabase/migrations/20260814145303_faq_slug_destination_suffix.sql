-- Slug de FAQ de destino carrega o aeroporto. A mesma pergunta existe em 5
-- destinos ("E se meu voo atrasar?"), e o autofill anterior resolvia a colisão
-- com sufixo numérico (-2..-5), que não diz nada pra busca nem pra IA. Agora o
-- slug ganha o nome curto do destino quando a pergunta ainda não o menciona
-- (ex.: e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-guarulhos).
--
-- O re-slug em massa aqui é seguro porque as páginas /faq/<slug> ainda não
-- existem publicadas: o contrato de URL nasce depois desta migration.

create or replace function public.faq_slug_autofill() returns trigger
language plpgsql
set search_path = public
as $$
declare
  base text;
  dest text;
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
  if new.scope = 'destination' and new.destination_id is not null then
    select public.faq_slugify(coalesce(d.short_name, d.name)) into dest
    from public.destination d
    where d.id = new.destination_id;
    if dest is not null and position(dest in base) = 0 then
      base := base || '-' || dest;
    end if;
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

revoke execute on function public.faq_slug_autofill() from public, anon, authenticated;

-- Re-slug de todas as FAQs de destino vivas com a regra nova.
with alvo as (
  select f.id,
         f.created_at,
         case
           when ds.dslug is not null and position(ds.dslug in base.b) = 0
             then base.b || '-' || ds.dslug
           else base.b
         end as proposto
  from public.faq f
  cross join lateral (select public.faq_slugify(f.question) as b) base
  left join lateral (
    select public.faq_slugify(coalesce(d.short_name, d.name)) as dslug
    from public.destination d
    where d.id = f.destination_id
  ) ds on true
  where f.scope = 'destination'
    and f.deleted_at is null
    and base.b is not null
),
dedup as (
  select id, proposto,
         row_number() over (partition by proposto order by created_at, id) as rn
  from alvo
)
update public.faq f
set slug = case when d.rn = 1 then d.proposto else d.proposto || '-' || d.rn end
from dedup d
where f.id = d.id;
