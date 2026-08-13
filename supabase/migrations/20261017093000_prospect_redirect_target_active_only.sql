-- E0.17-i · o 301 da ficha convertida só aponta para unidade que o site realmente serve.
--
-- A versão de 20261017090000 filtrava `deleted_at is null`, `is_listed` e tipo de vaga ativo,
-- que são os filtros do `getStaticPaths` do listing. Faltou `status = 'active'`, que a policy
-- pública `catalog_read_location` também exige. Uma unidade listada mas inativa existe como
-- estado válido no schema, e nela o redirecionamento apontaria para uma página que a RLS
-- recusa. Como o salto é 301, o navegador e o Google guardariam esse endereço morto.
--
-- Hoje não há linha nesse estado em produção, e não há ficha convertida, então isto corrige o
-- desenho antes de existir caso. Achado na revisão de segurança do diff da E0.17-h.
--
-- Só o corpo da função muda. Grants, comentário e assinatura seguem os de 20261017090000.

set search_path = public, extensions;

create or replace function public.prospect_redirect_target(
  p_destination_slug text,
  p_slug text
) returns table (target text, permanent boolean)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    coalesce(publicada.url, '/destinos/' || d.slug),
    publicada.url is not null
  from public.prospect_location p
  join public.destination d on d.id = p.destination_id
  left join lateral (
    -- Os três filtros da policy pública (viva, ativa e listada) mais o tipo de vaga ativo.
    -- Ordenado por código para o redirecionamento não trocar de destino entre um build e outro.
    select '/p/' || c.slug || '/' || l.slug || '/' || pt.code as url
    from public.location l
    join public.company c on c.id = l.company_id
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where l.id = p.converted_location_id
      and l.deleted_at is null
      and l.status = 'active'
      and l.is_listed
      and lpt.is_active
    order by pt.code
    limit 1
  ) publicada on true
  where p.slug = p_slug
    and d.slug = p_destination_slug
    and p.converted_at is not null;
$$;
