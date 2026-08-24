-- Mapeamento unidade -> slug do white-label, para o agente de WhatsApp (a Mia).
--
-- Por que existe. O agente do Dify carrega a lista das unidades ESCRITA A MÃO dentro do
-- prompt, com o `category_slug` e o `product_slug` de cada uma. Ela já está errada em
-- produção: oferece a Move Parking (empresa inativa) e declara quatro tipos de vaga na
-- Aerovalet Guarulhos contra os três que existem. Ao trazer o agente para o BeastBots,
-- a lista precisa virar consulta, senão o mesmo bug renasce em TypeScript.
--
-- Superfície: MCP /manager (chave `mp_` SEM empresa, sem card público). O escopo
-- `wl:read` é de PLATAFORMA: o mapeamento é da integração da Movepark com os parceiros,
-- não é dado que uma empresa concede a alguém. Um trigger já impede escopo de plataforma
-- de entrar em `company_role_scope`.
--
-- Ver docs/specs/agente-whatsapp-wl.md.

insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope) values
  ('wl:read', 'wl',
   'Ler o mapeamento unidade -> slug do white-label (uso interno do agente da Movepark)', true, true)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key,
  is_platform_scope = excluded.is_platform_scope;

-- SECURITY INVOKER de propósito: quem chama é a Edge com `service_role`, que já ignora
-- RLS. Um DEFINER aqui só acrescentaria uma função privilegiada à superfície de ataque
-- sem resolver nada.
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

comment on function public.wl_agent_mapping() is
  'Unidades de checkout externo com o domínio e os slugs do white-label, para o agente '
  'de WhatsApp. Substitui a lista escrita à mão do prompt do Dify. Escopo wl:read, '
  'superfície MCP /manager.';

-- Função nova em `public` nasce executável por anon e authenticated (default privilege
-- do Supabase). O revoke tem que ser NOMINAL: tirar só de `public` deixa os dois papéis
-- com o grant direto.
revoke all on function public.wl_agent_mapping() from public, anon, authenticated;
grant execute on function public.wl_agent_mapping() to service_role;
