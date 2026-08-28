-- O caminho público da ficha vira dado, e não montagem de string espalhada pelo front.
--
-- Fase 2 de docs/specs/url-estacionamentos.md, parte que ainda NÃO muda nenhuma URL: as
-- funções abaixo passam a expor `/estacionamentos/<destino>/<lote>` ao lado do que já
-- devolviam, e o mapa de redirecionamento nasce pronto para o worker consumir na virada.
--
-- Por que no banco: quem monta link para a ficha hoje são doze arquivos do front, cada um
-- com uma fonte de dados diferente (RPC de preço, RPC da vitrine, select direto, Edge de
-- busca). Se cada um montar o caminho por conta, a gramática da URL passa a existir em doze
-- lugares e a primeira divergência só aparece no Search Console. Aqui ela existe em um.
--
-- As duas funções de caminho são `security invoker` de propósito: elas leem `destination`
-- sob RLS, então unidade de destino não publicado devolve `null` e não ganha URL pública.

-- ---------------------------------------------------------------------------------------
-- 1. O caminho, para as duas famílias
-- ---------------------------------------------------------------------------------------
-- Campos computados do PostgREST: `select=id,name,location_public_path` funciona em
-- qualquer consulta de `location`, e o mesmo corpo serve dentro das RPCs abaixo.

create or replace function public.location_public_path(l public.location)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select '/estacionamentos/' || d.public_slug || '/' || l.public_slug
  from public.destination d
  where d.id = l.destination_id
    and d.public_slug is not null
    and l.public_slug is not null;
$function$;

comment on function public.location_public_path(public.location) is
  'Caminho público da ficha da unidade (/estacionamentos/<destino>/<lote>). Nulo enquanto faltar public_slug de um dos lados ou o destino não for visível.';

create or replace function public.prospect_public_path(p public.prospect_location)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select '/estacionamentos/' || d.public_slug || '/' || p.public_slug
  from public.destination d
  where d.id = p.destination_id
    and d.public_slug is not null
    and p.public_slug is not null;
$function$;

comment on function public.prospect_public_path(public.prospect_location) is
  'Caminho público da ficha do lote mapeado. Mesma gramática da unidade parceira: reivindicar não muda o endereço.';

grant execute on function public.location_public_path(public.location) to anon, authenticated, service_role;
grant execute on function public.prospect_public_path(public.prospect_location) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- 2. Segmentos reservados
-- ---------------------------------------------------------------------------------------
-- `/estacionamentos/<destino>/precos` e `.../mais-barato` são páginas do destino, e o
-- roteador resolve segmento estático antes de dinâmico. Um lote chamado "precos" não daria
-- erro em lugar nenhum: ele simplesmente ficaria inalcançável, que é o pior desfecho.

create or replace function public.public_slug_reservado(p_slug text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(p_slug, '') in ('precos', 'mais-barato');
$function$;

create or replace function public.location_guard_public_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if (tg_op = 'INSERT' and (new.public_slug is not null or new.public_name is not null))
     or (tg_op = 'UPDATE' and (new.public_slug is distinct from old.public_slug
                            or new.public_name is distinct from old.public_name)) then
    if auth.uid() is not null and not public.is_hub_admin() then
      raise exception 'public_name e public_slug so podem ser alterados por hub_admin'
        using errcode = '42501';
    end if;
  end if;

  if public.public_slug_reservado(new.public_slug) then
    raise exception
      'public_slug "%" é segmento reservado do destino; a ficha ficaria inalcançável',
      new.public_slug
      using errcode = '23514';
  end if;

  if new.public_slug is null or new.destination_id is null or new.deleted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.prospect_location p
    where p.destination_id = new.destination_id
      and p.public_slug = new.public_slug
      and p.converted_at is null
  ) then
    raise exception
      'public_slug "%" já pertence a um lote mapeado neste destino; as duas famílias dividem a mesma URL',
      new.public_slug
      using errcode = '23505';
  end if;

  return new;
end $function$;

revoke all on function public.location_guard_public_slug() from public, anon, authenticated;

