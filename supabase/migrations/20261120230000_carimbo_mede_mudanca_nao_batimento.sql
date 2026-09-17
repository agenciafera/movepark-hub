-- O carimbo de frescor passa a medir MUDANÇA da tabela, não o batimento do robô (Conteúdo 29).
--
-- O que estava errado: o carimbo saía de `max(pricing_rule.updated_at)`, e `updated_at` não é a
-- data da tabela. O espelhamento (`wl-price-mirror`, cron de 3 em 3 horas) reescreve
-- `mirror_verified_at = now()` em TODA passada, inclusive quando o preço não mudou, e o trigger
-- `set_updated_at_pricing_rule` empurra `updated_at` junto. Resultado medido em 17/09/2026: as
-- seis praças precificadas carimbavam "17/09/2026", enquanto a última mudança real de Viracopos
-- era 10/08, a de Afonso Pena 10/08 e a do Tietê 12/08. Amanhã carimbariam 18/09, e assim para
-- sempre: o número era a hora do último cron, não a idade do preço.
--
-- Isso vazava para o visível e para o schema ao mesmo tempo (`Dataset.dateModified` em /precos,
-- `WebPage.dateModified` em /precos/<slug>, `BlogPosting.dateModified` no post que publica
-- preço). Frescor inventado é exatamente o que o Conteúdo 26 quis evitar, e é o que o Google
-- pune quando descobre.
--
-- A coluna que guarda a verdade já existia: `mirror_sampled_at` só é reescrita quando o
-- fingerprint da regra muda (ver `wl_mirror_apply_pricing`), então ela é a data da tabela.
-- `updated_at` continua valendo para a regra NATIVA, que ninguém espelha e onde a escrita é a
-- edição de verdade.
--
--   data da tabela   = coalesce(mirror_sampled_at, updated_at)
--   conferida em     = coalesce(mirror_verified_at, updated_at)
--
-- As duas datas passam a sair juntas, porque "conferimos de 3 em 3 horas" é afirmação forte e
-- verdadeira, e some quando ela é empacotada dentro da outra. Quem publica escolhe qual mostra.

-- Muda o retorno (coluna nova), então não dá para `create or replace`.
drop function if exists public.destination_price_freshness(text);

create function public.destination_price_freshness(
  p_destination text default null
)
returns table (
  destination_slug text,
  price_updated_at timestamptz,
  price_verified_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.slug,
         max(coalesce(pr.mirror_sampled_at, pr.updated_at)),
         max(coalesce(pr.mirror_verified_at, pr.updated_at))
  from destination d
  join location l on l.destination_id = d.id
    and l.is_listed and l.deleted_at is null and l.status = 'active'
  join company c on c.id = l.company_id
    and c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
  join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
  join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
  join pricing_rule pr on pr.location_parking_type_id = lpt.id
  where d.is_published
    and (p_destination is null or d.slug = p_destination)
  group by d.slug
  having max(coalesce(pr.mirror_sampled_at, pr.updated_at)) is not null;
$$;

comment on function public.destination_price_freshness(text) is
  'Por destino publicado: a data em que a tabela de preço MUDOU (mirror_sampled_at, ou updated_at na regra nativa) e a data em que ela foi conferida pela última vez (mirror_verified_at). Mesmo corte do destination_price_index. Alimenta o carimbo visível e o dateModified do schema.';

grant execute on function public.destination_price_freshness(text) to anon, authenticated;

-- O índice publica `price_updated_at` por unidade, e é dele que /precos tira o carimbo do
-- cabeçalho. Tinha o mesmo defeito, e um pgTAP tranca a igualdade entre os dois: consertar um só
-- deixaria as duas superfícies datando a mesma tabela por dias diferentes.
create or replace function public.destination_price_index(
  p_days integer[] default array[1, 7, 15, 30],
  p_destination text default null
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
      -- Data da tabela, não da última conferida. Ver o cabeçalho desta migration.
      (select max(coalesce(pr.mirror_sampled_at, pr.updated_at)) from pricing_rule pr
        where pr.location_parking_type_id = lpt.id) as price_updated_at,
      (select max(coalesce(pr.mirror_verified_at, pr.updated_at)) from pricing_rule pr
        where pr.location_parking_type_id = lpt.id) as price_verified_at
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
        'price_verified_at', u.price_verified_at,
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
