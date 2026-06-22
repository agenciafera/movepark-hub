-- E2.4.1 · Atribuição de reservas (origem hub × white-label + UTM) — dashboard do Manager.
--
-- Agrega as reservas de um período por:
--   • hub × externo: `created_via_api_key_id IS NULL` = nasceu no hub; NOT NULL = via Public API (white-label).
--   • origin (sub-fonte): hub_search / hub_destino / hub_direct / api / white_label / …
--   • utm_source (marketing); NULL/'' agrupa como '(direto)'.
-- Só hub_admin (mesma regra dos outros RPCs financeiros).

create or replace function public.booking_attribution(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a atribuição.' using errcode = '42501';
  end if;

  with b as (
    select
      (created_via_api_key_id is null) as is_hub,
      coalesce(nullif(origin, ''), '(sem origem)') as origin,
      coalesce(nullif(utm_source, ''), '(direto)') as utm_source,
      status::text as status
    from public.booking
    where deleted_at is null
      and created_at >= p_from
      and created_at < p_to
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'hub', count(*) filter (where is_hub),
      'external', count(*) filter (where not is_hub),
      'total', count(*)
    ),
    'by_origin', coalesce((
      select jsonb_agg(jsonb_build_object('origin', origin, 'count', c, 'confirmed', cc) order by c desc)
      from (
        select origin,
               count(*) as c,
               count(*) filter (where status in ('confirmed', 'checked_in', 'completed')) as cc
        from b group by origin
      ) o
    ), '[]'::jsonb),
    'by_utm_source', coalesce((
      select jsonb_agg(jsonb_build_object('utm_source', utm_source, 'count', c) order by c desc)
      from (
        select utm_source, count(*) as c from b group by utm_source
      ) u
    ), '[]'::jsonb)
  ) into v_result
  from b;

  return coalesce(
    v_result,
    jsonb_build_object(
      'totals', jsonb_build_object('hub', 0, 'external', 0, 'total', 0),
      'by_origin', '[]'::jsonb,
      'by_utm_source', '[]'::jsonb
    )
  );
end; $fn$;

revoke all on function public.booking_attribution(timestamptz, timestamptz) from public;
grant execute on function public.booking_attribution(timestamptz, timestamptz) to authenticated, service_role;
