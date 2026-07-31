-- pgTAP: o dado financeiro do parceiro.
--
-- O eixo aqui é o VIZINHO, não o estranho. Que anon não lê repasse é o caso
-- fácil; o que derruba um marketplace é o operador da empresa A enxergar o
-- recebedor e o saque da empresa B. As policies de `payout_recipient` e
-- `payout_withdrawal` filtram por `company_id in current_company_ids()`, e é
-- exatamente esse predicado que nunca teve teste.
--
-- O outro lado é escrita: o operador tem policy só de SELECT nas duas tabelas.
-- Ele não pode criar o próprio saque nem promover o próprio recebedor, e isso
-- também nunca foi asserido.
--
-- `payment_webhook_event` entra por outro motivo: guarda o corpo cru do webhook
-- do gateway e está fail-closed (RLS ligado, zero policy). O teste trava isso.
--
-- Roda em transação com rollback.

begin;
select plan(13);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ────────────────
do $$
declare
  uop uuid := gen_random_uuid();  -- operador, vinculado SÓ à empresa A
  ua  uuid := gen_random_uuid();  -- hub_admin
  cA uuid;
  cB uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uop,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-op@ex.com',now(),now()),
    (ua, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-admin@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (uop,'company_operator'),(ua,'hub_admin') on conflict (id) do nothing;

  cA := public.submit_partner_lead('Pay Empresa A','Op A','pay-op@ex.com','+5511999990001');
  cB := public.submit_partner_lead('Pay Empresa B','Op B','pay-opb@ex.com','+5511999990002');

  -- O operador responde SÓ pela A. A B é o vizinho.
  insert into public.profile_company(profile_id, company_id) values (uop, cA);

  insert into public.payout_recipient(company_id) values (cA), (cB);

  insert into public.payout_withdrawal(company_id, external_transfer_id, amount_cents) values
    (cA, 'tr_empresa_a', 150000),
    (cB, 'tr_empresa_b', 990000);

  insert into public.payment_webhook_event(id) values ('evt_teste_rls');

  perform set_config('test.uop', uop::text, false);
  perform set_config('test.ua',  ua::text,  false);
  perform set_config('test.cA',  cA::text,  false);
  perform set_config('test.cB',  cB::text,  false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── contrato estrutural do webhook ─────────────────────────────────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='payment_webhook_event'),
  0,
  'payment_webhook_event segue sem policy (só service_role escreve o corpo cru)'
);

set local role anon;
select is_empty('select 1 from public.payment_webhook_event', 'anon NÃO lê payment_webhook_event');
select is_empty('select 1 from public.payout_recipient',      'anon NÃO lê payout_recipient');
select is_empty('select 1 from public.payout_withdrawal',     'anon NÃO lê payout_withdrawal');
reset role;

-- ── o operador da A ────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uop'));

select is_empty('select 1 from public.payment_webhook_event',
  'operador NÃO lê o corpo cru do webhook');

select isnt_empty(
  format('select 1 from public.payout_recipient where company_id = %L', current_setting('test.cA')),
  'operador vê o recebedor da PRÓPRIA empresa');

select is_empty(
  format('select 1 from public.payout_recipient where company_id = %L', current_setting('test.cB')),
  'operador NÃO vê o recebedor da empresa VIZINHA');

select isnt_empty(
  format('select 1 from public.payout_withdrawal where company_id = %L', current_setting('test.cA')),
  'operador vê o saque da PRÓPRIA empresa');

select is_empty(
  format('select 1 from public.payout_withdrawal where company_id = %L', current_setting('test.cB')),
  'operador NÃO vê o saque da empresa VIZINHA');

-- Escrita: o operador só tem policy de SELECT. Criar saque é ato do backoffice.
select throws_ok(
  format('insert into public.payout_withdrawal(company_id, external_transfer_id, amount_cents) values (%L, %L, 1)',
         current_setting('test.cA'), 'tr_forjado'),
  '42501',
  null,
  'operador NÃO cria saque para a própria empresa');

-- UPDATE sem policy aplicável NÃO estoura: o USING filtra e sobram 0 linhas.
-- Por isso a asserção conta linhas afetadas em vez de esperar exceção.
select is(
  (with u as (
     update public.payout_recipient set requirements = '["forjado"]'::jsonb
      where company_id = current_setting('test.cA')::uuid
      returning 1)
   select count(*)::int from u),
  0,
  'operador NÃO altera o próprio recebedor (afeta 0 linhas, sem erro)');

reset role;

-- ── hub_admin enxerga os dois lados ────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.ua'));
select isnt_empty(
  format('select 1 from public.payout_recipient where company_id = %L', current_setting('test.cB')),
  'hub_admin vê recebedor de qualquer empresa');
select isnt_empty(
  format('select 1 from public.payout_withdrawal where company_id = %L', current_setting('test.cB')),
  'hub_admin vê saque de qualquer empresa');
reset role;

select * from finish();
rollback;
