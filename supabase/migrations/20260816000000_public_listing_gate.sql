-- Public-listing gate (correção do vazamento do E1.9).
--
-- Problema: onboarding_publish fazia go-live TOTAL no clique "Publicar" (status/is_active ativos),
-- e a unidade caía direto na busca e na URL pública /p/... sem ter recebedor (não podia vender).
-- A "preview travada" da spec (dono vê logado; público só no go-live real) nunca existiu no schema.
--
-- Correção: nova flag public.location.is_listed, SEPARADA de status/is_active. A leitura pública
-- (RLS catalog_read_location + filtros no SSG/listing/search) passa a exigir is_listed. O dono
-- continua vendo o preview pela RLS de dono (location_select), que ignora is_listed. A flag liga
-- AUTOMATICAMENTE quando a empresa "pode receber" (payout_recipient.status='active', ADR-004): no
-- próprio publish se já ativo, ou via trigger quando ficar. As unidades já ativas hoje são
-- preservadas (grandfather) para não esvaziar o catálogo.
-- Ver docs/specs/partner-onboarding-redesign.md e payment-split.md (ADR-004).

-- 1. Flag de listagem pública.
alter table public.location
  add column if not exists is_listed boolean not null default false;

comment on column public.location.is_listed is
  'Unidade aparece na busca e na URL pública (/p/...). Liga só quando a empresa tem payout_recipient '
  'active (auto: no publish ou via trigger list_locations_on_recipient_active). O preview do dono '
  'ignora isto (RLS location_select). Ver spec partner-onboarding-redesign.md.';

-- 2. Grandfather: tudo que já está ativo hoje continua listado (não esvaziar o catálogo de demo).
update public.location set is_listed = true
  where deleted_at is null and status = 'active';

-- 3. Auto go-live: quando o recebedor da empresa fica 'active', lista as unidades ativas dela.
--    Monotônico: só LIGA is_listed, nunca desliga (não derruba o catálogo grandfathered).
create or replace function public.list_locations_on_recipient_active()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if new.status = 'active'
     and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.location
      set is_listed = true
      where company_id = new.company_id
        and status = 'active'
        and deleted_at is null
        and not is_listed;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_list_on_recipient_active on public.payout_recipient;
create trigger trg_list_on_recipient_active
  after insert or update of status on public.payout_recipient
  for each row execute function public.list_locations_on_recipient_active();

-- 4. onboarding_publish: NÃO joga direto na busca. Mantém a unidade ativa/configurada (para o
--    preview do dono) e só marca is_listed se a empresa já pode receber. Caso contrário, o trigger
--    acima liga quando o recebedor ficar active. Monotônico no is_listed (não desliga o que já
--    estava listado). Resto idêntico à versão anterior (20260802000000).
create or replace function public.onboarding_publish(p_company_id uuid)
  returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
declare v_lpt record; v_rule_id uuid; v_can_receive boolean;
begin
  perform public.onboarding_assert_editable(p_company_id);

  if not exists (
    select 1
    from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    where l.company_id = p_company_id and lpt.capacity > 0 and cpt.base_price > 0
  ) then
    raise exception 'Cadastre ao menos um tipo de vaga com capacidade e preço de balcão antes de publicar.'
      using errcode = 'P0001';
  end if;

  for v_lpt in
    select lpt.id as lpt_id, cpt.base_price
    from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    where l.company_id = p_company_id and lpt.capacity > 0 and cpt.base_price > 0
      and not exists (select 1 from public.pricing_rule pr where pr.location_parking_type_id = lpt.id)
  loop
    insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
    values (v_lpt.lpt_id, 'uniform_by_duration', 'any_extra', 'none')
    returning id into v_rule_id;
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, 1, null, v_lpt.base_price, null, false);
  end loop;

  -- a empresa já pode receber?
  select exists (
    select 1 from public.payout_recipient pr
    where pr.company_id = p_company_id and pr.status = 'active' and pr.deleted_at is null
  ) into v_can_receive;

  -- go-live interno; a LISTAGEM pública só liga se já pode receber (senão, o trigger liga depois).
  update public.company set status = 'active', onboarding_status = 'active' where id = p_company_id;
  update public.location set status = 'active', is_listed = (is_listed or v_can_receive)
    where company_id = p_company_id;
  update public.company_parking_type set is_active = true where company_id = p_company_id;
  update public.location_parking_type lpt set is_active = true
    from public.location l
    where lpt.location_id = l.id and l.company_id = p_company_id and lpt.capacity > 0;
  update public.company_onboarding
    set setup_submitted_at = now(), went_live_at = now(), current_step = 6
    where company_id = p_company_id;
end; $$;

alter function public.onboarding_publish(uuid) owner to postgres;
revoke all on function public.onboarding_publish(uuid) from public, anon;
grant execute on function public.onboarding_publish(uuid) to authenticated, service_role;

-- 5. RLS: leitura pública de location passa a exigir is_listed. O dono lê pela location_select
--    (não afetada), então o preview travado continua funcionando.
drop policy if exists "catalog_read_location" on public.location;
create policy "catalog_read_location" on public.location
  for select to authenticated, anon
  using (deleted_at is null and status = 'active' and is_listed);

-- Trigger function não é chamável via RPC (roda pelo trigger, como owner).
revoke all on function public.list_locations_on_recipient_active() from public, anon, authenticated;
