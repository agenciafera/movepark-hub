-- pgTAP: comissão por origem da venda (E0.3.12).
-- Spec: docs/specs/comissao-por-origem.md
--
-- O que este arquivo tranca: qual pacote (comissão, quem paga a taxa do gateway, quem arca com
-- chargeback) uma reserva recebe conforme a origem. Errar aqui é cobrar 20% de quem trouxe o
-- próprio cliente, ou dar comissão reduzida a quem não trouxe, e o split já vai errado ao gateway.
-- Transação com rollback.

begin;
select plan(49);

-- ── schema ──────────────────────────────────────────────────────────────────
select has_table('public', 'commission_rule', 'commission_rule existe');
select has_table('public', 'booking_commission_override', 'booking_commission_override existe');
select has_column('public', 'booking', 'commission_take_rate_bps', 'booking guarda a comissão congelada');
select has_column('public', 'booking', 'attribution', 'booking guarda a prova da origem');

-- ── fixture ─────────────────────────────────────────────────────────────────
do $$
declare
  cust uuid := gen_random_uuid();
  adm  uuid := gen_random_uuid();
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  la   uuid := gen_random_uuid();
  lb   uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','comm-cust@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','comm-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do update set role = 'customer';
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.company(id, name, slug, take_rate_bps) values (a, 'Comm A', 'comm-a', 2000), (b, 'Comm B', 'comm-b', 1800);
  insert into public.location(id, company_id, name, slug) values (la, a, 'Comm Loc A', 'comm-loc-a'), (lb, b, 'Comm Loc B', 'comm-loc-b');
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.a', a::text, false);
  perform set_config('test.b', b::text, false);
  perform set_config('test.la', la::text, false);
  perform set_config('test.lb', lb::text, false);
end $$;

-- A partir daqui as funções enxergam service_role (é como as Edges chamam).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── sem regra: padrão do Hub ────────────────────────────────────────────────
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'channel', 'hub',
  'sem regra cadastrada, qualquer UTM cai no padrão do Hub');
select is((public.resolve_commission(current_setting('test.b')::uuid, 'hub_search', null, null, now()) ->> 'take_rate_bps')::int, 1800,
  'o padrão do Hub usa o take_rate da empresa');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', null, null, now()) ->> 'fee_payer', 'movepark',
  'no padrão do Hub a Movepark paga a taxa do gateway');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', null, null, now()) ->> 'chargeback_bearer', 'each',
  'no padrão do Hub cada um arca com a sua parte do chargeback');

-- ── regras ──────────────────────────────────────────────────────────────────
insert into public.commission_rule(id, company_id, name, utm_sources, match_white_label, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values ('00000000-0000-0000-0000-0000000c0001', current_setting('test.a')::uuid, 'Site do parceiro',
          array['  Comm-A-Site ', 'comm-a-insta', 'comm-a-site', ''], true, 500, 'partner', 'partner');

select is((select utm_sources from public.commission_rule where id = '00000000-0000-0000-0000-0000000c0001'),
  array['comm-a-insta', 'comm-a-site'], 'os UTMs são normalizados: minúsculas, sem espaço, sem vazio, sem repetido');

select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'COMM-A-SITE', now() - interval '2 days', now()) ->> 'take_rate_bps')::int, 500,
  'UTM cadastrado para a empresa casa (sem diferenciar maiúsculas) e traz a comissão da regra');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'fee_payer', 'partner',
  'a regra decide quem paga a taxa do gateway');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'chargeback_bearer', 'partner',
  'a regra decide quem arca com chargeback');
select is(public.resolve_commission(current_setting('test.b')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'channel', 'hub',
  'UTM de uma empresa não vale em reserva de outra');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'google', now(), now()) ->> 'channel', 'hub',
  'UTM que ninguém cadastrou cai no Hub');

-- janela de 7 dias, último clique
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now() - interval '8 days', now()) ->> 'channel', 'hub',
  'clique fora da janela de 7 dias não conta');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now() - interval '6 days 23 hours', now()) ->> 'channel', 'Site do parceiro',
  'clique dentro da janela conta');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', null, now()) ->> 'channel', 'Site do parceiro',
  'sem data do clique (cliente antigo, API) vale a hora da reserva');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now() + interval '2 days', now()) ->> 'channel', 'hub',
  'clique datado no futuro é prova forjada e não casa');

-- white-label
select is(public.resolve_commission(current_setting('test.a')::uuid, 'white_label', null, null, now()) ->> 'channel', 'Site do parceiro',
  'o site white-label da empresa casa sozinho, sem UTM');
