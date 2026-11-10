-- pgTAP: resumo diário da equipe Movepark (team_daily_digest e team_digest_numbers, 10/11/2026).
-- Cobre: a janela é o dia de Brasília (0h às 24h), venda do Hub conta o pago e o estornado depois e
-- deixa o falho fora, comissão é a perna da Movepark, white-label só confirmado e sem duplicata,
-- primeira compra contra recompra, comparação com 7 dias antes, cancelamento, avaliação baixa,
-- lead de parceiro, repasse, movimento de amanhã e que só o servidor executa.
-- O dia do teste fica em 2030, onde o banco vivo não tem dado, para rodar também contra produção.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(18);

select ok(
  not has_function_privilege('authenticated', 'public.team_daily_digest(date)', 'execute')
  and not has_function_privilege('anon', 'public.team_daily_digest(date)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_digest_numbers(date)', 'execute'),
  'cliente e parceiro não chamam as funções do resumo da equipe'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.team_digest_log'::regclass)
  and not has_table_privilege('anon', 'public.team_digest_log', 'select'),
  'log com RLS e fechado para anônimo'
);

do $$
declare
  d date := date '2030-03-12';
  novo uuid := gen_random_uuid(); antigo uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  b4 uuid := gen_random_uuid(); b5 uuid := gen_random_uuid(); bvelha uuid := gen_random_uuid();
  bamanha uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (novo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe-novo@ex.com', now(), now()),
    (antigo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe-antigo@ex.com', now(), now());
  insert into public.profiles(id, role) values (novo, 'customer'), (antigo, 'customer') on conflict (id) do nothing;
  -- o novo se cadastrou no dia; o antigo, um ano antes
  update public.profiles set created_at = (d + time '09:00') at time zone 'America/Sao_Paulo' where id = novo;
  update public.profiles set created_at = (d - 365 + time '09:00') at time zone 'America/Sao_Paulo' where id = antigo;

  insert into public.company(id, name, slug) values (cid, 'Equipe Park', 'equipe-park');
  insert into public.location(id, company_id, name, slug, timezone)
    values (loc, cid, 'Equipe Unidade', 'equipe-unidade', 'America/Sao_Paulo');

  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name, commission_channel)
    values
    (b1, 'EQP-1', novo, loc, (d + 20 + time '10:00') at time zone 'America/Sao_Paulo', (d + 22 + time '10:00') at time zone 'America/Sao_Paulo', 'confirmed', 150, 'Ana', 'Site Parceiro'),
    (b2, 'EQP-2', antigo, loc, (d + 20 + time '10:00') at time zone 'America/Sao_Paulo', (d + 22 + time '10:00') at time zone 'America/Sao_Paulo', 'confirmed', 50, 'Bia', null),
    (b3, 'EQP-3', antigo, loc, (d + 20 + time '10:00') at time zone 'America/Sao_Paulo', (d + 22 + time '10:00') at time zone 'America/Sao_Paulo', 'expired', 70, 'Bia', null),
    (b4, 'EQP-4', antigo, loc, (d + 20 + time '10:00') at time zone 'America/Sao_Paulo', (d + 22 + time '10:00') at time zone 'America/Sao_Paulo', 'confirmed', 90, 'Bia', null),
    (b5, 'EQP-5', antigo, loc, (d + 20 + time '10:00') at time zone 'America/Sao_Paulo', (d + 22 + time '10:00') at time zone 'America/Sao_Paulo', 'confirmed', 80, 'Bia', null),
    (bvelha, 'EQP-V', antigo, loc, (d - 25 + time '10:00') at time zone 'America/Sao_Paulo', (d - 24 + time '10:00') at time zone 'America/Sao_Paulo', 'completed', 40, 'Bia', null),
    (bamanha, 'EQP-A', antigo, loc, (d + 1 + time '08:00') at time zone 'America/Sao_Paulo', (d + 3 + time '08:00') at time zone 'America/Sao_Paulo', 'confirmed', 60, 'Bia', null);

  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split, refunded_amount, refunded_at) values
    -- cartão às 10h do dia, com split: 120 do parceiro, 30 da Movepark
    (b1, 'pagarme', 'card', 'booking', 150, 'paid', (d + time '10:00') at time zone 'America/Sao_Paulo',
     '[{"role":"partner","amount":12000},{"role":"movepark","amount":3000}]'::jsonb, null, null),
    -- PIX às 23h30 do dia, estornado no dia seguinte: a venda conta no dia; o estorno, no outro
    (b2, 'pagarme', 'pix', 'booking', 50, 'refunded', (d + time '23:30') at time zone 'America/Sao_Paulo',
     null, 50, (d + 1 + time '10:00') at time zone 'America/Sao_Paulo'),
    -- falhou no dia: fora
    (b3, 'pagarme', 'card', 'booking', 70, 'failed', null, null, null, null),
    -- 00h30 do dia seguinte: fora
    (b4, 'pagarme', 'pix', 'booking', 90, 'paid', (d + 1 + time '00:30') at time zone 'America/Sao_Paulo', null, null, null),
    -- 7 dias antes: entra na comparação
    (b5, 'pagarme', 'pix', 'booking', 80, 'paid', (d - 7 + time '15:00') at time zone 'America/Sao_Paulo', null, null, null),
    -- compra antiga do cliente antigo: o PIX do dia é recompra
    (bvelha, 'pagarme', 'pix', 'booking', 40, 'paid', (d - 30 + time '15:00') at time zone 'America/Sao_Paulo', null, null, null);

  insert into public.wl_booking(company_id, wl_order_id, wl_order_number, status, total_cents, paid_total_cents, wl_created_at, is_duplicate) values
    (cid, 990000001, 'EQ1', 'confirmed', 20000, 20000, (d + time '12:00') at time zone 'America/Sao_Paulo', false),
    (cid, 990000002, 'EQ2', 'confirmed', 20000, 20000, (d + time '12:00') at time zone 'America/Sao_Paulo', true),
    (cid, 990000003, 'EQ3', 'cancelled', 20000, 20000, (d + time '12:00') at time zone 'America/Sao_Paulo', false);

  insert into public.booking_modification(booking_id, type, created_at)
    values (b3, 'cancel', (d + time '14:00') at time zone 'America/Sao_Paulo');
  insert into public.review(booking_id, profile_id, location_id, rating, comment, created_at)
    values (bvelha, antigo, loc, 2, 'Demorou o traslado', (d + time '16:00') at time zone 'America/Sao_Paulo');
  insert into public.partner_lead(contact_email, company_name, city, state, created_at)
    values ('lead-equipe@ex.com', 'Lead Park', 'Campinas', 'SP', (d + time '11:00') at time zone 'America/Sao_Paulo');
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents, fee_cents, status, origin, created_at)
    values (cid, 'pagarme', 'tr_equipe_teste', 12345, 367, 'paid', 'automatic', (d + time '09:00') at time zone 'America/Sao_Paulo');
