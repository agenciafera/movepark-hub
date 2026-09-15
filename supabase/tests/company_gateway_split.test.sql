-- pgTAP: split por empresa (E0.3.5). A marca só liga com recebedor ativo e reconhecido pelo
-- gateway, e só hub_admin mexe. Transação com rollback.

begin;
select plan(8);

select has_column('public', 'company', 'gateway_split_enabled', 'company.gateway_split_enabled existe');
select col_default_is('public', 'company', 'gateway_split_enabled', 'false', 'nasce desligado: ninguém entra no split sem alguém ligar');

do $$
declare adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Split Com Recebedor', 'split-com-recebedor');
  insert into public.company(id, name, slug) values (cid2, 'Split Sem Recebedor', 'split-sem-recebedor');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_split_ok', 'active');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.cid', cid::text, false);
  perform set_config('test.cid2', cid2::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);

select lives_ok(
  format($$ select public.company_set_gateway_split(%L::uuid, true) $$, current_setting('test.cid')),
  'hub_admin liga o split de empresa com recebedor ativo');
select is(
  (select gateway_split_enabled from public.company where id = current_setting('test.cid')::uuid),
  true, 'a marca ficou gravada');

select throws_ok(
  format($$ select public.company_set_gateway_split(%L::uuid, true) $$, current_setting('test.cid2')),
  'P0001', null, 'sem recebedor ativo a RPC recusa ligar');

-- recebedor que o gateway não reconhece também não liga
update public.payout_recipient set gateway_missing_at = now() where company_id = current_setting('test.cid')::uuid;
select throws_ok(
  format($$ select public.company_set_gateway_split(%L::uuid, true) $$, current_setting('test.cid')),
  'P0001', null, 'recebedor sumido no gateway não liga o split');
select lives_ok(
  format($$ select public.company_set_gateway_split(%L::uuid, false) $$, current_setting('test.cid')),
  'desligar é sempre permitido');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.company_set_gateway_split(%L::uuid, true) $$, current_setting('test.cid')),
  '42501', null, 'quem não é hub_admin não mexe');
reset role;

select * from finish();
rollback;
