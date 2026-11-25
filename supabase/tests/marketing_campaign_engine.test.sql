-- pgTAP: motor de campanha e funil do marketing (correções de 25/11/2026, migration
-- 20261207100000_marketing_automacao_correcoes).
--   - a matrícula grava a campanha e o contato nas colunas certas. Antes o select vinha na ordem
--     trocada, a FK de campaign_id recusava o insert e nenhuma campanha conseguia rodar;
--   - o funil enxerga a reserva expirada e a cancelada, que `cancel_booking_with_release` apaga
--     (soft delete). Antes elas sumiam e o funil mostrava 100% de conversão;
--   - o detector de cancelamento divide pelo que foi pago, não pelo carrinho abandonado.
-- Roda com: supabase test db. Transação + rollback.

begin;
select plan(11);

-- ── Fixture: unidade própria, um cliente, um admin, um segmento e uma campanha ──
-- Unidade própria porque o funil e o detector são lidos por unidade: com uma unidade do seed, a
-- reserva real de produção entraria na conta e o número esperado deixaria de ser fixo.
do $$
declare
  cid uuid := gen_random_uuid();
  loc uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  seg uuid := gen_random_uuid();
  camp uuid := gen_random_uuid();
  b uuid;
  i int;
begin
  insert into public.company(id, name, slug, status, onboarding_status)
    values (cid, 'Mkt Teste Empresa', 'mkt-teste-empresa', 'active', 'active');
  insert into public.location(id, company_id, name, slug, status, photos, checkout_mode)
    values (loc, cid, 'Mkt Teste Unidade', 'mkt-teste-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, 'hub');

  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-teste-cliente@ex.com', now(), now()),
           (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-teste-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';

  -- 4 estadias concluídas (o que foi pago e ficou).
  for i in 1..4 loop
    insert into public.booking(code, profile_id, location_id, status, total_amount, customer_email,
                               created_at, check_in_at, check_out_at)
    values ('MP-MKT-OK-' || i, u, loc, 'completed', 100, 'mkt-teste-cliente@ex.com',
            now() - interval '2 days', now() - interval '1 day', now() - interval '12 hours');
  end loop;

  -- 1 paga e depois cancelada, pelo caminho de verdade (vira cancelled + deleted_at).
  insert into public.booking(code, profile_id, location_id, status, total_amount, customer_email,
                             created_at, check_in_at, check_out_at)
  values ('MP-MKT-CANC', u, loc, 'confirmed', 100, 'mkt-teste-cliente@ex.com',
          now() - interval '2 days', now() + interval '5 days', now() + interval '7 days')
  returning id into b;
  perform public.cancel_booking_with_release(b, 'teste pgTAP');

  -- 10 carrinhos abandonados, pelo caminho de verdade (pending sem pagamento vira expired +
  -- deleted_at). São eles que o funil não via.
  for i in 1..10 loop
    insert into public.booking(code, profile_id, location_id, status, total_amount, customer_email,
                               created_at, check_in_at, check_out_at, expires_at)
    values ('MP-MKT-EXP-' || i, u, loc, 'pending', 100, 'mkt-teste-cliente@ex.com',
            now() - interval '2 days', now() + interval '5 days', now() + interval '7 days',
            now() - interval '1 day')
    returning id into b;
    perform public.cancel_booking_with_release(b, 'teste pgTAP');
  end loop;

  insert into public.marketing_segment(id, name, slug, definition)
    values (seg, 'Mkt teste', 'mkt-teste-segmento',
            '{"match":"all","rules":[{"field":"email","op":"eq","value":"mkt-teste-cliente@ex.com"}]}'::jsonb);
  insert into public.marketing_campaign(id, name, slug, segment_id, send_cap)
    values (camp, 'Mkt teste', 'mkt-teste-campanha', seg, 10);

  perform set_config('test.loc', loc::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.camp', camp::text, false);
end $$;

-- ── 1. A matrícula grava campanha e contato nas colunas certas ──────────────
select lives_ok(
  $$select public.marketing_enroll_campaign(current_setting('test.camp')::uuid)$$,
  'matricular não viola a FK de campaign_id (regressão: colunas trocadas no insert)');

select is(
  (select count(*)::int from public.marketing_enrollment
    where campaign_id = current_setting('test.camp')::uuid),
  1,
  'o contato do segmento fica matriculado na campanha');

select is(
  (select c.contact_key from public.marketing_enrollment e
     join public.marketing_contact c on c.id = e.contact_id
    where e.campaign_id = current_setting('test.camp')::uuid),
  'mkt-teste-cliente@ex.com',
  'contact_id aponta para o contato, não para a campanha');

select is(
  (public.marketing_enroll_campaign(current_setting('test.camp')::uuid) ->> 'enrolled')::int,
  0,
  'matricular de novo não duplica quem já está na campanha');

-- ── 2. O funil enxerga expirada e cancelada ─────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (public.marketing_conversion_funnel(now() - interval '7 days', now() + interval '1 day',
     array[current_setting('test.loc')::uuid]) -> 'steps' -> 0 ->> 'count')::int,
  15,
  'reservas criadas contam o carrinho abandonado e a cancelada');

select is(
  (public.marketing_conversion_funnel(now() - interval '7 days', now() + interval '1 day',
     array[current_setting('test.loc')::uuid]) -> 'steps' -> 1 ->> 'count')::int,
  4,
  'pagas continuam sendo só as que ficaram pagas');

select is(
  (public.marketing_conversion_funnel(now() - interval '7 days', now() + interval '1 day',
     array[current_setting('test.loc')::uuid]) -> 'losses' ->> 'expiradas')::int,
  10,
  'expiradas aparecem como perda (regressão: o soft delete escondia todas)');

select is(
  (public.marketing_conversion_funnel(now() - interval '7 days', now() + interval '1 day',
     array[current_setting('test.loc')::uuid]) -> 'losses' ->> 'canceladas')::int,
  1,
  'cancelada aparece como perda');

-- ── 3. O detector de cancelamento divide pelo que foi pago ──────────────────
-- 1 cancelada em 5 pagas = 20%, no limite do alerta. Dividindo pelas 15 criadas daria 6,7% e o
-- detector ficaria calado justamente na unidade que cancela.
select ok(
  exists (
    select 1
    from jsonb_array_elements(public.marketing_discoveries(
           array[current_setting('test.loc')::uuid], 90) -> 'items') it
    where it ->> 'key' = 'cancelamento_Mkt Teste Unidade'
      and it ->> 'headline' like '%(1 de 5)%'),
  'cancelamento é 1 de 5 pagas, sem contar carrinho abandonado');

reset role;

-- ── 4. Métricas de contato não confundem tentativa com compra ───────────────
-- Com as expiradas visíveis na base, quem comprou 4 vezes continua com 4 compras.
select is(
  (select bookings_count from public.marketing_contact_metrics(
     array[current_setting('test.loc')::uuid])
    where contact_key = 'mkt-teste-cliente@ex.com'),
  4,
  'expirada e cancelada não contam como compra do contato');

select is(
  (select cancelled_count from public.marketing_contact_metrics(
     array[current_setting('test.loc')::uuid])
    where contact_key = 'mkt-teste-cliente@ex.com'),
  1,
  'a cancelada passa a contar no histórico do contato');

select * from finish();
rollback;
