-- pgTAP: troca de datas de reserva paga pela tabela da COMPRA (migration 20261204140000).
-- Decisões de 17/11/2026: diferença entre durações pela tabela da compra, encurtar segue a tabela,
-- cupom continua, a diferença é da vaga (divide como a reserva) e a tarifa nunca volta.
-- Rodar com: supabase test db (ver README.md).

begin;
select plan(24);

select has_column('public', 'booking', 'price_by_days', 'booking.price_by_days existe');
select has_column('public', 'payment', 'date_change_quote', 'payment.date_change_quote existe');

-- Reserva confirmada numa unidade que vende pelo Hub (preferindo a listada).
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'tabela-da-compra@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select lpt.id into v_lpt
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
  order by (l.checkout_mode::text = 'hub') desc, (l.is_listed is true) desc, lpt.created_at limit 1;
  update public.location_parking_type set capacity = 10, has_minimum_stay = false where id = v_lpt;
  update public.location set tolerance_minutes = 60
    where id = (select location_id from public.location_parking_type where id = v_lpt);
  -- 5 diárias: toda tabela vende; o teste troca a tabela guardada logo abaixo.
  r := public.create_booking_atomic(u, v_lpt, '2027-02-10T12:00:00Z', '2027-02-15T12:00:00Z');
  update public.booking set status = 'confirmed' where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('test.uid', u::text, false);
end $$;

select ok(
  (select price_by_days -> 'prices' ? '5' and (price_by_days ->> 'max_days')::int >= 35
     from public.booking where id = current_setting('test.bid')::uuid),
  'a reserva nasce com a tabela da compra (até 30 dias além da estadia)');

-- Tabela da compra controlada: 1 diária não vende, 2 = 100, 3 = 140, 4 = 160, 5 = 150 (pacote).
-- A reserva passa a valer 2 diárias de vaga 100, sem tarifa, sem extra: total 100.
update public.booking
   set price_by_days = jsonb_build_object('max_days', 5, 'prices',
         jsonb_build_object('1', null, '2', 100, '3', 140, '4', 160, '5', 150)),
       total_amount = 100, fare_price_cents = 0,
       price_breakdown = coalesce(price_breakdown, '{}'::jsonb) || '{"days": 2, "subtotal": 100}'::jsonb
 where id = current_setting('test.bid')::uuid;
update public.booking_item set unit_price = 100, subtotal = 100
 where booking_id = current_setting('test.bid')::uuid and item_type = 'parking';
delete from public.booking_item where booking_id = current_setting('test.bid')::uuid and item_type = 'add_on';

select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-20T12:00:00Z', '2027-02-22T12:00:00Z') ->> 'delta_cents',
  '0', 'mudar só o dia, mesma duração: diferença zero');
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-20T12:00:00Z', '2027-02-22T12:00:00Z') ->> 'price_source',
  'compra', 'usa a tabela guardada na compra');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z') ->> 'delta_cents')::int,
  6000, 'alongar 2 para 4 diárias cobra 160 - 100 pela tabela da compra');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-15T12:00:00Z') ->> 'delta_cents')::int,
  5000, 'pacote: 5 diárias custam 150');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-12T12:30:00Z') ->> 'days')::int,
  2, 'tolerância de 60 min: 2 diárias e 30 min contam 2');
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-11T12:00:00Z') ->> 'reason',
  'Nesta unidade o mínimo é de 2 diárias.', 'abaixo do mínimo da tabela: diz qual é o mínimo');

-- Encurtar segue a tabela: de 5 (pacote 150) para 4 (160) cobra 10.
update public.booking set price_breakdown = price_breakdown || '{"days": 5}'::jsonb
 where id = current_setting('test.bid')::uuid;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z') ->> 'delta_cents')::int,
  1000, 'encurtar pode cobrar quando a estadia menor custa mais (decisão de 17/11/2026)');
update public.booking set price_breakdown = price_breakdown || '{"days": 2}'::jsonb
 where id = current_setting('test.bid')::uuid;

-- Cupom percentual (10%) continua: vaga 100, desconto 10, total 90. Em 4 diárias: 160 - 16.
do $$
declare v_cid uuid := gen_random_uuid();
begin
  insert into public.coupon (id, company_id, code, discount_type, discount_value, is_active, funded_by)
    values (v_cid, (select l.company_id from public.booking b join public.location l on l.id = b.location_id
                     where b.id = current_setting('test.bid')::uuid),
            'TESTE10TC', 'percent', 10, true, 'company');
  insert into public.booking_coupon (booking_id, coupon_id, discount_applied)
    values (current_setting('test.bid')::uuid, v_cid, 10);
  update public.booking set total_amount = 90 where id = current_setting('test.bid')::uuid;
  perform set_config('test.cid', v_cid::text, false);