end $$;

create temp table _r as select public.team_daily_digest(date '2030-03-12') as r;

select is((select (r->'atual'->>'hub_reservas')::int from _r), 2, 'Hub: paga e estornada depois contam; falha e dia seguinte não');
select is((select (r->'atual'->>'hub_receita_cents')::int from _r), 20000, 'receita do Hub em centavos');
select is((select (r->'atual'->>'hub_comissao_cents')::int from _r), 3000, 'comissão é a perna da Movepark no split');
select is((select (r->'atual'->>'hub_cartao')::int || '/' || (r->'atual'->>'hub_pix') from _r), '1/1', 'um cartão e um PIX');
select is((select (r->'atual'->>'wl_reservas')::int from _r), 1, 'white-label: só confirmado e sem duplicata');
select is((select (r->'atual'->>'wl_receita_cents')::int from _r), 20000, 'receita do white-label');
select is((select (r->'atual'->>'clientes_novos')::int from _r), 1, 'um cadastro novo no dia');
select is((select (r->'atual'->>'cancelamentos')::int from _r), 1, 'um cancelamento no dia');
select is((select (r->'atual'->>'estornos_cents')::int from _r), 0, 'o estorno do dia seguinte não entra neste dia');
select is((select (r->'semana_passada'->>'hub_receita_cents')::int from _r), 8000, 'comparação com 7 dias antes');
select is((select r->'compradores' from _r), '{"primeira": 1, "recompra": 1}'::jsonb, 'primeira compra e recompra');
select is((select (x->>'receita_cents')::int from _r, jsonb_array_elements(r->'canais') x where x->>'canal' = 'Site Parceiro'),
  15000, 'canal pela regra de comissão; sem canal nem UTM vira direto');
select is((select (r->'avaliacoes'->'baixas'->0->>'nota')::int from _r), 2, 'avaliação baixa aparece');
select is((select r->'alertas'->'leads_parceiro'->0->>'cidade' from _r), 'Campinas/SP', 'lead de parceiro com a cidade');
select is((select r->'repasses'->0->>'empresa' from _r), 'Equipe Park', 'repasse do dia');
select is((select (r->'hoje'->>'entradas')::int from _r), 1, 'entrada de amanhã (o dia do e-mail)');

select * from finish();
rollback;
