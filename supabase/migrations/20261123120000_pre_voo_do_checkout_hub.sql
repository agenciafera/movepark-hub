-- Pré-voo da virada para o checkout do Hub (23/09/2026). Spec: docs/specs/checkout-externo-por-local.md
-- Plano: docs/superpowers/plans/2026-09-23-venda-pelo-hub-e-beneficios.md
--
-- Virar para `external` tinha checagem (`location_external_readiness`); voltar para `hub` não tinha
-- nenhuma, e a virada vendia na hora com o buraco aparecendo na primeira compra: empresa silenciosa,
-- sem contrato, sem recebedor (o dinheiro cairia inteiro no master sem caminho de repasse: a Pagar.me
-- nunca liberou transferência entre recebedores), split desligado, vaga sem preço ou com capacidade
-- zero. A lista abaixo é o que a primeira venda de um parceiro real exige, medido em 23/09/2026.
--
-- Também libera o espelho de preço para unidade `hub` que ainda tem domínio white-label: decisão
-- do Kallef, o parceiro segue mudando preço onde sempre mudou e o Hub acompanha.

create or replace function public.location_hub_readiness(p_location_id uuid)
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
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'location_hub_readiness: apenas hub_admin' using errcode = '42501';
  end if;

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

  -- Mesma regra da Edge (`effectiveSplitEnabled`): global vale para todos; só 'false' desliga.
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
revoke all on function public.location_hub_readiness(uuid) from public, anon;
grant execute on function public.location_hub_readiness(uuid) to authenticated;

create or replace function public.location_checkout_mode_guard()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_readiness jsonb;
begin
  if tg_op = 'INSERT' and new.checkout_mode = 'hub' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.checkout_mode is not distinct from old.checkout_mode then
    return new;
  end if;

  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'checkout_mode so pode ser alterado por hub_admin' using errcode = '42501';
  end if;

  if new.checkout_mode = 'external' then
    v_readiness := public.location_external_readiness(new.id);
    if not (v_readiness ->> 'ready')::boolean then
      raise exception
        'unidade nao esta pronta para checkout externo: %', v_readiness::text
        using errcode = '23514';
    end if;
  end if;

  -- 23/09/2026: voltar de `external` para `hub` também passa pelo pré-voo. O que falta vai na
  -- mensagem, com os mesmos códigos que o diálogo do Manager traduz.
  if tg_op = 'UPDATE' and old.checkout_mode = 'external' and new.checkout_mode = 'hub' then
    v_readiness := public.location_hub_readiness(new.id);
    if not (v_readiness ->> 'ready')::boolean then
      raise exception
        'unidade nao esta pronta para vender pelo Hub: %', v_readiness::text
        using errcode = '23514';
    end if;
  end if;

  new.checkout_mode_changed_at := now();
  new.checkout_mode_changed_by := auth.uid();
  return new;
end $$;

-- Espelho de preço também para unidade hub com mapeamento white-label.
create or replace function public.wl_mirror_trigger(p_location_parking_type_id uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_checkout_mode text;
  v_wl_mapped boolean;
  v_wl_domain text;
  v_request_id bigint;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark dispara o espelho de preço.' using errcode = '42501';
  end if;

  select l.checkout_mode, (lpt.wl_category_slug is not null and lpt.wl_product_slug is not null), c.wl_domain
    into v_checkout_mode, v_wl_mapped, v_wl_domain
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  where lpt.id = p_location_parking_type_id;

  if v_checkout_mode is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(v_wl_domain, '')), '') is null then
    raise exception 'A empresa desta vaga não tem site white-label para espelhar.' using errcode = 'P0001';
  end if;
  if not v_wl_mapped then
    raise exception 'Esta vaga não tem mapeamento white-label (category/product slug).' using errcode = 'P0001';
  end if;

  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-price-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')
    ),
    body := jsonb_build_object('location_parking_type_id', p_location_parking_type_id),
    timeout_milliseconds := 180000
  ) into v_request_id;

  return jsonb_build_object('ok', true, 'queued', true, 'request_id', v_request_id);
end $$;
