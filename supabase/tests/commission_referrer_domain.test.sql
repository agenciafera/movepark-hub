-- pgTAP: regra de comissão casando pelo SITE de onde o cliente veio (18/11/2026).
-- Spec: docs/specs/comissao-por-origem.md, seção "Site de origem".
--
-- O que este arquivo tranca: uma reserva de quem chegou do site do estacionamento (Referer
-- `https://pareseguro.com/`) recebe o pacote da regra dele, com ou sem UTM, dentro da janela; e
-- um site cadastrado para uma empresa nunca reduz a comissão de outra. Transação com rollback.

begin;
select plan(27);

select has_column('public', 'commission_rule', 'referrer_domains', 'a regra guarda os sites de origem');

-- ── fixture ─────────────────────────────────────────────────────────────────
do $$
declare
  cust uuid := gen_random_uuid();
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  la   uuid := gen_random_uuid();
  lb   uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ref-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do update set role = 'customer';
  insert into public.company(id, name, slug, take_rate_bps) values (a, 'Ref A', 'ref-a', 2000), (b, 'Ref B', 'ref-b', 2000);
  insert into public.location(id, company_id, name, slug) values (la, a, 'Ref Loc A', 'ref-loc-a'), (lb, b, 'Ref Loc B', 'ref-loc-b');
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.a', a::text, false);
  perform set_config('test.b', b::text, false);
  perform set_config('test.la', la::text, false);
  perform set_config('test.lb', lb::text, false);
end $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── normalização do domínio ─────────────────────────────────────────────────
select is(public.commission_domain('https://WWW.Ref-A-Site.com.br:443/reserva?x=1#y'), 'ref-a-site.com.br',
  'o domínio sai sem esquema, www, porta, caminho, query e hash');
select is(public.commission_domain('ref-a-site.com.br/'), 'ref-a-site.com.br', 'sem esquema também funciona');
select is(public.commission_domain(''), null, 'texto vazio não vira domínio');

insert into public.commission_rule(id, company_id, name, utm_sources, referrer_domains, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values ('00000000-0000-0000-0000-0000000d0001', current_setting('test.a')::uuid, 'Site da Ref A',
          '{}', array['https://www.Ref-A-Site.com.br/', 'ref-a-site.com.br', ' '], 1200, 'partner', 'partner');

select is((select referrer_domains from public.commission_rule where id = '00000000-0000-0000-0000-0000000d0001'),
  array['ref-a-site.com.br'], 'os sites são normalizados no cadastro, sem repetido nem vazio');
select is((select utm_sources from public.commission_rule where id = '00000000-0000-0000-0000-0000000d0001'),
  '{}'::text[], 'regra só de site não precisa de UTM');

-- ── resolução pelo site ─────────────────────────────────────────────────────
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now() - interval '1 day', now(), 'https://ref-a-site.com.br/') ->> 'channel',
  'Site da Ref A', 'quem chega do site cadastrado casa a regra, sem UTM');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now(), 'https://www.ref-a-site.com.br/precos') ->> 'channel',
  'Site da Ref A', 'www e caminho não atrapalham');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now(), 'https://reservas.ref-a-site.com.br/') ->> 'channel',
  'Site da Ref A', 'subdomínio do site cadastrado também casa');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', 'google', now(), now(), 'https://ref-a-site.com.br/') ->> 'channel',
  'Site da Ref A', 'UTM de outra origem não tira a venda de quem veio do site cadastrado');
select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now(), 'https://ref-a-site.com.br/') ->> 'take_rate_bps')::int,
  1200, 'traz a comissão da regra');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now(), 'https://falso-ref-a-site.com.br/') ->> 'channel',
  'hub', 'domínio que só termina com o mesmo texto não casa');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now(), 'https://ref-a-site.com.br.golpe.com/') ->> 'channel',
  'hub', 'domínio que só começa com o mesmo texto não casa');
select is(public.resolve_commission(current_setting('test.b')::uuid, 'hub_direct', null, now(), now(), 'https://ref-a-site.com.br/') ->> 'channel',
  'hub', 'site cadastrado para uma empresa não vale em reserva de outra');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now() - interval '8 days', now(), 'https://ref-a-site.com.br/') ->> 'channel',
  'hub', 'chegada fora da janela de 7 dias não conta');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now() + interval '2 days', now(), 'https://ref-a-site.com.br/') ->> 'channel',
  'hub', 'chegada datada no futuro não casa');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_direct', null, now(), now()) ->> 'channel',
  'hub', 'a chamada antiga, sem referrer, segue funcionando');