select is(public.resolve_commission(current_setting('test.b')::uuid, 'white_label', null, null, now()) ->> 'channel', 'hub',
  'white-label de empresa sem regra cai no Hub');

-- global x empresa, prioridade, vigência
insert into public.commission_rule(id, company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer, priority)
  values ('00000000-0000-0000-0000-0000000c0002', null, 'Parceria global', array['parceria', 'comm-a-site'], 1000, 'movepark', 'movepark', 99);
select is(public.resolve_commission(current_setting('test.b')::uuid, 'hub_search', 'parceria', now(), now()) ->> 'channel', 'Parceria global',
  'regra global vale para qualquer empresa');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'channel', 'Site do parceiro',
  'a regra da empresa vence a global, mesmo com prioridade menor');

update public.commission_rule set valid_until = now() - interval '1 day', valid_from = now() - interval '10 days'
 where id = '00000000-0000-0000-0000-0000000c0001';
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now()) ->> 'channel', 'Parceria global',
  'regra fora da vigência sai do jogo e a global assume');
update public.commission_rule set valid_until = null, valid_from = null where id = '00000000-0000-0000-0000-0000000c0001';

select throws_ok($$insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Duplicada', array['COMM-A-INSTA'], 800, 'movepark', 'each')$$, '23505', null,
  'o mesmo utm_source não entra em duas regras ativas da mesma empresa');
select throws_ok($$insert into public.commission_rule(company_id, name, utm_sources, match_white_label, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (null, 'WL global', array['x'], true, 800, 'movepark', 'each')$$, '23514', null,
  'regra global não casa por white-label');
select throws_ok($$insert into public.commission_rule(company_id, name, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Vazia', 800, 'movepark', 'each')$$, '23514', null,
  'regra que não reconhece origem nenhuma é recusada');

-- ── congelamento na reserva ─────────────────────────────────────────────────
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin, utm_source)
  values ('00000000-0000-0000-0000-0000000b0001', 'MP-COMM-1', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'hub_search', null);

select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000b0001',
    jsonb_build_object('utm_source', 'comm-a-insta', 'utm_medium', 'social', 'clicked_at', now() - interval '1 day', 'landing_url', 'https://movepark.co/p/x')) ->> 'channel',
  'Site do parceiro', 'a reserva recebe o pacote da regra que casou');
select is((select commission_take_rate_bps || '/' || commission_fee_payer || '/' || commission_chargeback_bearer
             from public.booking where id = '00000000-0000-0000-0000-0000000b0001'), '500/partner/partner',
  'o pacote fica gravado na reserva');
select is((select attribution ->> 'utm_medium' from public.booking where id = '00000000-0000-0000-0000-0000000b0001'), 'social',
  'a prova da origem fica gravada na reserva');

-- regra muda depois: a reserva já criada não muda sozinha
update public.commission_rule set take_rate_bps = 700 where id = '00000000-0000-0000-0000-0000000c0001';
select is((select commission_take_rate_bps from public.booking where id = '00000000-0000-0000-0000-0000000b0001'), 500,
  'editar a regra não mexe em reserva já criada');

-- paga: nem reaplicar muda
insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at)
  values ('00000000-0000-0000-0000-0000000b0001', 'pagarme', 'pix', 'booking', 200, 'paid', now());
select is((public.booking_apply_commission('00000000-0000-0000-0000-0000000b0001', null) ->> 'changed')::boolean, false,
  'reserva paga não tem o pacote recalculado: o split já foi ao gateway');

-- ── correção manual ─────────────────────────────────────────────────────────
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin)
  values ('00000000-0000-0000-0000-0000000b0002', 'MP-COMM-2', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'hub_search');
select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000b0002', null) ->> 'channel', 'hub',
  'reserva sem origem reconhecida nasce no padrão do Hub');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.admin_set_booking_commission('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000c0001', 'teste')$$,
  '42501', null, 'cliente não corrige comissão');
select throws_ok($$select public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'comm-a-site', now(), now())$$,
  '42501', null, 'cliente não consulta as regras de comissão');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(public.admin_set_booking_commission('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000c0001', 'cliente veio do site do parceiro') ->> 'take_rate_bps',
  '700', 'hub_admin corrige o canal de uma reserva ainda não paga, e fica o histórico');

select is((select count(*)::int from public.booking_commission_override where booking_id = '00000000-0000-0000-0000-0000000b0002'
             and from_package ->> 'channel' = 'hub' and to_package ->> 'channel' = 'Site do parceiro'), 1,
  'a correção grava de onde saiu, para onde foi e o motivo');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.booking_apply_commission('00000000-0000-0000-0000-0000000b0002', null) ->> 'changed')::boolean, false,
  'pacote corrigido à mão fica travado: reaplicar não desfaz a correção');

