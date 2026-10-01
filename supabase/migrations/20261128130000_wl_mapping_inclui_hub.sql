-- `get_wl_mapping` também para consulta de reserva antiga (01/10/2026).
--
-- Em 01/10 a Nationpark e a Abbapark viraram `checkout_mode = 'hub'` e sumiram do
-- `wl_agent_mapping()`, que só devolvia unidade `external`. Era dali que o agente de
-- WhatsApp (Mia) tirava o domínio e os slugs do white-label, também para CONSULTAR
-- reservas: quem comprou no WL em setembro para outubro ficou sem resposta.
--
-- A venda continua sendo só `external` por padrão (nada muda para quem chama sem
-- argumento). `p_include_hub = true` traz também a unidade `hub` que ainda tem
-- white-label, e todo item passa a dizer o próprio `checkout_mode`, para o agente
-- rotear a venda pelo campo e a consulta pelo domínio.

drop function if exists public.wl_agent_mapping();

create or replace function public.wl_agent_mapping(p_include_hub boolean default false)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(u order by u->>'empresa', u->>'unidade'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'location_id',    l.id,
      'unidade',        l.name,
      'empresa',        c.name,
      'destino',        d.name,
      'destino_slug',   d.slug,
      'checkout_mode',  l.checkout_mode,
      'wl_domain',      c.wl_domain,
      'wl_tenant_key',  c.wl_tenant_key,
      'tipos_de_vaga',  (
        select coalesce(jsonb_agg(jsonb_build_object(
          'nome',             pt.name,
          'wl_category_slug', lpt.wl_category_slug,
          'wl_product_slug',  lpt.wl_product_slug,
          'diarias_minimas',  case when lpt.has_minimum_stay and lpt.minimum_stay_unit = 'days'
                                   then lpt.minimum_stay_value end
        ) order by pt.name), '[]'::jsonb)
        from public.location_parking_type lpt
        join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
        join public.parking_type pt on pt.id = cpt.parking_type_id
        where lpt.location_id = l.id
          and lpt.is_active
          -- Sem os dois slugs a vaga não é vendável no WL. Devolver mesmo assim faria o
          -- agente montar uma chamada que o parceiro recusa, e ele culparia a data.
          and lpt.wl_category_slug is not null
          and lpt.wl_product_slug is not null
      )
    ) as u
    from public.location l
    join public.company c on c.id = l.company_id
    left join public.destination d on d.id = l.destination_id
    where l.deleted_at is null
      and c.deleted_at is null
      and l.is_listed
      and l.status = 'active'
      and c.status = 'active'
      -- Venda: só unidade que fecha no white-label. Com `p_include_hub`, também a
      -- unidade `hub` que ainda tem WL, para consultar reserva feita lá antes da virada.
      and (l.checkout_mode = 'external' or p_include_hub)
      and c.wl_domain is not null
  ) s;
$function$;

revoke all on function public.wl_agent_mapping(boolean) from public, anon, authenticated;
grant execute on function public.wl_agent_mapping(boolean) to service_role;
