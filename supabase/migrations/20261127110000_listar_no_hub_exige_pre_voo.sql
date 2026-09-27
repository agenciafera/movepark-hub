-- Listar uma unidade em modo Hub exige o pré-voo (E0.14, 27/09/2026).
--
-- Achado da revisão de 27/09: "Nova Iguaçu" (Moveparking) estava is_listed = true em modo hub
-- reprovando no pré-voo (sem contrato, recebedor e split), e só não aparecia na busca porque a
-- empresa está inativa. O guard `location_checkout_mode_guard` conferia o pré-voo apenas na troca
-- externo → hub, nunca ao ligar `is_listed`. Agora ligar `is_listed` numa unidade hub (ou trocar
-- para hub uma unidade listada) passa pelo mesmo pré-voo, quando quem escreve é uma pessoa
-- (auth.uid() presente: Manager ou Operator). Escrita de serviço (cron, Edge, fixtures) não é
-- gateada aqui, como nas demais regras de permissão do trigger.
--
-- `location_hub_readiness` exige hub_admin no JWT; o trigger não pode depender disso (um Dono com
-- escopo pode editar a unidade), então a conta vai para `_hub_readiness`, sem checagem de chamador,
-- e a função pública passa a delegar.

create or replace function public._hub_readiness(p_location_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_missing text[] := '{}';
  v_c record;
  v_rec record;
  v_split_global boolean;
  v_sem_preco int; v_sem_capacidade int; v_vagas int;
begin
  select c.id, c.hub_relationship, c.status, c.onboarding_status, c.contract_accepted_at,
         c.gateway_split_enabled, c.take_rate_bps
    into v_c
    from public.location l join public.company c on c.id = l.company_id
   where l.id = p_location_id;
  if v_c.id is null then
    raise exception 'location_hub_readiness: unidade % nao encontrada', p_location_id using errcode = 'P0002';
  end if;

  if v_c.hub_relationship = 'silent' then v_missing := array_append(v_missing, 'hub_relationship'); end if;
  if v_c.status <> 'active' then v_missing := array_append(v_missing, 'company_status'); end if;
  if v_c.onboarding_status <> 'active' then v_missing := array_append(v_missing, 'onboarding_status'); end if;
  if v_c.contract_accepted_at is null then v_missing := array_append(v_missing, 'contract'); end if;
  if v_c.take_rate_bps is null then v_missing := array_append(v_missing, 'take_rate'); end if;

  select r.status, r.external_recipient_id, r.gateway_missing_at into v_rec
    from public.payout_recipient r
   where r.company_id = v_c.id and r.provider = 'pagarme' and r.deleted_at is null
   limit 1;
  if v_rec.external_recipient_id is null or v_rec.status <> 'active' or v_rec.gateway_missing_at is not null then
    v_missing := array_append(v_missing, 'recipient');
  end if;

  v_split_global := coalesce((select nullif(trim(value), '') from public.app_setting where key = 'pagarme_split_enabled'), 'true') <> 'false';
  if not (v_split_global or coalesce(v_c.gateway_split_enabled, false)) then
    v_missing := array_append(v_missing, 'split');
  end if;

  select count(*), count(*) filter (where pr.id is null), count(*) filter (where lpt.capacity <= 0)
    into v_vagas, v_sem_preco, v_sem_capacidade
    from public.location_parking_type lpt
    left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where lpt.location_id = p_location_id and lpt.is_active;
  if v_vagas = 0 then v_missing := array_append(v_missing, 'parking_types'); end if;
  if v_sem_preco > 0 then v_missing := array_append(v_missing, 'pricing'); end if;
  if v_sem_capacidade > 0 then v_missing := array_append(v_missing, 'capacity'); end if;

  return jsonb_build_object('ready', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing));
end $$;
revoke all on function public._hub_readiness(uuid) from public, anon, authenticated;
grant execute on function public._hub_readiness(uuid) to service_role;

create or replace function public.location_hub_readiness(p_location_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'location_hub_readiness: apenas hub_admin' using errcode = '42501';
  end if;
  return public._hub_readiness(p_location_id);
end $$;

-- security definer: o trigger roda com o papel de quem escreve (authenticated), e `_hub_readiness`
-- é só de service_role de propósito (exporia o pré-voo de qualquer empresa por RPC).
create or replace function public.location_listing_guard()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_readiness jsonb;
begin
  if new.is_listed and new.checkout_mode = 'hub'
     and (not coalesce(old.is_listed, false) or old.checkout_mode is distinct from 'hub')
     and auth.uid() is not null then
    v_readiness := public._hub_readiness(new.id);
    if not (v_readiness ->> 'ready')::boolean then
      raise exception
        'unidade nao pode ser listada no Hub antes do pre-voo: %', v_readiness::text
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists location_listing_guard on public.location;
create trigger location_listing_guard
  before update of is_listed, checkout_mode on public.location
  for each row execute function public.location_listing_guard();
