-- pgTAP: o que NÃO é devido ao parceiro sai do extrato. Duas correções sobre payout_statement /
-- payout_balance (ver payment-split.md, "Pontos abertos que a custódia expõe"):
--
-- 1. Receita de serviço da Movepark contada como dívida com o parceiro. `create-fare-upgrade` e
--    `change-booking-dates-paid` cobram valor 100% Movepark, mas gravam a perna única com
--    `liable: true` (o gateway exige um responsável por chargeback no split). Como a leitura
--    classificava parceiro por `liable`, a Tarifa e a diferença de datas entravam como repasse
--    devido. Quem separa é `payment.kind`: só `booking` tem perna de parceiro.
--
-- 2. Estorno parcial não descontado. Estorno total muda o status e some do líquido sozinho; o
--    parcial deixa o pagamento em `paid` com `refunded_amount` preenchido, e o valor seguia
--    contando inteiro. A Pagar.me reverte o split proporcionalmente, então o desconto é
--    proporcional nas duas pernas.
--
-- Transação com rollback.

begin;
select plan(8);

-- ── fixtures (como postgres; RLS não se aplica) ──────────────────────────────
do $$
declare
  adm   uuid := gen_random_uuid();
  cust  uuid := gen_random_uuid();
  cid   uuid := gen_random_uuid();
  loc   uuid := gen_random_uuid();
  bk    uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','corr-adm@ex.com',now(),now()),
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','corr-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin'), (cust,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(id, name, slug) values (cid, 'Corr Empresa', 'corr-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Corr Loc', 'corr-loc');

  -- A) reserva paga normal: parceiro 8000 / Movepark 2000
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-CORR-A',cust,loc,'2026-05-10T12:00:00Z','2026-05-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split) values
    (bk,'pagarme','pix','booking',100,'paid','2026-05-10T13:00:00Z',
     '[{"recipientId":"rp_a","amount":8000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":2000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  -- B) upgrade de Tarifa: perna única, liable:true, mas o recebedor é o master da Movepark
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-CORR-B',cust,loc,'2026-05-11T12:00:00Z','2026-05-13T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split) values
    (bk,'pagarme','pix','fare_upgrade',12.90,'paid','2026-05-11T13:00:00Z',
     '[{"recipientId":"rp_mp","amount":1290,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"}]'::jsonb);

  -- C) diferença de troca de datas: mesma forma do upgrade
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-CORR-C',cust,loc,'2026-05-12T12:00:00Z','2026-05-14T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split) values
    (bk,'pagarme','pix','date_change',49.70,'paid','2026-05-12T13:00:00Z',
     '[{"recipientId":"rp_mp","amount":4970,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"}]'::jsonb);

  -- D) reserva paga com estorno PARCIAL de 25% (segue `paid`, com refunded_amount)
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-CORR-D',cust,loc,'2026-05-13T12:00:00Z','2026-05-15T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split) values
    (bk,'pagarme','pix','booking',100,'paid','2026-05-13T13:00:00Z','2026-05-14T10:00:00Z',25,
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

create or replace function pg_temp.extrato(p_campo text) returns bigint language sql as $$
  select (public.payout_statement(
            '2026-05-01T00:00:00Z'::timestamptz,
            '2026-06-01T00:00:00Z'::timestamptz,
            current_setting('test.cid')::uuid
          ) -> 'companies' -> 0 ->> p_campo)::bigint
$$;

-- ── 1. receita de serviço da Movepark não é dívida com o parceiro ────────────
select is(
  pg_temp.extrato('net_partner_cents'), 14000::bigint,
  'líquido do parceiro = 8000 (A) + 6000 (D, menos 25%); upgrade e troca de datas fora');

select is(
  pg_temp.extrato('gross_partner_cents'), 16000::bigint,
  'bruto do parceiro = 8000 (A) + 8000 (D); upgrade e troca de datas não somam nada');

select is(
  pg_temp.extrato('movepark_commission_cents'), 9760::bigint,
  'Movepark = 2000 (A) + 1290 (upgrade) + 4970 (datas) + 1500 (D, menos 25%)');

-- ── 2. estorno parcial desconta proporcionalmente ────────────────────────────
select is(
  pg_temp.extrato('refunded_partner_cents'), 2000::bigint,
  'estornado do parceiro = 25% de 8000, mesmo com o pagamento ainda em paid');

select is(
  pg_temp.extrato('gross_partner_cents') - pg_temp.extrato('refunded_partner_cents'),
  pg_temp.extrato('net_partner_cents'),
  'a identidade bruto − estornado = líquido continua fechando');

-- ── 3. o saldo bebe do mesmo cálculo ─────────────────────────────────────────
select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'net_partner_cents')::bigint),
  14000::bigint,
  'payout_balance: líquido corrigido = 14000');

-- `balance_cents` mudou de significado em 11/09/2026: deixou de ser "líquido menos saques" e
-- passou a ser "quanto a Movepark ainda deve", que é a pergunta que o botão Repassar precisa.
-- Nesta fixture nenhuma cobrança está marcada como custódia (`split_sent_to_gateway` nulo, tratado
-- como enviado ao gateway), então não devemos nada, mesmo com R$ 140,00 de líquido do parceiro.
-- Ver payout_owed.test.sql para o caso em que a dívida existe.
select is(
  ((public.payout_balance(current_setting('test.cid')::uuid) ->> 'balance_cents')::bigint),
  0::bigint,
  'payout_balance: sem cobrança em custódia, não devemos nada');

-- ── 4. a linha do extrato mostra de quem é o dinheiro ────────────────────────
select is(
  (select (l ->> 'partner_cents')::bigint
     from jsonb_array_elements(
            public.payout_statement(
              '2026-05-01T00:00:00Z'::timestamptz,
              '2026-06-01T00:00:00Z'::timestamptz,
              current_setting('test.cid')::uuid, true)
            -> 'companies' -> 0 -> 'lines') as l
    where l ->> 'booking_code' = 'MP-CORR-B'),
  0::bigint,
  'a linha do upgrade aparece no extrato com 0 para o parceiro');

reset role;
select * from finish();
rollback;
