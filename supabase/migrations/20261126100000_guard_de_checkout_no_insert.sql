-- O pré-voo do checkout externo volta a funcionar no INSERT (26/09/2026).
--
-- A migration 20261123120000 (pré-voo do checkout hub) reescreveu `location_checkout_mode_guard`
-- e, sem querer, desfez o conserto de 20261016094000: o ramo `external` voltou a chamar
-- `location_external_readiness(new.id)`, que em BEFORE INSERT não acha a linha e cai em
-- "unidade não encontrada" (P0002). Criar unidade já em `external` ficou impossível de novo, e o
-- job db do CI (coupon_wallet, external_exit_click, checkout_mode_external) ficou vermelho.
--
-- O ramo passa a usar `_external_readiness(new.company_id, new.id)`, endereçado pela empresa,
-- que serve para INSERT e UPDATE. O resto do guard (hub_admin, volta para o Hub pelo pré-voo do
-- Hub, carimbos) fica como estava.

-- O miolo pela empresa (20261016094000) não existe no banco vivo, embora a migration conste como
-- aplicada: `location_external_readiness` chama uma função que não está lá. Recriado aqui, idêntico,
-- para a migration valer nos dois ambientes.
create or replace function public._external_readiness(
  p_company_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text[];
  v_unmapped_names text[];
begin
  -- Mesma régua da função pública: sem JWT é backend (service role, migration, seed); com JWT,
  -- só hub_admin. O gatilho já barrou antes de chegar aqui, e repetir custa nada.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception '_external_readiness: apenas hub_admin' using errcode = '42501';
  end if;

  select array_remove(
    array[
      case when public.wl_public_host(c.wl_public_domain) is null then 'wl_public_domain' end,
      case when nullif(btrim(coalesce(c.wl_domain, '')), '') is null then 'wl_domain' end,
      case when nullif(btrim(coalesce(c.wl_tenant_key, '')), '') is null then 'wl_tenant_key' end
    ],
    null
  )
  into v_missing
  from public.company c
  where c.id = p_company_id;

  if v_missing is null then
    raise exception '_external_readiness: empresa % não encontrada', p_company_id
      using errcode = 'P0002';
  end if;

  -- No INSERT este select não devolve nada, e é o esperado: a unidade ainda não tem vaga.
  select coalesce(array_agg(pt.name order by pt.name), '{}'::text[])
  into v_unmapped_names
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.location_id = p_location_id
    and lpt.is_active
    and not (
      public.wl_slug_safe(lpt.wl_category_slug) and public.wl_slug_safe(lpt.wl_product_slug)
    );

  return jsonb_build_object(
    'ready', cardinality(v_missing) = 0 and cardinality(v_unmapped_names) = 0,
    'missing_company', to_jsonb(v_missing),
    'unmapped_count', cardinality(v_unmapped_names),
    'unmapped_names', to_jsonb(v_unmapped_names)
  );
end;
$$;

comment on function public._external_readiness(uuid, uuid) is
  'Miolo do pré-voo do checkout externo, endereçado pela empresa. Existe para o BEFORE INSERT de location, onde ainda não há linha em public.location para consultar. Use location_external_readiness(uuid) fora do gatilho.';

-- Função nova no schema public nasce executável por anon (default privilege). O revoke é nominal
-- de propósito: `from public` sozinho não tira o que anon já herdou.
revoke all on function public._external_readiness(uuid, uuid) from public, anon;
grant execute on function public._external_readiness(uuid, uuid) to authenticated, service_role;

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
    -- Pela empresa: no BEFORE INSERT a unidade ainda não existe em public.location.
    v_readiness := public._external_readiness(new.company_id, new.id);
    if not (v_readiness ->> 'ready')::boolean then
      raise exception
        'unidade nao esta pronta para checkout externo: %', v_readiness::text
        using errcode = '23514';
    end if;
  end if;

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
