-- pgTAP: E3.2, motor RFM, campos comportamentais e segmentos automáticos
-- (migration 20261029093000_marketing_rfm_growth).
--   - normalização de marca sobre o campo livre vehicle.model, que chega sujo;
--   - quintis do RFM e exclusão de quem nunca comprou;
--   - o M promovendo "perdidos VIP" dentro da célula;
--   - segmento de sistema não se apaga;
--   - as RPCs de painel são fechadas para quem não é hub_admin.
-- Roda com: supabase test db. Transação + rollback.

begin;
select plan(14);

-- ── 1. Marca e origem a partir do campo livre ───────────────────────────────
-- O campo é digitado, não escolhido: pegar a primeira palavra devolveria "ONIX" como marca.
select is(public.marketing_vehicle_brand('PEUGEOT/2008 ALLURE A'), 'PEUGEOT',
          'marca sai do texto com barra');
select is(public.marketing_vehicle_brand('Onix'), 'CHEVROLET',
          'só o modelo já resolve a marca');
select is(public.marketing_vehicle_brand('VW - VOLKSWAGEN SANTANA CS/CD/CG'), 'VOLKSWAGEN',
          'sigla VW normaliza para VOLKSWAGEN');
select is(public.marketing_vehicle_brand('nave espacial'), null,
          'texto desconhecido não inventa marca');
select is(public.marketing_vehicle_origin('BMW 320i'), 'importada',
          'marca premium classifica como importada');
select is(public.marketing_vehicle_origin('Onix'), 'nacional',
          'marca com fábrica no Brasil classifica como nacional');

-- ── Fixture: 5 clientes com padrões de compra diferentes, num só estacionamento ──
do $$
declare
  v_loc uuid;
  v_uid uuid;
  v_emails text[] := array['rfm-a@ex.com','rfm-b@ex.com','rfm-c@ex.com','rfm-d@ex.com','rfm-e@ex.com'];
  -- Quantas reservas pagas cada um tem, e há quantos dias foi a última.
  v_qtd int[]  := array[10, 6, 4, 2, 1];
  v_dias int[] := array[2, 20, 60, 200, 400];
  v_valor numeric[] := array[500, 300, 200, 100, 50];
  i int;
  k int;
begin
  select id into v_loc from public.location where deleted_at is null limit 1;

  for i in 1..5 loop
    v_uid := gen_random_uuid();
    insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
      values (v_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
              v_emails[i], now(), now());
    insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;

    for k in 1..v_qtd[i] loop
      insert into public.booking (code, profile_id, location_id, status, total_amount,
                                  customer_email, created_at, check_in_at, check_out_at)
      values ('MP-RFM-' || i || '-' || k, v_uid, v_loc, 'completed', v_valor[i],
              v_emails[i],
              now() - make_interval(days => v_dias[i] + (k - 1) * 7),
              now() - make_interval(days => v_dias[i] + (k - 1) * 7) + interval '1 day',
              now() - make_interval(days => v_dias[i] + (k - 1) * 7) + interval '2 days');
    end loop;
  end loop;

  -- Um lead: contato sem nenhuma compra. Ele NÃO pode entrar no cálculo do quintil.
  v_uid := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'rfm-lead@ex.com', now(), now());
  insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;
  insert into public.booking (code, profile_id, location_id, status, total_amount,
                              customer_email, created_at, check_in_at, check_out_at)
  values ('MP-RFM-LEAD', v_uid, v_loc, 'cancelled', 90, 'rfm-lead@ex.com',
          now() - interval '5 days', now() - interval '4 days', now() - interval '3 days');
end $$;

-- ── 2. Quem nunca comprou fica fora do cálculo ──────────────────────────────
-- Deixá-lo dentro empurraria todo mundo um quintil para cima e inventaria "campeões".
select ok(
  (select not eligible from public.marketing_contact_rfm() where contact_key = 'rfm-lead@ex.com'),
  'contato só com reserva cancelada não é elegível ao RFM');

select is(
  (select r_score from public.marketing_contact_rfm() where contact_key = 'rfm-lead@ex.com'),
  null,
  'contato não elegível não recebe score');

-- ── 3. Os scores respeitam a ordem do comportamento ─────────────────────────
select ok(
  (select r_score from public.marketing_contact_rfm() where contact_key = 'rfm-a@ex.com')
  > (select r_score from public.marketing_contact_rfm() where contact_key = 'rfm-e@ex.com'),
  'quem comprou há 2 dias tem recência maior que quem sumiu há 400');

select ok(
  (select f_score from public.marketing_contact_rfm() where contact_key = 'rfm-a@ex.com')
  > (select f_score from public.marketing_contact_rfm() where contact_key = 'rfm-e@ex.com'),
  'quem tem 10 reservas tem frequência maior que quem tem 1');

select ok(
  (select m_score from public.marketing_contact_rfm() where contact_key = 'rfm-a@ex.com')
  > (select m_score from public.marketing_contact_rfm() where contact_key = 'rfm-e@ex.com'),
  'quem gerou mais receita tem monetário maior');

-- ── 4. O M é a terceira dimensão: promove dentro da célula ──────────────────
-- Um contato frio com M no topo vira "perdidos VIP" em vez de sumir junto dos "perdidos".
select ok(
  not exists (
    select 1 from public.marketing_contact_rfm()
    where m_score = 5 and rfm_cell in ('em_risco', 'alto_risco', 'inativos', 'perdidos')
      and rfm_segment <> 'perdidos_vip'),
  'contato frio com M máximo é promovido a perdidos VIP');

-- ── 5. Segmento de sistema não se apaga ─────────────────────────────────────
-- Apagar levaria a campanha vinculada junto e abriria buraco na matriz.
select throws_ok(
  $$update public.marketing_segment set deleted_at = now() where slug = 'campeoes'$$,
  '23514',
  null,
  'exclusão de segmento do modelo RFM é recusada');

select ok(
  (select count(*) from public.marketing_segment where is_system and deleted_at is null) >= 11,
  'os segmentos automáticos da proposta nascem semeados');

-- ── 6. As RPCs de painel são de hub_admin ───────────────────────────────────
do $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'rfm-intruso@ex.com', now(), now());
  insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;

select throws_ok(
  $$select public.marketing_rfm_overview()$$,
  '42501', null,
  'painel RFM recusa quem não é hub_admin');

select throws_ok(
  $$select public.marketing_discoveries()$$,
  '42501', null,
  'descobertas recusam quem não é hub_admin');

reset role;

select * from finish();
rollback;