create or replace function public.prospect_guard_public_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.public_slug_reservado(new.public_slug) then
    raise exception
      'public_slug "%" é segmento reservado do destino; a ficha ficaria inalcançável',
      new.public_slug
      using errcode = '23514';
  end if;

  if new.public_slug is null or new.converted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.location l
    where l.destination_id = new.destination_id
      and l.public_slug = new.public_slug
      and l.deleted_at is null
      and (new.converted_location_id is null or l.id <> new.converted_location_id)
  ) then
    raise exception
      'public_slug "%" já pertence a uma unidade neste destino; as duas famílias dividem a mesma URL',
      new.public_slug
      using errcode = '23505';
  end if;

  return new;
end $function$;

revoke all on function public.prospect_guard_public_slug() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 3. O mapa de 301 da virada
-- ---------------------------------------------------------------------------------------
-- Uma linha por URL antiga viva. O worker busca a tabela inteira uma vez por isolate (são
-- ~140 linhas) em vez de consultar por requisição, que é o que o `prospect_redirect_target`
-- faz hoje e não escala para a rota principal do site.
--
-- Linha onde origem e destino são iguais fica de fora por construção. Foi exatamente esse o
-- caso do `br-parking-viracopos`, que ficou em loop de 301 em produção.
--
-- `security invoker`: sob RLS, só entra no mapa o que é público de verdade. Unidade
-- despublicada some do mapa e a URL antiga passa a responder 404, que é o certo.

create or replace function public.url_legacy_map()
returns table(legacy_path text, target_path text, permanent boolean)
language sql
stable
set search_path to 'public'
as $function$
  with linhas as (
    -- índice de destinos
    select '/destinos'::text as legacy_path, '/estacionamentos'::text as target_path, true as permanent
    union all
    -- destino
    select '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug, true
    from public.destination d
    where d.is_published and d.public_slug is not null
    union all
    -- tabela de preços do destino
    select '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos', true
    from public.destination d
    where d.is_published and d.public_slug is not null
    union all
    -- mais barato do destino
    select '/estacionamento-mais-barato/' || d.slug,
           '/estacionamentos/' || d.public_slug || '/mais-barato', true
    from public.destination d
    where d.is_published and d.public_slug is not null
    union all
    -- unidade parceira: as três URLs por tipo de vaga colapsam na mesma ficha
    select '/p/' || c.slug || '/' || l.slug || '/' || pt.code, public.location_public_path(l), true
    from public.location l
    join public.company c on c.id = l.company_id
    join public.location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where l.deleted_at is null and l.is_listed
    union all
    -- lote mapeado: mesma pasta, slug novo
    select '/estacionamentos/' || d.slug || '/' || p.slug, public.prospect_public_path(p), true
    from public.prospect_location p
    join public.destination d on d.id = p.destination_id
    where p.is_published and p.converted_at is null
  )
  select distinct legacy_path, target_path, permanent
  from linhas
  where target_path is not null
    and legacy_path is distinct from target_path
  order by legacy_path;
$function$;

comment on function public.url_legacy_map() is
  'Mapa de 301 da virada de URL, consumido pelo worker uma vez por isolate. Nunca devolve linha onde origem e destino coincidem.';

revoke all on function public.url_legacy_map() from public;
grant execute on function public.url_legacy_map() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- 4. Ficha convertida: o alvo passa a ser a gramática nova
-- ---------------------------------------------------------------------------------------
-- Com as duas famílias na mesma URL, converter deixa de mudar de endereço quando a unidade
-- herda o `public_slug` da ficha. Enquanto a unidade não estiver listada, continua valendo
-- o 302 para o destino, porque converter não publica oferta.

create or replace function public.prospect_redirect_target(p_destination_slug text, p_slug text)
returns table(target text, permanent boolean)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select
    coalesce(publicada.url, '/estacionamentos/' || d.public_slug),
    publicada.url is not null
  from public.prospect_location p
  join public.destination d on d.id = p.destination_id
  left join lateral (
    select public.location_public_path(l) as url
    from public.location l
    where l.id = p.converted_location_id
      and l.deleted_at is null
      and l.status = 'active'
      and l.is_listed
      and exists (
        select 1 from public.location_parking_type lpt
        where lpt.location_id = l.id and lpt.is_active
      )
  ) publicada on true
  where p.slug = p_slug
    and d.slug = p_destination_slug
    and p.converted_at is not null;
