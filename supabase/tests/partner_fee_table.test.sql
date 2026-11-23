-- pgTAP: tabela de taxas para o estacionamento (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
-- Quem tem finance:read na empresa (Dono, Gerente, Financeiro) ou hub_admin lê; o resto recebe 42501.
-- Os canais seguem a precedência de resolve_commission. O antifraude só aparece quando alguma venda
-- dos últimos 90 dias pagou de fato; o gateway por transação nunca aparece. Taxas inventadas (repo
-- público). Transação com rollback.

begin;
select plan(14);

select has_function('public', 'partner_fee_table', array['uuid'], 'partner_fee_table(uuid) existe');
select ok(not has_function_privilege('anon', 'public.partner_fee_table(uuid)', 'execute'), 'anon não executa');

do $$
declare
  dono uuid := gen_random_uuid(); oper uuid := gen_random_uuid(); cli uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (dono,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pft-dono@ex.com',now(),now()),
           (oper,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pft-oper@ex.com',now(),now()),
           (cli, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','pft-cli@ex.com',now(),now());
  insert into public.profiles(id, role) values (dono,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.profiles(id, role) values (oper,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.profiles(id, role) values (cli,'customer') on conflict (id) do update set role = 'customer';
  insert into public.company(id, name, slug, take_rate_bps) values (cid, 'PFT Empresa', 'pft-empresa', 2000);
  insert into public.profile_company(profile_id, company_id, role) values (dono, cid, 'owner'), (oper, cid, 'operator');
  insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer)
    values (cid, 'Site PFT', array['pft-site'], 1200, 'partner', 'each');
  -- Tabela e padrões fixados aqui, com números inventados, para o teste não depender do vivo.
  insert into public.app_setting(key, value) values
    ('gateway_fee_schedule', '{"version":1,"pix_bps":80,"card":[{"from":1,"to":1,"bps":250},{"from":2,"to":12,"bps":300}],"antifraud_cents":5,"processing_cents":7,"cet30_bps":[250,400,500,600,700,800,900,1000,1100,1200,1300,1400]}'),
    ('commission_default_fee_payer', 'movepark'),
    ('commission_default_anticipation_payer', 'partner'),
    ('payout_withdrawal_fee_cents', '150')
  on conflict (key) do update set value = excluded.value;
  perform set_config('test.dono', dono::text, false);
  perform set_config('test.oper', oper::text, false);
  perform set_config('test.cli', cli::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

-- ── quem não pode ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cli'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_fee_table(%L)$$, current_setting('test.cid')), '42501', null, 'cliente recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.oper'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_fee_table(%L)$$, current_setting('test.cid')), '42501', null, 'papel Operação (sem finance:read) recebe 42501');

-- ── o Dono lê ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select lives_ok(format($$select set_config('test.t', public.partner_fee_table(%L)::text, false)$$, current_setting('test.cid')), 'o Dono lê a tabela');
reset role;

select is(jsonb_array_length(current_setting('test.t')::jsonb -> 'channels'), 2, 'dois canais: Movepark e a regra da empresa');
select is(current_setting('test.t')::jsonb -> 'channels' -> 0 ->> 'card_fee_payer', 'movepark', 'vendas pela Movepark: a Movepark paga o cartão');
select is(current_setting('test.t')::jsonb -> 'channels' -> 0 ->> 'anticipation_payer', 'partner', 'a antecipação é do estacionamento');
select is((current_setting('test.t')::jsonb -> 'channels' -> 1 ->> 'take_rate_bps')::int, 1200, 'a regra traz a comissão dela');
select is(current_setting('test.t')::jsonb -> 'channels' -> 1 ->> 'card_fee_payer', 'partner', 'na regra o estacionamento paga o cartão');
select is(jsonb_array_length(current_setting('test.t')::jsonb -> 'cet30_bps'), 12, 'custo em 30 dias de 1x a 12x');
select ok(not (current_setting('test.t')::jsonb ? 'processing_cents'), 'gateway por transação nunca vai ao estacionamento');

-- ── antifraude só se alguma venda pagou ─────────────────────────────────────
-- Nenhum recebível da fixture traz antifraude; no vivo, até 23/11/2026, nenhum trazia.
select is(current_setting('test.t')::jsonb -> 'antifraud_cents', 'null'::jsonb, 'sem venda pagando antifraude, ele não aparece');

do $$
declare
  cid uuid := current_setting('test.cid')::uuid; cli uuid := current_setting('test.cli')::uuid;
  loc uuid := gen_random_uuid(); bk uuid := gen_random_uuid(); pay uuid := gen_random_uuid();
begin
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'PFT Loc', 'pft-loc');
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk, 'MP-PFT001', cli, loc, now() + interval '2 days', now() + interval '3 days', 'confirmed', 100);
  insert into public.payment(id, booking_id, provider, method, kind, amount, status, paid_at, installments, provider_payment_id, provider_charge_id)
    values (pay, bk, 'pagarme', 'card', 'booking', 100, 'paid', now(), 1, 'or_pft1', 'ch_pft1');
  insert into public.payment_gateway_event(payment_id, booking_id, kind, http_status, request, response)
    values (pay, bk, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":250,"fraud_coverage_fee":5,"amount":10000,"installment":1}]}');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select set_config('test.t2', public.partner_fee_table(current_setting('test.cid')::uuid)::text, false);
reset role;
select is((current_setting('test.t2')::jsonb ->> 'antifraud_cents')::int, 5, 'com venda pagando antifraude, ele aparece');

select * from finish();
rollback;
