-- O mapa de 301 precisa ser `security definer`, com os filtros escritos por extenso.
--
-- A versão anterior (20261103090000) era `security invoker` de propósito, para a RLS decidir
-- o que é público. Não funciona: `prospect_location` teve o `select` revogado de `anon` e
-- concedido POR COLUNA (20261009000000, Q-021, o telefone que a página não mostra), e o mapa
-- lê `converted_at`, que ficou de fora. Chamada como `anon`, a função morria em
-- `42501 permission denied for table prospect_location`, ou seja, o worker não teria mapa
-- nenhum e a virada de URL responderia 404 em toda URL antiga.
--
-- Definer resolve o acesso e transfere a responsabilidade: quem decide o que é público passa
-- a ser esta função, então os três gates vêm escritos aqui, iguais aos que a vitrine usa.
-- Empresa fora do ar entra no mesmo corte da `20261029100000`: unidade dela não tem página
-- pública hoje, então a URL antiga não tem para onde apontar.
--
-- `location_parking_type` entra SEM filtro de `is_active`: aqui não se decide o que está à
-- venda, e sim o que já teve URL indexada. Tipo desativado ontem continua no Google hoje.

create or replace function public.url_legacy_map()
returns table(legacy_path text, target_path text, permanent boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with dest as (
    select d.id, d.slug, d.public_slug
    from public.destination d
    where d.is_published and d.public_slug is not null
  ),
  linhas as (
    select '/destinos'::text as legacy_path, '/estacionamentos'::text as target_path, true as permanent
    union all
    select '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug, true
    from dest d
    union all
    select '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos', true
    from dest d
    union all
    select '/estacionamento-mais-barato/' || d.slug,
           '/estacionamentos/' || d.public_slug || '/mais-barato', true
    from dest d
    union all
    select '/p/' || c.slug || '/' || l.slug || '/' || pt.code,
           '/estacionamentos/' || d.public_slug || '/' || l.public_slug, true
    from public.location l
    join dest d on d.id = l.destination_id
    join public.company c on c.id = l.company_id
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where l.deleted_at is null and l.is_listed and l.status = 'active'
      and l.public_slug is not null
      and c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
    union all
    select '/estacionamentos/' || d.slug || '/' || p.slug,
           '/estacionamentos/' || d.public_slug || '/' || p.public_slug, true
    from public.prospect_location p
    join dest d on d.id = p.destination_id
    where p.is_published and p.converted_at is null and p.public_slug is not null
  )
  select distinct legacy_path, target_path, permanent
  from linhas
  where legacy_path is distinct from target_path
  order by legacy_path;
$function$;

revoke all on function public.url_legacy_map() from public;
grant execute on function public.url_legacy_map() to anon, authenticated, service_role;
