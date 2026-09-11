-- pgTAP: a taxa do gateway vira lançamento.
--
-- Com a custódia ligada (`pagarme_split_enabled = false`) a cobrança inteira cai na Movepark, e a
-- taxa que o Pagar.me desconta virou custo nosso. Ela nunca entrou no banco: não aparece na order
-- nem na charge, só em `GET /payables`, um recebível por parcela. Sem lançamento, a margem que o
-- Faturamento mostra é sempre maior que a real.
--
-- A taxa é custo da MOVEPARK, não do parceiro: ela não pode encostar no `net_partner_cents`.
--
-- Transação com rollback.

begin;
select plan(7);

select has_column('public', 'payment', 'gateway_fee_cents', 'payment.gateway_fee_cents existe');
select has_column('public', 'payment', 'gateway_fee_synced_at',
  'payment.gateway_fee_synced_at existe (nulo = ainda não apurado)');

select has_function('public', 'reconcile_gateway_fees_expected_key',
  'a chave do cron de apuração existe');
select ok(
  not has_function_privilege('anon', 'public.reconcile_gateway_fees_expected_key()', 'execute'),
  'anon NÃO lê a chave do cron'
);

-- ── fixture ──────────────────────────────────────────────────────────────────
do $$
declare
  adm  uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  cid  uuid := gen_random_uuid();
  loc  uuid := gen_random_uuid();
  bk   uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fee-adm@ex.com',now(),now()),
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fee-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin'), (cust,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(id, name, slug) values (cid, 'Fee Empresa', 'fee-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Fee Loc', 'fee-loc');

  -- duas reservas pagas: parceiro 8000/Movepark 2000, com taxa de gateway apurada
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-FEE-A',cust,loc,'2026-05-10T12:00:00Z','2026-05-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, gateway_fee_cents, gateway_fee_synced_at, split) values
    (bk,'pagarme','pix','booking',100,'paid','2026-05-10T13:00:00Z',99,'2026-05-11T00:00:00Z',
     '[{"recipientId":"rp_a","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-FEE-B',cust,loc,'2026-05-14T12:00:00Z','2026-05-16T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, gateway_fee_cents, gateway_fee_synced_at, split) values
    (bk,'pagarme','card','booking',100,'paid','2026-05-14T13:00:00Z',146,'2026-05-15T00:00:00Z',
     '[{"recipientId":"rp_a","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  -- reserva paga ainda SEM taxa apurada: não pode virar zero nem quebrar a soma
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-FEE-C',cust,loc,'2026-05-18T12:00:00Z','2026-05-20T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split) values
    (bk,'pagarme','pix','booking',100,'paid','2026-05-18T13:00:00Z',
     '[{"recipientId":"rp_a","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text,
  true
);

create or replace function pg_temp.extrato_fee(p_campo text) returns bigint language sql as $$
  select (public.payout_statement(
            '2026-05-01T00:00:00Z'::timestamptz,
            '2026-06-01T00:00:00Z'::timestamptz,
            current_setting('test.cid')::uuid
          ) -> 'companies' -> 0 ->> p_campo)::bigint
$$;

select is(
  pg_temp.extrato_fee('gateway_fee_cents'), 245::bigint,
  'taxa do gateway no período = 99 + 146; a cobrança sem apuração não entra');

select is(
  pg_temp.extrato_fee('net_partner_cents'), 24000::bigint,
  'a taxa é custo da Movepark: não desconta nada do parceiro');

select is(
  pg_temp.extrato_fee('movepark_commission_cents'), 6000::bigint,
  'a comissão segue bruta; quem subtrai a taxa é quem lê os dois campos');

reset role;
select * from finish();
rollback;
