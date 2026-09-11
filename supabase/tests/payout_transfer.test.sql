-- pgTAP: repasse ao parceiro (E0.3.4). O hop que faltava na custódia: master da Movepark para o
-- recebedor do parceiro, dentro do Pagar.me.
--
-- O que esta suíte protege é dinheiro saindo errado: valor maior que o devido, dois cliques virando
-- dois repasses, parceiro pedindo repasse para si mesmo, e o saldo não descontando o que já foi.
--
-- Transação com rollback.

begin;
select plan(19);

select has_table('public', 'payout_transfer', 'payout_transfer existe');
select has_function('public', 'payout_transfer_request', 'a RPC de pedido existe');
select ok(
  not has_function_privilege('anon', 'public.payout_transfer_request(uuid,integer,text)', 'execute'),
  'anon NÃO pede repasse'
);

-- ── fixture ──────────────────────────────────────────────────────────────────
do $$
declare
  adm  uuid := gen_random_uuid();
  op   uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  cid  uuid := gen_random_uuid();
  loc  uuid := gen_random_uuid();
  bk   uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tr-adm@ex.com',now(),now()),
    (op  ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tr-op@ex.com',now(),now()),
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tr-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (adm,'hub_admin'), (op,'company_operator'), (cust,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(id, name, slug) values (cid, 'Transfer Empresa', 'transfer-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Transfer Loc', 'transfer-loc');
  insert into public.profile_company(profile_id, company_id, role) values (op, cid, 'owner');

  -- recebedor ativo do parceiro (destino do repasse)
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_parceiro_teste', 'active');
  -- master da Movepark (origem)
  insert into public.app_setting(key, value) values ('pagarme_movepark_recipient_id', 're_master_teste')
    on conflict (key) do update set value = 're_master_teste';

  -- uma venda em custódia: devemos a perna do parceiro (8000)
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-TR-A',cust,loc,'2026-05-10T12:00:00Z','2026-05-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-05-10T13:00:00Z', false,
     '[{"recipientId":"re_parceiro_teste","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"re_master_teste","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.op',  op::text,  false);
  perform set_config('test.cid', cid::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── parceiro não pede repasse para si mesmo ─────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op'));
select throws_ok(
  format($$ select public.payout_transfer_request(%L::uuid, 1000) $$, current_setting('test.cid')),
  '42501', null, 'operador (dono da empresa) NÃO pede o próprio repasse');
select is(
  (select count(*)::int from public.payout_transfer), 0,
  'nenhuma linha criada pela tentativa recusada');
reset role;

-- ── hub_admin: valor acima do devido é recusado ─────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));

select throws_ok(
  format($$ select public.payout_transfer_request(%L::uuid, 8001) $$, current_setting('test.cid')),
  'P0001', null, 'repasse acima do devido é recusado');

select throws_ok(
  format($$ select public.payout_transfer_request(%L::uuid, 0) $$, current_setting('test.cid')),
  null, null, 'valor zero é recusado');

-- ── pedido válido ───────────────────────────────────────────────────────────
select is(
  ((public.payout_transfer_request(current_setting('test.cid')::uuid, 5000) -> 'transfer' ->> 'status')),
  'created', 'o pedido nasce em created');

select is(
  (select amount_cents from public.payout_transfer where company_id = current_setting('test.cid')::uuid),
  5000, 'valor pedido é o gravado');

select ok(
  (select idempotency_key is not null and length(idempotency_key) >= 16
     from public.payout_transfer where company_id = current_setting('test.cid')::uuid),
  'a chave de idempotência nasce no banco');

select is(
  (select source_recipient_id || '>' || target_recipient_id
     from public.payout_transfer where company_id = current_setting('test.cid')::uuid),
  're_master_teste>re_parceiro_teste', 'as duas pernas ficam gravadas no ato');

-- ── segundo clique não vira segundo repasse ─────────────────────────────────
select ok(
  ((public.payout_transfer_request(current_setting('test.cid')::uuid, 5000) ->> 'reused')::boolean),
  'repasse em andamento é retomado, não duplicado');
select is(
  (select count(*)::int from public.payout_transfer where company_id = current_setting('test.cid')::uuid),
  1, 'segue existindo UMA linha de repasse');

-- ── o saldo desconta o que já foi pedido ────────────────────────────────────
select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'balance_cents')::bigint),
  3000::bigint, 'saldo devido = 8000 − 5000 em repasse');


-- ── visão do painel: quem está devendo ──────────────────────────────────────
select has_function('public', 'payout_owed_overview', 'a visão do painel existe');

select is(
  (select count(*)::int
     from jsonb_array_elements(public.payout_owed_overview()) e
    where (e->>'company_id')::uuid = current_setting('test.cid')::uuid),
  1, 'a empresa com dívida aberta aparece na visão');

select is(
  (select (e->>'owed_cents')::bigint
     from jsonb_array_elements(public.payout_owed_overview()) e
    where (e->>'company_id')::uuid = current_setting('test.cid')::uuid),
  8000::bigint, 'a visão traz o devido bruto');

select is(
  (select (e->>'available_cents')::bigint
     from jsonb_array_elements(public.payout_owed_overview()) e
    where (e->>'company_id')::uuid = current_setting('test.cid')::uuid),
  3000::bigint, 'e o que sobra depois do repasse em andamento');

reset role;

-- ── parceiro não enxerga a visão do painel ─────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op'));
select throws_ok(
  $$ select public.payout_owed_overview() $$,
  '42501', null, 'operador NÃO abre a visão de repasses da rede');
reset role;

select * from finish();
rollback;