-- ── cadastro ────────────────────────────────────────────────────────────────
select throws_ok($$insert into public.commission_rule(company_id, name, referrer_domains, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Duplicada', array['WWW.ref-a-site.com.br'], 800, 'movepark', 'each')$$, '23505', null,
  'o mesmo site não entra em duas regras ativas da mesma empresa');
select throws_ok($$insert into public.commission_rule(company_id, name, referrer_domains, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Inválido', array['ref a site'], 800, 'movepark', 'each')$$, '22023', null,
  'texto que não é domínio é recusado');
select throws_ok($$insert into public.commission_rule(company_id, name, referrer_domains, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Sem ponto', array['localhost'], 800, 'movepark', 'each')$$, '22023', null,
  'domínio sem ponto é recusado');
select throws_ok($$insert into public.commission_rule(company_id, name, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Nada', 800, 'movepark', 'each')$$, '23514', null,
  'regra sem UTM, sem site e sem white-label continua recusada');
select lives_ok($$insert into public.commission_rule(company_id, name, referrer_domains, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.b')::uuid, 'Mesmo site, outra empresa', array['ref-a-site.com.br'], 800, 'movepark', 'each')$$,
  'o mesmo site pode estar em regras de empresas diferentes');

-- ── congelamento na reserva ─────────────────────────────────────────────────
insert into public.commission_rule(id, company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values ('00000000-0000-0000-0000-0000000d0002', current_setting('test.a')::uuid, 'Campanha da Ref A',
          array['ref-a-campanha'], 1500, 'movepark', 'each');

insert into public.booking(id, code, profile_id, location_id, status, check_in_at, check_out_at, total_amount, origin) values
  ('00000000-0000-0000-0000-0000000db001', 'MP-REF-1', current_setting('test.cust')::uuid, current_setting('test.la')::uuid, 'pending', now() + interval '3 days', now() + interval '5 days', 100, 'hub_direct'),
  ('00000000-0000-0000-0000-0000000db002', 'MP-REF-2', current_setting('test.cust')::uuid, current_setting('test.la')::uuid, 'pending', now() + interval '3 days', now() + interval '5 days', 100, 'hub_direct'),
  ('00000000-0000-0000-0000-0000000db003', 'MP-REF-3', current_setting('test.cust')::uuid, current_setting('test.la')::uuid, 'pending', now() + interval '3 days', now() + interval '5 days', 100, 'hub_direct'),
  ('00000000-0000-0000-0000-0000000db004', 'MP-REF-4', current_setting('test.cust')::uuid, current_setting('test.la')::uuid, 'pending', now() + interval '3 days', now() + interval '5 days', 100, 'hub_direct'),
  ('00000000-0000-0000-0000-0000000db005', 'MP-REF-5', current_setting('test.cust')::uuid, current_setting('test.la')::uuid, 'pending', now() + interval '3 days', now() + interval '5 days', 100, 'hub_direct');

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000db001',
  jsonb_build_object('utm_source', null, 'clicked_at', null, 'referrer', null,
    'referrals', jsonb_build_array(jsonb_build_object('referrer', 'https://ref-a-site.com.br/', 'arrived_at', now() - interval '1 day', 'landing_url', '/')))) ->> 'channel',
  'Site da Ref A', 'reserva de quem chegou do site, sem UTM nenhum, congela a regra do site');

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000db002',
  jsonb_build_object('utm_source', 'ref-a-campanha', 'clicked_at', now() - interval '2 days', 'referrer', null,
    'referrals', jsonb_build_array(
      jsonb_build_object('referrer', 'https://www.google.com/', 'arrived_at', now() - interval '1 hour'),
      jsonb_build_object('referrer', 'https://ref-a-site.com.br/', 'arrived_at', now() - interval '1 day')))) ->> 'channel',
  'Site da Ref A', 'a chegada mais nova que casa uma regra vence o clique com UTM de antes; a do Google, sem regra, é ignorada');

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000db003',
  jsonb_build_object('utm_source', 'ref-a-campanha', 'clicked_at', now() - interval '2 days', 'referrer', null,
    'referrals', jsonb_build_array(jsonb_build_object('referrer', 'https://www.google.com/', 'arrived_at', now() - interval '1 hour')))) ->> 'channel',
  'Campanha da Ref A', 'visita vinda de site sem regra não apaga o clique no link do parceiro');

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000db004',
  jsonb_build_object('utm_source', 'google', 'clicked_at', now() - interval '1 day', 'referrer', 'https://ref-a-site.com.br/')) ->> 'channel',
  'Site da Ref A', 'clique com UTM de outra origem, saído do site cadastrado, é venda do site');

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000db005',
  jsonb_build_object('utm_source', null, 'clicked_at', null, 'referrer', null,
    'referrals', jsonb_build_array(jsonb_build_object('referrer', 'https://ref-a-site.com.br/')))) ->> 'channel',
  'hub', 'chegada sem a hora não prova janela e não casa');

select * from finish();
rollback;
