-- O sufixo de destino no slug compara por palavra, não por string inteira.
-- O short_name dos destinos carrega o código IATA ("Guarulhos (GRU)" vira
-- "guarulhos-gru"), então a checagem por substring nunca batia e a pergunta que
-- já menciona o aeroporto ganhava sufixo duplicado
-- (as-vagas-em-guarulhos-...-guarulhos-gru). Agora, se QUALQUER palavra do slug
-- do destino já aparece na pergunta, o sufixo não entra.
--
-- Re-slug em massa seguro pelo mesmo motivo da migration anterior: as páginas
-- /faq/<slug> ainda não foram publicadas.

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
    if dest is not null
       and not (string_to_array(base, '-') && string_to_array(dest, '-')) then
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

-- Re-slug das FAQs de destino vivas com a regra por token.
with alvo as (
  select f.id,
         f.created_at,
         case
           when ds.dslug is not null
             and not (string_to_array(base.b, '-') && string_to_array(ds.dslug, '-'))
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
where f.id = d.id
  and f.slug is distinct from case when d.rn = 1 then d.proposto else d.proposto || '-' || d.rn end;
