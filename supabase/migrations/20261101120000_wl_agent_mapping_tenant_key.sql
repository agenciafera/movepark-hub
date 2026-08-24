-- O agente precisa do `wl_tenant_key` para mandar o header `X-Tenant`.
--
-- Medido em 24/08/2026 contra virapark, plenty e nationpark: o `calculation-price`
-- devolve 200 e o MESMO preço com e sem o header, porque o domínio por empresa já
-- identifica o tenant. Ou seja, ele não é obrigatório neste endpoint hoje.
--
-- Mandamos assim mesmo. É de graça, alinha o agente com o caminho que `wl-deliver` e
-- `wl-reconcile` já usam, e cobre o caso de um endpoint (ou um tenant) exigir. O que
-- não dá é depender de um comportamento que ninguém garantiu por escrito.
--
-- Não é segredo: é o slug da empresa (`virapark`, `plenty`), e a superfície é a
-- interna (/manager, chave de plataforma).

create or replace function public.wl_agent_mapping()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(u order by u->>'empresa', u->>'unidade'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'location_id',    l.id,
      'unidade',        l.name,
      'empresa',        c.name,
      'destino',        d.name,
      'destino_slug',   d.slug,
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
      -- Só unidade que fecha no white-label. A Mia não atende checkout nativo no
      -- primeiro corte, e devolver unidade `hub` aqui a faria tentar vender pelo
      -- caminho errado.
      and l.checkout_mode = 'external'
      and c.wl_domain is not null
  ) s;
$$;

-- Função nova em `public` nasce executável por anon e authenticated (default privilege
-- do Supabase). O revoke tem que ser NOMINAL: tirar só de `public` deixa os dois papéis
-- com o grant direto.
revoke all on function public.wl_agent_mapping() from public, anon, authenticated;
grant execute on function public.wl_agent_mapping() to service_role;
