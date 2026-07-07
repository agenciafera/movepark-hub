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

  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  r := public.create_booking_atomic(v_cust, v_lpt, '2026-11-10T12:00:00Z', '2026-11-11T12:00:00Z');
  perform set_config('test.booking', (r ->> 'booking_id'), false);
end $$;

-- ── 1) seed presente (v1 com conteúdo) ─────────────────────────────────────
select is((select version from public.get_current_legal_document('terms')), 1, 'terms começa na v1 (seed)');
select isnt((select content from public.get_current_legal_document('terms')), null, 'terms tem conteúdo');

-- ── 2) publish como hub_admin → v2, ponteiro move, histórico cresce ────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.admin'), 'role', 'authenticated')::text, true);

select is(
  (public.publish_legal_document('terms', '<h2>Nova versão</h2><p>Conteúdo atualizado.</p>') ->> 'version')::int,
  2, 'publish incrementa para v2');
select is((select version from public.get_current_legal_document('terms')), 2, 'ponteiro move para v2');
select is(
  (select count(*)::int from public.legal_document_version where document_slug = 'terms'),
  2, 'histórico tem 2 versões');

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
  2, 'aceite registra a versão vigente (v2)');
select is(
  (select count(*)::int from public.terms_acceptance where booking_id = current_setting('test.booking')::uuid),
  1, '1 aceite por reserva');

do $$ begin perform public.record_terms_acceptance(current_setting('test.booking')::uuid, '5.6.7.8'); end $$;
select is(
  (select count(*)::int from public.terms_acceptance where booking_id = current_setting('test.booking')::uuid),
  1, 'aceite é idempotente por reserva (re-aceite não duplica)');

select * from finish();
rollback;