$function$;

-- ---------------------------------------------------------------------------------------
-- 5. As RPCs de vitrine passam a entregar o caminho pronto
-- ---------------------------------------------------------------------------------------
-- Mudam o RETURNS TABLE, então é drop + create com os grants explícitos. `anon` precisa
-- constar por extenso: revoke de `public` não tira o grant dele.

drop function if exists public.home_featured_offers();
create function public.home_featured_offers()
returns table(id uuid, location_id uuid, operator_slug text, location_slug text,
              parking_type_code text, public_path text, sort_order integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    lpt.id,
    l.id as location_id,
    c.slug as operator_slug,
    l.slug as location_slug,
    pt.code as parking_type_code,
    public.location_public_path(l) as public_path,
    hf.sort_order
  from public.home_featured_offer hf
  join public.location_parking_type lpt on lpt.id = hf.location_parking_type_id
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where hf.is_active
    and lpt.is_active
    and cpt.is_active
    and l.deleted_at is null
    and l.status = 'active'::entity_status
    and l.is_listed
    and c.deleted_at is null
    and c.status = 'active'::entity_status
    and c.onboarding_status = 'active'::onboarding_status
  order by hf.sort_order, hf.id;
$function$;

revoke all on function public.home_featured_offers() from public;
grant execute on function public.home_featured_offers() to anon, authenticated, service_role;

drop function if exists public.destination_prospect_cards(text);
create function public.destination_prospect_cards(p_destination_slug text)
returns table(id uuid, name text, slug text, public_slug text, public_name text, public_path text,
              address text, latitude numeric, longitude numeric, google_maps_url text,
              amenities jsonb, description text, distance_km numeric, reference_name text,
              google_place_id text, google_rating numeric, google_rating_count integer,
              google_fetched_at timestamp with time zone)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select
    p.id,
    p.name,
    p.slug,
    p.public_slug,
    p.public_name,
    public.prospect_public_path(p) as public_path,
    p.address,
    p.latitude,
    p.longitude,
    p.google_maps_url,
    p.amenities,
    p.description,
    round((st_distance(p.geog, coalesce(np.geog, d.geog)) / 1000.0)::numeric, 2) as distance_km,
    np.name as reference_name,
    p.google_place_id,
    g.rating as google_rating,
    coalesce(g.user_rating_count, 0) as google_rating_count,
    g.fetched_at as google_fetched_at
  from public.destination d
  join public.prospect_location p on p.destination_id = d.id
  left join lateral (
    select dp.name, dp.geog
    from public.destination_point dp
    where dp.destination_id = d.id
    order by st_distance(p.geog, dp.geog) asc
    limit 1
  ) np on true
  left join public.google_place_snapshot g
    on g.place_id = p.google_place_id
   and not g.is_hidden
   and g.fetched_at > now() - interval '30 days'
  -- Aceita o slug antigo e o novo: a página de destino passa a chamar pelo público, e o
  -- que ainda estiver no ar com o antigo continua respondendo até o cache virar.
  where (d.slug = p_destination_slug or d.public_slug = p_destination_slug)
    and d.is_published
    and p.is_published
    and p.converted_at is null
  order by distance_km asc nulls last, p.name asc;
$function$;

revoke all on function public.destination_prospect_cards(text) from public;
grant execute on function public.destination_prospect_cards(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- 6. Índice de preços: caminho por unidade e slug público por destino
-- ---------------------------------------------------------------------------------------
-- Mesma função de sempre, com três acréscimos: `public_slug` no destino, `public_path` na
-- unidade e o filtro aceitando as duas formas de nomear o destino. O resto é idêntico,
-- inclusive os `materialized` que seguram o tempo da consulta (1,9s → 0,25s).

create or replace function public.destination_price_index(
  p_days integer[] default array[1, 7, 15, 30],
  p_destination text default null::text
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'extensions'
as $function$
declare
  v_days integer[];
  v_result jsonb;
begin
  select array_agg(distinct d order by d) into v_days
  from unnest(coalesce(p_days, array[1, 7, 15, 30])) d
  where d between 1 and 60;

  if v_days is null or cardinality(v_days) > 8 then
    raise exception 'p_days inválido: informe de 1 a 8 durações entre 1 e 60 diárias';
  end if;

  with dest as materialized (
    select d.id, d.slug, d.public_slug, d.code, d.name, d.short_name, d.type, d.city, d.state,
           d.sort_order, d.geog
    from destination d
    where d.is_published
      and (p_destination is null or d.slug = p_destination or d.public_slug = p_destination)
  ),
  unidade as materialized (
    select
      de.id as destination_id,
      c.slug as company_slug, c.name as company_name,
      l.slug as location_slug, l.name as location_name,
      l.public_name as location_public_name,
      case when de.public_slug is not null and l.public_slug is not null
           then '/estacionamentos/' || de.public_slug || '/' || l.public_slug end as public_path,
      l.checkout_mode, l.review_avg, l.review_count,
      l.has_shuttle, l.shuttle_to_terminal_minutes,
      l.photos[1] as photo,
      round(st_distance(l.geog, de.geog))::int as distance_m,
      pt.code as parking_type_code, pt.name as parking_type_name,
      case when lpt.has_minimum_stay and lpt.minimum_stay_unit = 'days'
           then lpt.minimum_stay_value end as min_stay_days,
      (select max(pr.updated_at) from pricing_rule pr
        where pr.location_parking_type_id = lpt.id) as price_updated_at
    from dest de
    join location l on l.destination_id = de.id
      and l.is_listed and l.deleted_at is null and l.status = 'active'
    join company c on c.id = l.company_id
      and c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
    join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
    join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
    join parking_type pt on pt.id = cpt.parking_type_id
    where exists (select 1 from pricing_rule pr where pr.location_parking_type_id = lpt.id)
  ),
  precos as materialized (
    select u.destination_id, u.location_name, u.parking_type_code as ptc,
      jsonb_build_object(
        'company_slug', u.company_slug,
        'company_name', u.company_name,
        'location_slug', u.location_slug,
        'location_name', u.location_name,
        'location_public_name', u.location_public_name,
        'public_path', u.public_path,
        'parking_type_code', u.parking_type_code,
        'parking_type_name', u.parking_type_name,
        'checkout_mode', u.checkout_mode,
        'review_avg', u.review_avg,
        'review_count', u.review_count,
        'has_shuttle', u.has_shuttle,
        'shuttle_minutes', u.shuttle_to_terminal_minutes,
        'distance_m', u.distance_m,
        'min_stay_days', u.min_stay_days,
        'price_updated_at', u.price_updated_at,
        'photo', u.photo,
        'prices', (
          select jsonb_agg(jsonb_build_object(
            'days', d,
            'total', (s.sim ->> 'price')::numeric,
            'old_total', (s.sim ->> 'old_price')::numeric
          ) order by d)
          from unnest(v_days) d
          cross join lateral (
            select simulate_price(u.company_slug, u.location_slug, u.parking_type_code, d) as sim
          ) s
        )
      ) as unit
    from unidade u
  ),
  com_preco as materialized (
    select * from precos p
    where exists (
      select 1 from jsonb_array_elements(p.unit -> 'prices') e
      where e ->> 'total' is not null
    )
  )
  select jsonb_build_object(
    'days', to_jsonb(v_days),
    'destinations', coalesce((
      select jsonb_agg(obj order by sort_order)
      from (
        select de.sort_order, jsonb_build_object(
          'slug', de.slug, 'public_slug', de.public_slug, 'code', de.code, 'name', de.name,
          'short_name', de.short_name, 'type', de.type,
          'city', de.city, 'state', de.state,
          'units', (
            select jsonb_agg(cp.unit order by cp.location_name, cp.ptc)
            from com_preco cp
            where cp.destination_id = de.id
          )
        ) as obj
        from dest de
      ) x
      where obj -> 'units' is not null and obj -> 'units' <> 'null'::jsonb
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;
