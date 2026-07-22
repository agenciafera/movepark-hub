-- Busca do painel (command palette do manager e do operator).
--
-- Uma RPC só, com UNION entre reserva, unidade e cupom, para a palette não
-- precisar de três round-trips nem montar filtro de empresa no front.
--
-- POR QUE O FILTRO DE EMPRESA É EXPLÍCITO E NÃO SÓ RLS: as policies de RLS são
-- permissivas e se somam com OR. `location` tem a `catalog_read_location`
-- (anon + authenticated leem toda unidade ativa e listada, porque o site do
-- consumidor lista estacionamentos) e `coupon` tem a `catalog_read_coupon`
-- (anon + authenticated leem TODO cupom ativo). Uma busca que confiasse apenas
-- no RLS devolveria unidade e cupom de outras empresas para o operador. Por
-- isso cada ramo do UNION carrega o seu `is_hub_admin() OR company_id IN
-- (current_company_ids())`. A função é SECURITY INVOKER de propósito: o RLS
-- continua valendo por baixo, e o filtro explícito é a segunda camada.

create extension if not exists pg_trgm;

-- Índices de trigrama: sem eles cada tecla digitada na palette vira seq scan.
create index if not exists booking_code_trgm_idx
  on public.booking using gin (code gin_trgm_ops);
create index if not exists booking_customer_name_trgm_idx
  on public.booking using gin (customer_name gin_trgm_ops);
create index if not exists booking_customer_email_trgm_idx
  on public.booking using gin (customer_email gin_trgm_ops);
create index if not exists location_name_trgm_idx
  on public.location using gin (name gin_trgm_ops);
create index if not exists location_address_trgm_idx
  on public.location using gin (address gin_trgm_ops);
create index if not exists coupon_code_trgm_idx
  on public.coupon using gin (code gin_trgm_ops);

-- `company_id` vai no retorno porque o manager só tem rota de unidade por
-- empresa (/manager/companies/:id/locations). Sem ele a palette do manager não
-- teria para onde mandar o resultado.
create or replace function public.admin_search(p_query text, p_limit integer default 5)
returns table (kind text, id uuid, title text, subtitle text, company_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with args as (
    select
      -- Escapa os curingas do LIKE: um usuário digitando "100%" procura o texto
      -- "100%", não "100" seguido de qualquer coisa.
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as term,
      length(btrim(coalesce(p_query, ''))) as term_len,
      greatest(1, least(coalesce(p_limit, 5), 20)) as lim,
      is_hub_admin() as admin
  ),
  escopo as (select array(select current_company_ids()) as company_ids)
  (
    select 'booking'::text, b.id, b.code,
           coalesce(nullif(btrim(b.customer_name), ''), b.customer_email, 'Sem contato'),
           l.company_id
    from booking b
    join location l on l.id = b.location_id
    cross join args, escopo
    where args.term_len >= 2
      and b.deleted_at is null
      and (args.admin or l.company_id = any(escopo.company_ids))
      and (b.code ilike args.term
           or b.customer_name ilike args.term
           or b.customer_email ilike args.term)
    order by b.check_in_at desc nulls last
    limit (select lim from args)
  )
  union all
  (
    select 'location'::text, l.id, l.name, coalesce(l.address, 'Sem endereço'), l.company_id
    from location l
    cross join args, escopo
    where args.term_len >= 2
      and l.deleted_at is null
      and (args.admin or l.company_id = any(escopo.company_ids))
      and (l.name ilike args.term or l.address ilike args.term)
    order by l.name
    limit (select lim from args)
  )
  union all
  (
    select 'coupon'::text, c.id, c.code,
           case when c.is_active then 'Ativo' else 'Inativo' end,
           c.company_id
    from coupon c
    cross join args, escopo
    where args.term_len >= 2
      and (args.admin or c.company_id = any(escopo.company_ids))
      and c.code ilike args.term
    order by c.code
    limit (select lim from args)
  );
$$;

comment on function public.admin_search(text, integer) is
  'Busca da command palette do painel. UNION entre reserva, unidade e cupom, '
  'escopado por empresa de forma explícita (as policies de catálogo de location '
  'e coupon são públicas e não servem de escopo). Termo com menos de 2 '
  'caracteres devolve vazio.';

revoke all on function public.admin_search(text, integer) from public, anon;
grant execute on function public.admin_search(text, integer) to authenticated;
