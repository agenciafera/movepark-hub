-- pgTAP: cadeia de RPCs do onboarding de parceiro (Stage 1 lead → wizard → go-live).
-- Rodar com: supabase test db (requer stack local com schema completo — ver README.md).
-- Tudo em transação com rollback — não suja o seed.

begin;
select plan(12);

-- ── slugify ──────────────────────────────────────────────────────────────
select is(public.slugify('São Paulo #1'), 'sao-paulo-1', 'slugify normaliza acentos e símbolos');
select is(public.slugify('  Vaga   Coberta  '), 'vaga-coberta', 'slugify colapsa espaços e trim');
select is(public.slugify(''), '', 'slugify de vazio é vazio');

-- ── Stage 1: submit_partner_lead cria company (inactive/pending) + onboarding ──
do $$
declare v_cid uuid;
begin
  v_cid := public.submit_partner_lead('Estac Teste QA','Op QA','qa-pgtap@example.com','+5511999990000');
  perform set_config('test.cid', v_cid::text, false);
end $$;

select is(
  (select status::text from public.company where id = current_setting('test.cid')::uuid),
  'inactive', 'lead cria company inactive');
select is(
  (select onboarding_status::text from public.company where id = current_setting('test.cid')::uuid),
  'pending_review', 'lead cria company pending_review');
select is(
  (select contact_email from public.company_onboarding where company_id = current_setting('test.cid')::uuid),
  'qa-pgtap@example.com', 'company_onboarding gravado');

-- slug único: um segundo lead com mesmo nome ganha sufixo
select ok(
  public.generate_unique_company_slug('Estac Teste QA') like 'estac-teste-qa-%',
  'slug colidente recebe sufixo numérico');

-- ── fixture de auth: vincula um usuário operador e aprova ──────────────────
do $$
declare v_uid uuid := gen_random_uuid(); v_cid uuid := current_setting('test.cid')::uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-op-pgtap@example.com', now(), now());
  -- cria profiles explicitamente (o trigger on_auth_user_created vive no schema auth,
  -- fora do baseline public; o teste não deve depender dele)
  insert into public.profiles(id, role) values (v_uid, 'company_operator') on conflict (id) do nothing;
  update public.company set onboarding_status='approved' where id=v_cid;
  insert into public.profile_company(profile_id, company_id) values (v_uid, v_cid);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
end $$;

-- ── Stage 2: wizard ────────────────────────────────────────────────────────
do $$
declare v_cid uuid := current_setting('test.cid')::uuid; v_lid uuid; v_lpt uuid;
begin
  perform public.onboarding_update_company(v_cid, 'Estac Teste QA', 'Razao QA', '12345678000100', null);
  v_lid := public.onboarding_upsert_location(v_cid, null, 'Unidade QA', 'Rua X', -23.5, -46.6,
            'America/Sao_Paulo', null, null, null, '[]'::jsonb);
  perform set_config('test.lid', v_lid::text, false);
  perform public.onboarding_set_parking_types(v_cid, v_lid,
    (select jsonb_agg(jsonb_build_object('parking_type_id', id, 'base_price', 30, 'capacity', 10))
     from (select id from public.parking_type limit 1) s));
  select lpt.id into v_lpt from public.location_parking_type lpt where lpt.location_id=v_lid limit 1;
  perform public.onboarding_set_pricing(v_cid, v_lpt, 'uniform_by_duration',
    jsonb_build_array(jsonb_build_object('from_day',1,'to_day',null,'unit_price',30)));
end $$;

-- assert_editable transicionou approved → in_progress no primeiro save
select is(
  (select onboarding_status::text from public.company where id = current_setting('test.cid')::uuid),
  'in_progress', 'primeiro save transiciona para in_progress');

-- localização criada inativa (não vaza no catálogo antes do go-live)
select is(
  (select status::text from public.location where id = current_setting('test.lid')::uuid),
  'inactive', 'location criada inativa');

-- ── go-live ────────────────────────────────────────────────────────────────
do $$ begin perform public.onboarding_submit(current_setting('test.cid')::uuid); end $$;

select is(
  (select onboarding_status::text from public.company where id = current_setting('test.cid')::uuid),
  'active', 'onboarding_submit publica a empresa (active)');
select is(
  (select status::text from public.location where id = current_setting('test.lid')::uuid),
  'active', 'go-live ativa a location');
select ok(
  exists(select 1 from public.location_parking_type lpt
         where lpt.location_id = current_setting('test.lid')::uuid and lpt.is_active and lpt.capacity > 0),
  'go-live ativa tipo de vaga com capacidade');

select * from finish();
rollback;
