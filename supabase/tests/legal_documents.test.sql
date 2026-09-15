-- pgTAP: documentos legais + aceite dos Termos (RFN005/LGPD).
-- Cobre: seed (v1), publish_legal_document (versão incrementa + ponteiro move, só hub_admin),
-- record_terms_acceptance (resolve versão vigente, idempotente por reserva). Transação + rollback.

begin;
select plan(9);

-- ── fixtures: um hub_admin + um customer com reserva ───────────────────────
-- is_hub_admin() consulta profiles.role do auth.uid() (não lê claim); criamos o admin e usamos
-- o uid dele no claim `sub` para simular a chamada autenticada.
do $$
declare v_admin uuid := gen_random_uuid(); v_cust uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','legaladmin@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_admin,'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  perform set_config('test.admin', v_admin::text, false);

  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','legalcust@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_cust,'customer') on conflict (id) do nothing;

  -- `limit 1` sem `order by` devolve linha arbitrária, que pode não ter preço para a estadia do
  -- teste: aí `create_booking_atomic` morre em "Preço indisponível" e derruba o arquivo na fixture.
  -- Escolha determinística E que precifica de fato, pela mesma `simulate_price` da reserva.
  select lpt.id into v_lpt
  from public.location_parking_type lpt
  join public.location l   on l.id = lpt.location_id
  join public.company c    on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
    and (public.simulate_price(c.slug, l.slug, pt.code, 1) ->> 'price') is not null
  order by c.slug, l.slug, pt.code
  limit 1;
  update public.location_parking_type set capacity = 5, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  -- Data relativa: cravada, ela vira passado sozinha e a reserva passa a ser recusada.
  r := public.create_booking_atomic(v_cust, v_lpt,
    ((current_date + 30) || 'T12:00:00Z')::timestamptz,
    ((current_date + 31) || 'T12:00:00Z')::timestamptz);
  perform set_config('test.booking', (r ->> 'booking_id'), false);

  -- A versão vigente ANTES do teste. Cravar 1 aqui só valia enquanto o seed fosse a única fonte
  -- de `terms`; qualquer publicação real (ou um seed com mais de uma versão) derruba os cinco
  -- casos de uma vez, e foi o que aconteceu. O que o teste tem que provar é que publicar
  -- INCREMENTA, não qual é o número de partida.
  perform set_config('test.v0',
    (select version::text from public.get_current_legal_document('terms')), false);
  perform set_config('test.n0',
    (select count(*)::text from public.legal_document_version where document_slug = 'terms'), false);
end $$;

-- ── 1) seed presente (vigente com conteúdo) ────────────────────────────────
select cmp_ok(
  (select version from public.get_current_legal_document('terms')), '>=', 1,
  'terms tem uma versão vigente');
select isnt((select content from public.get_current_legal_document('terms')), null, 'terms tem conteúdo');

-- ── 2) publish como hub_admin: versão +1, ponteiro move, histórico cresce ──
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.admin'), 'role', 'authenticated')::text, true);

select is(
  (public.publish_legal_document('terms', '<h2>Nova versão</h2><p>Conteúdo atualizado.</p>') ->> 'version')::int,
  current_setting('test.v0')::int + 1, 'publish incrementa a versão em 1');
select is(
  (select version from public.get_current_legal_document('terms')),
  current_setting('test.v0')::int + 1, 'o ponteiro move para a versão nova');
select is(
  (select count(*)::int from public.legal_document_version where document_slug = 'terms'),
  current_setting('test.n0')::int + 1, 'o histórico ganha uma linha, sem perder as anteriores');

reset role;
select set_config('request.jwt.claims', NULL, true);

-- ── 3) publish como customer (não-admin) → 42501 ───────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.publish_legal_document('terms', '<p>não autorizado</p>') $$,
  '42501', NULL, 'não-admin não publica documento legal');
reset role;
select set_config('request.jwt.claims', NULL, true);

-- ── 4) record_terms_acceptance resolve a versão vigente + idempotente ──────
select is(
  (public.record_terms_acceptance(current_setting('test.booking')::uuid, '1.2.3.4') ->> 'version')::int,
  current_setting('test.v0')::int + 1, 'aceite registra a versão vigente, a recém-publicada');
select is(
  (select count(*)::int from public.terms_acceptance where booking_id = current_setting('test.booking')::uuid),
  1, '1 aceite por reserva');

do $$ begin perform public.record_terms_acceptance(current_setting('test.booking')::uuid, '5.6.7.8'); end $$;
select is(
  (select count(*)::int from public.terms_acceptance where booking_id = current_setting('test.booking')::uuid),
  1, 'aceite é idempotente por reserva (re-aceite não duplica)');

select * from finish();
rollback;
