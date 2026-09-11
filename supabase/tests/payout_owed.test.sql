-- pgTAP: quanto a Movepark deve ao parceiro, por cobrança.
--
-- Com o split ligado, o gateway credita o parceiro na hora e não devemos nada. Com ele desligado
-- (custódia), a cobrança inteira cai no master e a dívida é nossa. Ler a chave global na hora do
-- extrato responderia errado sobre o passado, porque a chave muda e o histórico não. Quem responde
-- é `payment.split_sent_to_gateway`, gravado no momento da cobrança.
--
-- NULL (desconhecido) conta como ENVIADO, ou seja, não devido. É o lado seguro: errar para menos se
-- corrige com outro repasse; errar para mais paga duas vezes o mesmo dinheiro.
--
-- Transação com rollback.

begin;
select plan(6);

select has_column('public', 'payment', 'split_sent_to_gateway',
  'payment.split_sent_to_gateway existe');

do $$
declare
  cust uuid := gen_random_uuid();
  cid  uuid := gen_random_uuid();
  loc  uuid := gen_random_uuid();
  bk   uuid;
  procedure_split jsonb := '[{"recipientId":"rp_a","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
                             {"recipientId":"rp_mp","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owed-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Owed Empresa', 'owed-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Owed Loc', 'owed-loc');

  -- A) split ENVIADO ao gateway: o parceiro já foi creditado lá, não devemos nada
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-OWED-A',cust,loc,'2026-05-10T12:00:00Z','2026-05-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-05-10T13:00:00Z', true, procedure_split);

  -- B) split NÃO enviado (custódia): devemos a perna do parceiro
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-OWED-B',cust,loc,'2026-05-11T12:00:00Z','2026-05-13T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-05-11T13:00:00Z', false, procedure_split);

  -- C) desconhecido (NULL): conta como enviado, não devido
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-OWED-C',cust,loc,'2026-05-12T12:00:00Z','2026-05-14T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-05-12T13:00:00Z', null, procedure_split);

  -- D) custódia COM estorno parcial de 25%: devido cai na mesma proporção
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-OWED-D',cust,loc,'2026-05-13T12:00:00Z','2026-05-15T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-05-13T13:00:00Z','2026-05-14T10:00:00Z',25, false, procedure_split);

  -- E) upgrade de Tarifa em custódia: receita nossa, nunca vira dívida
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-OWED-E',cust,loc,'2026-05-14T12:00:00Z','2026-05-16T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','fare_upgrade',12.90,'paid','2026-05-14T13:00:00Z', false,
     '[{"recipientId":"rp_mp","amount":1290,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"}]'::jsonb);

  perform set_config('test.cid', cid::text, false);
end $$;

-- ── o devido ────────────────────────────────────────────────────────────────
select is(
  public.payout_owed_cents(current_setting('test.cid')::uuid),
  14000::bigint,
  'devido = 8000 (B) + 6000 (D, menos 25%); enviado, desconhecido e upgrade ficam de fora');

-- ── o saldo bebe do mesmo cálculo ───────────────────────────────────────────
do $$
declare adm uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owed-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  perform set_config('test.adm', adm::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);

select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'owed_cents')::bigint),
  14000::bigint, 'payout_balance expõe owed_cents');

select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'balance_cents')::bigint),
  14000::bigint, 'sem repasse, o saldo devido é o devido inteiro');

select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'transferred_cents')::bigint),
  0::bigint, 'payout_balance expõe transferred_cents');

-- o líquido do parceiro segue contando TUDO que ele ganhou, tenha ou não sido creditado no gateway
select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'net_partner_cents')::bigint),
  30000::bigint, 'net_partner_cents não muda: 8000 (A) + 8000 (B) + 8000 (C) + 6000 (D)');
reset role;

select * from finish();
rollback;