end $$;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z') ->> 'delta_cents')::int,
  5400, 'cupom de 10% refeito sobre o novo valor: (160 - 16) - (100 - 10)');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-20T12:00:00Z', '2027-02-22T12:00:00Z') ->> 'delta_cents')::int,
  0, 'com cupom, mudar só o dia continua sem custo');

-- Cupom fixo (15) fica como foi dado.
update public.coupon set discount_type = 'fixed', discount_value = 15 where id = current_setting('test.cid')::uuid;
update public.booking_coupon set discount_applied = 15 where booking_id = current_setting('test.bid')::uuid;
update public.booking set total_amount = 85 where id = current_setting('test.bid')::uuid;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z') ->> 'delta_cents')::int,
  6000, 'cupom fixo mantido: (160 - 15) - (100 - 15)');

-- Sem tabela guardada (reserva antiga): diferença entre as durações pela tabela de hoje.
update public.booking set price_by_days = null where id = current_setting('test.bid')::uuid;
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-20T12:00:00Z', '2027-02-22T12:00:00Z') ->> 'price_source',
  'hoje', 'reserva sem tabela guardada usa a tabela de hoje');
-- (5 diárias: a unidade do fixture pode ter estadia mínima na tabela de hoje.)
update public.booking set price_breakdown = price_breakdown || '{"days": 5}'::jsonb
 where id = current_setting('test.bid')::uuid;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-20T12:00:00Z', '2027-02-25T12:00:00Z') ->> 'delta_cents')::int,
  0, 'mesmo pela tabela de hoje, mudar só o dia não custa nada');
update public.booking set price_breakdown = price_breakdown || '{"days": 2}'::jsonb
 where id = current_setting('test.bid')::uuid;

-- Aplicar grava exatamente a cotação recebida, mantém o cupom e registra a equipe.
update public.booking
   set price_by_days = jsonb_build_object('max_days', 5, 'prices',
         jsonb_build_object('1', null, '2', 100, '3', 140, '4', 160, '5', 150))
 where id = current_setting('test.bid')::uuid;
select is(
  (public.apply_paid_date_change(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z',
     current_setting('test.uid')::uuid, true, 'staff',
     public.reprice_booking_dates(current_setting('test.bid')::uuid, '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z')) ->> 'delta_cents')::int,
  6000, 'apply devolve a mesma diferença da cotação');
select is(
  (select total_amount from public.booking where id = current_setting('test.bid')::uuid),
  145::numeric, 'total gravado = cotação (85 + 60)');
select is(
  (select discount_applied from public.booking_coupon where booking_id = current_setting('test.bid')::uuid),
  15::numeric, 'o cupom continua na reserva');
select is(
  (select actor_role from public.booking_modification
    where booking_id = current_setting('test.bid')::uuid and type = 'date_change' order by created_at desc limit 1),
  'staff', 'troca feita pela equipe fica registrada como da equipe');
select is(
  (select (price_breakdown ->> 'days')::int from public.booking where id = current_setting('test.bid')::uuid),
  4, 'o detalhe do preço passa a dizer 4 diárias');

-- A diferença paga entra no extrato do estacionamento (antes só a cobrança da reserva contava).
do $$
declare v_company uuid;
begin
  select l.company_id into v_company from public.booking b join public.location l on l.id = b.location_id
   where b.id = current_setting('test.bid')::uuid;
  perform set_config('test.company', v_company::text, false);
  perform set_config('test.owed_antes', public.payout_owed_cents(v_company)::text, false);
  insert into public.payment (booking_id, provider, amount, status, kind, method, split, split_sent_to_gateway, paid_at,
      date_change_check_in_at, date_change_check_out_at)
    values (current_setting('test.bid')::uuid, 'pagarme', 60, 'paid', 'date_change', 'pix',
      '[{"role": "partner", "amount": 5100}, {"role": "movepark", "amount": 900}]'::jsonb, false, now(),
      '2027-02-10T12:00:00Z', '2027-02-14T12:00:00Z');
end $$;
select is(
  public.payout_owed_cents(current_setting('test.company')::uuid) - current_setting('test.owed_antes')::bigint,
  5100::bigint, 'a parte do estacionamento na diferença paga entra no que a Movepark deve a ele');

-- Fração da perna do estacionamento devolvida.
select is(
  round(public.payment_partner_refund_ratio(157.40, 57.80, 0, 0), 6),
  round(57.80 / 157.40, 6), 'sem estorno de datas: a proporção de sempre');
select is(
  round(public.payment_partner_refund_ratio(157.40, 57.80, 5780, 0.4), 6),
  0.4::numeric, 'estorno de datas: sai a parte das diárias, a tarifa não entra na conta');
select is(
  public.payment_partner_refund_ratio(157.40, 157.40, 5780, 0.4),
  1::numeric, 'cancelamento depois de uma troca: o estorno total continua tirando tudo');

select * from finish();
rollback;