-- ── o que o estacionamento enxerga ──────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(jsonb_array_length(public.my_commission_channels(current_setting('test.a')::uuid) -> 'rules'), 1,
  'a empresa vê as regras dela, e não as globais');
select is(public.my_commission_channels(current_setting('test.a')::uuid) -> 'rules' -> 0 ->> 'name', 'Site do parceiro',
  'com o nome e os UTMs para montar o link');
select is(jsonb_array_length(public.my_commission_channels(current_setting('test.b')::uuid) -> 'rules'), 0,
  'empresa sem regra própria não vê regra de outra');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.my_commission_channels(current_setting('test.a')::uuid)$$, '42501', null,
  'quem não é da empresa não vê os canais dela');

-- ── ninguém edita a comissão por escrita direta ──────────────────────────────
-- A RLS deixa o dono e o membro da empresa darem UPDATE na reserva. O pacote e a prova não podem
-- ir junto: seria o parceiro zerando a própria comissão antes do cliente pagar.
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin)
  values ('00000000-0000-0000-0000-0000000b0004', 'MP-COMM-4', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'api');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$update public.booking set commission_take_rate_bps = 0, commission_channel = 'x' where id = '00000000-0000-0000-0000-0000000b0004'$$,
  '42501', null, 'escrita direta não muda a comissão da reserva');
select throws_ok($$update public.booking set utm_source = 'comm-a-site' where id = '00000000-0000-0000-0000-0000000b0004'$$,
  '42501', null, 'nem a prova da origem, que faria o congelamento tardio casar a regra');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select throws_ok($$update public.booking set commission_take_rate_bps = 0 where id = '00000000-0000-0000-0000-0000000b0004'$$,
  '42501', null, 'nem hub_admin por escrita direta: a correção passa pela RPC, que deixa histórico');
select is(public.admin_set_booking_commission('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-0000000c0001', 'correção de teste') ->> 'channel',
  'Site do parceiro', 'pela RPC o hub_admin corrige, com o guarda ligado');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);

-- ── relatório por canal e alerta de concentração ────────────────────────────
-- Empresa A no período: MP-COMM-1 (canal da regra, R$ 200, perna Movepark R$ 10) e uma venda do
-- Hub de R$ 100 (perna Movepark R$ 20). 200 de 300 = 67% pelo canal do parceiro: acima dos 60%.
reset role;
update public.payment set split = '[{"role":"partner","amount":19000},{"role":"movepark","amount":1000}]'::jsonb
 where booking_id = '00000000-0000-0000-0000-0000000b0001';
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin,
                           commission_channel, commission_take_rate_bps, commission_fee_payer, commission_chargeback_bearer)
  values ('00000000-0000-0000-0000-0000000b0003', 'MP-COMM-3', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'confirmed', 100, 'hub_search', 'hub', 2000, 'movepark', 'each');
insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split)
  values ('00000000-0000-0000-0000-0000000b0003', 'pagarme', 'pix', 'booking', 100, 'paid', now(),
          '[{"role":"partner","amount":8000},{"role":"movepark","amount":2000}]'::jsonb);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(
  (select (c ->> 'gmv_cents') || '/' || (c ->> 'movepark_cents') || '/' || (c ->> 'partner_share_pct') || '/' || (c ->> 'alert')
     from jsonb_array_elements(public.commission_channel_report(now() - interval '1 hour', now() + interval '1 hour') -> 'companies') c
    where c ->> 'company_id' = current_setting('test.a')),
  '30000/3000/67/true', 'a empresa soma o que vendeu, o que ficou com a Movepark e a fatia do canal dela, com alerta');
select is(
  (select jsonb_agg(ch ->> 'channel' order by (ch ->> 'gmv_cents')::int desc)
     from jsonb_array_elements(public.commission_channel_report(now() - interval '1 hour', now() + interval '1 hour') -> 'companies') c,
          jsonb_array_elements(c -> 'channels') ch
    where c ->> 'company_id' = current_setting('test.a')),
  '["Site do parceiro", "hub"]'::jsonb, 'os canais vêm abertos por empresa, do maior para o menor');
select is(
  (select count(*)::int
     from jsonb_array_elements(public.commission_channel_report(now() + interval '1 day', now() + interval '2 days') -> 'companies') c
    where c ->> 'company_id' = current_setting('test.a')), 0, 'fora do período não conta');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.commission_channel_report(now() - interval '1 hour', now())$$, '42501', null,
  'só hub_admin vê o relatório por canal');

select * from finish();
rollback;
