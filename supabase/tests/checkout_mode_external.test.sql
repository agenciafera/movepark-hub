-- pgTAP: E0.14 · modo de checkout por local e relação silenciosa com o parceiro.
-- Spec: docs/specs/checkout-externo-por-local.md
--
-- O que este arquivo protege:
--   1. checkout_mode é regra dura (só hub_admin), não escopo delegável;
--   2. pré-voo impede ligar external com De/Para incompleto;
--   3. a URL de saída sempre sai com a marcação de afiliado (é receita, não enfeite);
--   4. empresa silenciosa não ganha onboarding, recebedor nem usuário.

begin;
select plan(24);

-- ── fixtures (como postgres; RLS não se aplica) ────────────────────────────
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_gerente uuid := gen_random_uuid();
  v_company uuid;
  v_silent uuid;
  v_loc uuid;
  v_pt uuid;
  v_cpt uuid;
  v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e014-admin@ex.com',now(),now()),
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e014-gerente@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_gerente,'company_operator') on conflict (id) do nothing;

  insert into public.company(name, slug, wl_domain, wl_tenant_key, wl_sync_enabled)
    values ('E014 Parceiro','e014-parceiro','e014-app.movepark.co','e014', false)
    returning id into v_company;

  insert into public.company(name, slug) values ('E014 Silenciosa','e014-silenciosa')
    returning id into v_silent;

  insert into public.profile_company(profile_id, company_id, role)
    values (v_gerente, v_company, 'manager');

  insert into public.location(company_id, name, slug)
    values (v_company, 'E014 Unidade', 'e014-unidade') returning id into v_loc;

  insert into public.parking_type(code, name) values ('e014_coberta','E014 Coberta')
    returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt, 10, true) returning id into v_lpt;

  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.gerente', v_gerente::text, false);
  perform set_config('test.company', v_company::text, false);
  perform set_config('test.silent', v_silent::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_column('public','location','checkout_mode','location.checkout_mode existe');
select has_column('public','location','checkout_mode_changed_by','carimbo de quem mudou existe');
select has_column('public','company','hub_relationship','company.hub_relationship existe');
select has_column('public','company','wl_public_domain','company.wl_public_domain existe (frontend, não o backend)');

select is(
  (select checkout_mode from public.location where id = current_setting('test.loc')::uuid),
  'hub', 'unidade nasce com checkout no Hub'
);
select is(
  (select hub_relationship from public.company where id = current_setting('test.company')::uuid),
  'onboarded', 'empresa nasce onboarded (nada muda para quem já está no ar)'
);

select throws_ok(
  format($$ update public.location set checkout_mode = 'wl' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'checkout_mode só aceita hub ou external'
);

-- ── pré-voo ────────────────────────────────────────────────────────────────
-- Falta wl_public_domain na empresa e o De/Para do tipo de vaga.
select is(
  (public.location_external_readiness(current_setting('test.loc')::uuid) ->> 'ready')::boolean,
  false, 'pré-voo reprova com empresa e De/Para incompletos'
);
select is(
  (public.location_external_readiness(current_setting('test.loc')::uuid) -> 'missing_company')::text,
  '["wl_public_domain"]', 'pré-voo diz qual campo da empresa falta'
);
select is(
  (public.location_external_readiness(current_setting('test.loc')::uuid) ->> 'unmapped_count')::int,
  1, 'pré-voo conta o tipo de vaga sem mapeamento'
);

select throws_ok(
  format($$ update public.location set checkout_mode = 'external' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'não liga external sem passar no pré-voo'
);

-- Completa a configuração e o pré-voo libera.
update public.company set wl_public_domain = 'https://e014.movepark.co/'
  where id = current_setting('test.company')::uuid;
update public.location_parking_type
  set wl_category_slug = 'e014', wl_product_slug = 'vaga-coberta'
  where id = current_setting('test.lpt')::uuid;

select is(
  (public.location_external_readiness(current_setting('test.loc')::uuid) ->> 'ready')::boolean,
  true, 'pré-voo aprova com empresa e De/Para completos'
);

-- ── quem pode mudar ────────────────────────────────────────────────────────
-- Gerente tem locations:write e passa na RLS de UPDATE, mas esbarra na regra dura.
set local role authenticated;
select pg_temp.as_user(current_setting('test.gerente'));
select throws_ok(
  format($$ update public.location set checkout_mode = 'external' where id = %L $$, current_setting('test.loc')),
  '42501', null, 'gerente com locations:write NÃO muda checkout_mode'
);
select lives_ok(
  format($$ update public.location set name = 'E014 Unidade renomeada' where id = %L $$, current_setting('test.loc')),
  'gerente continua editando o resto da unidade'
);
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.admin'));
select lives_ok(
  format($$ update public.location set checkout_mode = 'external' where id = %L $$, current_setting('test.loc')),
  'hub_admin liga o checkout externo'
);
reset role;

select is(
  (select checkout_mode_changed_by from public.location where id = current_setting('test.loc')::uuid),
  current_setting('test.admin')::uuid,
  'a virada fica carimbada com quem mudou'
);

-- ── URL de saída ───────────────────────────────────────────────────────────
-- A marcação de afiliado separa 17% de 9% de participação. Se sumir, nenhum relatório avisa.
select is(
  (select public.external_checkout_url(lpt) from public.location_parking_type lpt
    where lpt.id = current_setting('test.lpt')::uuid),
  'https://e014.movepark.co/e014/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark',
  'URL de saída compõe host público + De/Para + marcação de afiliado'
);

-- Quem grava o De/Para é o parceiro, não a Movepark. Um slug com "?" fecharia a URL antes dos
-- nossos parâmetros e a marcação de afiliado sumiria calada. Sem link é melhor que link torto.
update public.location_parking_type set wl_product_slug = 'vaga-coberta?x='
  where id = current_setting('test.lpt')::uuid;
select is(
  (select public.external_checkout_url(lpt) from public.location_parking_type lpt
    where lpt.id = current_setting('test.lpt')::uuid),
  null, 'slug com caractere de URL não gera link'
);
select is(
  (public.location_external_readiness(current_setting('test.loc')::uuid) ->> 'ready')::boolean,
  false, 'pré-voo reprova slug malformado'
);
update public.location_parking_type set wl_product_slug = 'vaga-coberta'
  where id = current_setting('test.lpt')::uuid;

update public.location set checkout_mode = 'hub' where id = current_setting('test.loc')::uuid;
select is(
  (select public.external_checkout_url(lpt) from public.location_parking_type lpt
    where lpt.id = current_setting('test.lpt')::uuid),
  null, 'unidade que fecha no Hub não tem URL de saída'
);

-- ── guardas de silêncio ────────────────────────────────────────────────────
update public.company set hub_relationship = 'silent' where id = current_setting('test.silent')::uuid;

select throws_ok(
  format($$ insert into public.profile_company(profile_id, company_id, role)
            values (%L, %L, 'owner') $$, current_setting('test.gerente'), current_setting('test.silent')),
  '42501', null, 'empresa silenciosa não ganha usuário'
);

select throws_ok(
  format($$ insert into public.payout_recipient(company_id, provider) values (%L, 'pagarme') $$,
         current_setting('test.silent')),
  '42501', null, 'empresa silenciosa não ganha recebedor de repasse'
);

-- Recebedor que já existia continua reconciliando. O cron `refresh-recipients` atualiza o status
-- desses registros a cada volta; se a guarda pegasse UPDATE, silenciar a empresa quebraria o cron
-- justamente para quem tem recebedor (é o caso do Virapark).
do $$
declare v_rec uuid;
begin
  insert into public.payout_recipient(company_id, provider, external_recipient_id)
    values (current_setting('test.company')::uuid, 'pagarme', 're_e014')
    returning id into v_rec;
  update public.company set hub_relationship = 'silent'
    where id = current_setting('test.company')::uuid;
  perform set_config('test.recipient', v_rec::text, false);
end $$;

select lives_ok(
  format($$ update public.payout_recipient set last_provider_status = 'active' where id = %L $$,
         current_setting('test.recipient')),
  'recebedor existente continua reconciliando com a empresa silenciosa'
);

select throws_ok(
  format($$ update public.payout_recipient set company_id = %L where id = %L $$,
         current_setting('test.silent'), current_setting('test.recipient')),
  '42501', null, 'mudar o recebedor DE empresa para uma silenciosa é entrada disfarçada'
);

select * from finish();
rollback;
