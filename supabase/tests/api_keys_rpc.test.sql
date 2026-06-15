-- pgTAP: Public API — chaves de API (E0.7). Ver docs/specs/public-api.md.
-- Gestão via RPC SECURITY DEFINER (escrita sem RLS direta), verificação pelo gateway,
-- guard de empresa (cross-tenant negado) e reserva atribuída à empresa. Roda em
-- transação com rollback.

begin;
select plan(16);

-- ── fixture: 2 empresas com operador + 1 unidade/tipo de vaga cada ───────────
do $$
declare
  u1 uuid := gen_random_uuid(); c1 uuid;
  u2 uuid := gen_random_uuid(); c2 uuid;
  v_lpt uuid;
begin
  -- empresa 1 (via lead → vira company pending) + operador vinculado
  c1 := public.submit_partner_lead('Empresa API 1','Op Um','op1@ex.com','+5511999990001','11111111000111');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','op1@ex.com',now(),now());
  insert into public.profiles(id, role) values (u1,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id) values (u1, c1) on conflict do nothing;

  c2 := public.submit_partner_lead('Empresa API 2','Op Dois','op2@ex.com','+5511999990002','22222222000122');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','op2@ex.com',now(),now());
  insert into public.profiles(id, role) values (u2,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id) values (u2, c2) on conflict do nothing;

  -- um tipo de vaga existente do seed (para a reserva por parceiro)
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.c1', c1::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.c2', c2::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1) catálogo de escopos seedado ───────────────────────────────────────────
select cmp_ok((select count(*)::int from public.api_scope), '>=', 12, 'api_scope seedado');
select ok(exists(select 1 from public.api_scope where scope = 'bookings:write'), 'escopo bookings:write existe');

-- ── 2) criação: como operador da empresa 1 ───────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'))::text, false);
set local role authenticated;

do $$
declare r jsonb;
begin
  r := public.operator_create_api_key(
    current_setting('test.c1')::uuid, 'Integração WPS', 'live',
    array['locations:read','bookings:read','bookings:write'], null);
  perform set_config('test.key', r->>'key', false);
  perform set_config('test.prefix', r->>'key_prefix', false);
  perform set_config('test.keyid', r->>'id', false);
end $$;

select like(current_setting('test.key'), 'mp_live_%', 'segredo tem prefixo mp_live_');
select is(left(current_setting('test.key'),16), current_setting('test.prefix'), 'key_prefix = 16 primeiros chars');
select is((select count(*)::int from public.api_key where company_id = current_setting('test.c1')::uuid), 1, 'chave persistida na empresa');
select ok((select key_hash <> current_setting('test.key') from public.api_key where id = current_setting('test.keyid')::uuid),
  'armazena hash, não o segredo');

-- ── 3) listagem não devolve o hash ───────────────────────────────────────────
select ok(
  not (public.operator_list_api_keys(current_setting('test.c1')::uuid)::text like '%key_hash%'),
  'operator_list_api_keys não expõe key_hash');

-- ── 4) escopo inválido é rejeitado ───────────────────────────────────────────
select throws_ok(
  format($q$ select public.operator_create_api_key(%L::uuid,'X','live',array['bogus:scope'],null) $q$,
    current_setting('test.c1')),
  'P0001', NULL, 'escopo fora do catálogo é rejeitado');

-- ── 5) cross-tenant: operador 2 não cria chave na empresa 1 ──────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u2'))::text, false);
select throws_ok(
  format($q$ select public.operator_create_api_key(%L::uuid,'X','live',array['locations:read'],null) $q$,
    current_setting('test.c1')),
  '42501', NULL, 'operador de outra empresa é bloqueado (42501)');

-- ── 6) verify (gateway, service_role) ────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', NULL, false);

select is(
  (public.api_key_verify(current_setting('test.prefix'), encode(extensions.digest(current_setting('test.key')::bytea,'sha256'),'hex'))->>'ok')::boolean,
  true, 'verify aceita chave válida');
select is(
  public.api_key_verify(current_setting('test.prefix'), 'hash_errado')->>'ok',
  'false', 'verify rejeita hash errado');

-- revoga e verifica
do $$ begin perform public.operator_revoke_api_key(current_setting('test.keyid')::uuid); end $$;
select is(
  public.api_key_verify(current_setting('test.prefix'), encode(extensions.digest(current_setting('test.key')::bytea,'sha256'),'hex'))->>'reason',
  'revoked', 'verify rejeita chave revogada');

-- ── 7) reserva por parceiro: atribuída à empresa + idempotência ──────────────
-- o lpt vem do seed → cria uma chave para a empresa DONA desse lpt
do $$
declare r jsonb; v_company uuid; v_keyid uuid;
begin
  select l.company_id into v_company
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.id = current_setting('test.lpt')::uuid;
  perform set_config('test.cbk', v_company::text, false);

  insert into public.api_key (company_id, name, key_prefix, key_hash, environment, scopes)
  values (v_company, 'seed key', 'mp_test_seedkey0', 'x', 'test', array['bookings:write','bookings:cancel'])
  returning id into v_keyid;
  perform set_config('test.seedkey', v_keyid::text, false);

  r := public.api_create_booking(
    v_company, v_keyid, current_setting('test.lpt')::uuid,
    '2027-03-10T12:00:00Z'::timestamptz, '2027-03-12T12:00:00Z'::timestamptz,
    'Cliente Parceiro','cli@ex.com','+5511988887777', null, false, null, null, 'IDEM-1', 'api');
  perform set_config('test.bkid', r->>'booking_id', false);
end $$;

select ok((select profile_id is null and created_via_api_key_id is not null
  from public.booking where id = current_setting('test.bkid')::uuid),
  'reserva por API tem profile_id null e created_via_api_key_id setado');
select is((select customer_email from public.booking where id = current_setting('test.bkid')::uuid),
  'cli@ex.com', 'contato do cliente gravado');

-- idempotência: mesmo idempotency_key → mesma reserva
do $$
declare r jsonb;
begin
  r := public.api_create_booking(
    current_setting('test.cbk')::uuid, current_setting('test.seedkey')::uuid, current_setting('test.lpt')::uuid,
    '2027-03-10T12:00:00Z'::timestamptz, '2027-03-12T12:00:00Z'::timestamptz,
    'Cliente Parceiro','cli@ex.com','+5511988887777', null, false, null, null, 'IDEM-1', 'api');
  perform set_config('test.bkid2', r->>'booking_id', false);
end $$;
select is(current_setting('test.bkid2'), current_setting('test.bkid'), 'idempotency_key devolve a mesma reserva');

-- cross-tenant na escrita: empresa 2 (sem esse lpt) é negada
select throws_ok(
  format($q$ select public.api_create_booking(%L::uuid, %L::uuid, %L::uuid,
    '2027-04-10T12:00:00Z'::timestamptz,'2027-04-12T12:00:00Z'::timestamptz) $q$,
    current_setting('test.c2'), current_setting('test.seedkey'), current_setting('test.lpt')),
  'P0001', NULL, 'api_create_booking nega lpt de outra empresa');

select * from finish();
rollback;
