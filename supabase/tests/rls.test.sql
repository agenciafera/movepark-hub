-- pgTAP: Row Level Security. Verifica visibilidade por papel (anon / customer /
-- company_operator / hub_admin). Roda em transação com rollback.

begin;
select plan(8);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ────────────────
do $$
declare
  u1 uuid := gen_random_uuid();   -- customer dono do booking
  u2 uuid := gen_random_uuid();   -- outro customer
  uop uuid := gen_random_uuid();  -- operador
  cid uuid;                        -- empresa parceira (lead)
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-c1@ex.com',now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-c2@ex.com',now(),now()),
    (uop,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-op@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (u1,'customer'),(u2,'customer'),(uop,'company_operator') on conflict (id) do nothing;

  -- booking do u1 numa location do seed
  select id into v_loc from public.location limit 1;
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at)
    values ('RLS-TEST-1', u1, v_loc, now() + interval '1 day', now() + interval '3 day');

  -- empresa parceira + operador vinculado
  cid := public.submit_partner_lead('RLS Parceira','Op RLS','rls-op@ex.com','+5511999990000');
  insert into public.profile_company(profile_id, company_id) values (uop, cid);

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.uop', uop::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── anon ───────────────────────────────────────────────────────────────────
set local role anon;
select isnt_empty('select 1 from public.company limit 1', 'anon lê catálogo (company ativa)');
select is_empty('select 1 from public.booking', 'anon NÃO lê booking');
select is_empty('select 1 from public.profiles', 'anon NÃO lê profiles');
reset role;

-- ── customer dono ───────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u1'));
select isnt_empty('select 1 from public.booking', 'customer vê o PRÓPRIO booking');
select is_empty('select 1 from public.company_onboarding', 'customer NÃO vê onboarding de parceiro');
reset role;

-- ── outro customer ──────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u2'));
select is_empty('select 1 from public.booking', 'customer NÃO vê booking de outro');
reset role;

-- ── operador ────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uop'));
select isnt_empty('select 1 from public.company_onboarding', 'operador vê o onboarding da PRÓPRIA empresa');
reset role;

-- ── hub_admin (não setado; usa um admin do seed? aqui validamos via role) ────
-- cria um hub_admin e confirma acesso total ao onboarding
do $$
declare ua uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-admin@ex.com',now(),now());
  insert into public.profiles(id, role) values (ua,'hub_admin') on conflict (id) do nothing;
  perform set_config('test.ua', ua::text, false);
end $$;
set local role authenticated;
select pg_temp.as_user(current_setting('test.ua'));
select isnt_empty('select 1 from public.company_onboarding', 'hub_admin vê onboarding de qualquer empresa');
reset role;

select * from finish();
rollback;
