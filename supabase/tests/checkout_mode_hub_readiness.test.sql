-- pgTAP: pré-voo da virada `external → hub` (23/09/2026).
-- Spec: docs/specs/checkout-externo-por-local.md. Transação com rollback.
--
-- O que este arquivo tranca: uma unidade externa só volta a vender pelo Hub quando a empresa tem
-- contrato, recebedor ativo no gateway, split ligado, preço e capacidade em toda vaga. Antes a
-- virada era livre e o buraco aparecia na primeira compra do cliente.

begin;
select plan(13);

do $$
declare
  v_company uuid; v_loc uuid; v_pt uuid; v_cpt uuid; v_lpt uuid;
begin
  insert into public.company(name, slug, wl_domain, wl_public_domain, wl_tenant_key, wl_sync_enabled, take_rate_bps, status, onboarding_status)
    values ('Hub Pré-voo','hub-prevoo','hub-prevoo-app.movepark.co','hub-prevoo.movepark.co','hub-prevoo', false, 2000, 'active', 'active')
    returning id into v_company;
  insert into public.parking_type(code, name) values ('hubprevoo_coberta','Pré-voo Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  -- nasce hub (INSERT livre), mapeia o WL e vira external pelo caminho de sempre
  insert into public.location(company_id, name, slug) values (v_company, 'Pré-voo Unidade', 'hub-prevoo-unidade') returning id into v_loc;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active, wl_category_slug, wl_product_slug)
    values (v_loc, v_cpt, 0, true, 'aeroporto', 'coberta') returning id into v_lpt;
  update public.location set checkout_mode = 'external' where id = v_loc;
  perform set_config('test.company', v_company::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

select is((select checkout_mode from public.location where id = current_setting('test.loc')::uuid), 'external', 'fixture: unidade externa');

-- ── o pré-voo diz tudo que falta ────────────────────────────────────────────
select is((public.location_hub_readiness(current_setting('test.loc')::uuid) ->> 'ready')::boolean, false,
  'empresa recém-criada não está pronta para vender pelo Hub');
select set_eq(
  $$select jsonb_array_elements_text(public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing')$$,
  array['contract', 'recipient', 'split', 'pricing', 'capacity'],
  'faltam contrato, recebedor, split, preço e capacidade (take_rate e relação vêm prontos)');

select throws_ok(
  $$update public.location set checkout_mode = 'hub' where id = current_setting('test.loc')::uuid$$,
  '23514', null, 'a virada para hub é recusada enquanto falta algo');
select is((select checkout_mode from public.location where id = current_setting('test.loc')::uuid), 'external', 'continua externa');

-- ── cada item resolvido sai da lista ────────────────────────────────────────
update public.company set contract_accepted_at = now(), contract_version = 'v1' where id = current_setting('test.company')::uuid;
insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
  values (current_setting('test.company')::uuid, 'pagarme', 're_prevoo', 'pending');
select ok((public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing') ? 'recipient',
  'recebedor pendente ainda conta como faltando');
update public.payout_recipient set status = 'active', gateway_missing_at = now() where company_id = current_setting('test.company')::uuid;
select ok((public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing') ? 'recipient',
  'recebedor que o gateway não reconhece ainda conta como faltando');
update public.payout_recipient set gateway_missing_at = null where company_id = current_setting('test.company')::uuid;
select ok(not ((public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing') ? 'recipient'),
  'recebedor ativo e reconhecido sai da lista');

update public.company set gateway_split_enabled = true where id = current_setting('test.company')::uuid;
update public.location_parking_type set capacity = 50 where id = current_setting('test.lpt')::uuid;
insert into public.pricing_rule(location_parking_type_id, strategy) values (current_setting('test.lpt')::uuid, 'uniform_by_duration');
select is(public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing', '[]'::jsonb, 'com tudo resolvido, nada falta');

select lives_ok($$update public.location set checkout_mode = 'hub' where id = current_setting('test.loc')::uuid$$,
  'a virada para hub passa com o pré-voo verde');
select is((select checkout_mode from public.location where id = current_setting('test.loc')::uuid), 'hub', 'unidade agora é hub');

-- empresa silenciosa nunca vende pelo Hub
update public.company set hub_relationship = 'silent' where id = current_setting('test.company')::uuid;
select ok((public.location_hub_readiness(current_setting('test.loc')::uuid) -> 'missing') ? 'hub_relationship',
  'empresa silenciosa aparece como impedimento');

-- espelho de preço liberado para unidade hub com mapeamento WL (só a checagem; o http_post fica no rollback)
select has_function('public', 'wl_mirror_trigger', array['uuid'], 'wl_mirror_trigger existe');

select * from finish();
rollback;
