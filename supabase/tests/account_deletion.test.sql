-- pgTAP: E0.9 — exclusão de conta + anonimização (LGPD art. 18).
-- Cobre a RPC anonymize_own_account(): scrub da PII do próprio usuário (profiles + booking),
-- delete dos dados puramente pessoais (vehicle/address/profile_saved), preservação da venda
-- (booking permanece), isolamento (não toca em outro usuário) e a guarda "só consumidor".
-- Roda com: supabase test db (stack local — ver README.md). Transação + rollback.

begin;
select plan(11);

-- ── Fixture: 2 consumidores (u1 com dados; u2 controle) + 1 operador (u3) ────
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  v_lpt uuid;
  v_cid uuid;
  r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-u1@ex.com',now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-u2@ex.com',now(),now()),
    (u3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-u3@ex.com',now(),now());

  -- Perfis com PII completa.
  -- profiles.phone foi dropada (ADR-006: contato verificado mora em auth.users /
  -- snapshot da booking); a PII de telefone é anonimizada em booking.customer_phone.
  insert into public.profiles(id, role, first_name, last_name, tax_id, birth_date, avatar_url) values
    (u1,'customer','Maria','Silva','12345678900','1990-01-01','https://x/a.png'),
    (u2,'customer','João','Souza','98765432100','1985-05-05','https://x/b.png'),
    (u3,'company_operator','Op','Teste',null,null,null)
  on conflict (id) do nothing;

  -- u3 é membro de empresa (aciona a guarda "só consumidor").
  v_cid := public.submit_partner_lead('Estac Del QA','Op QA','qa-del@example.com','+5511988880000');
  insert into public.profile_company(profile_id, company_id) values (u3, v_cid);

  -- Uma vaga do seed com capacidade pra reservar.
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;

  -- Reserva de u1 (a venda que deve ser PRESERVADA, só anonimizada).
  r := public.create_booking_atomic(u1, v_lpt, '2027-01-10T12:00:00Z', '2027-01-12T12:00:00Z');
  update public.booking
     set customer_name='Maria Silva', customer_email='del-u1@ex.com', customer_phone='+5511999990001',
         notes='deixar na vaga 3', status='completed'
   where id = (r ->> 'booking_id')::uuid;

  -- Dados puramente pessoais de u1 (devem sumir).
  insert into public.vehicle(profile_id, license_plate) values (u1,'ABC1D23');
  insert into public.address(profile_id, street, city) values (u1,'Rua X','SP');
  insert into public.profile_saved(profile_id, location_parking_type_id) values (u1, v_lpt);

  -- Controle: u2 também tem um veículo (não pode ser tocado).
  insert into public.vehicle(profile_id, license_plate) values (u2,'XYZ9Z99');

  perform set_config('test.u1', u1::text, true);
  perform set_config('test.u2', u2::text, true);
  perform set_config('test.u3', u3::text, true);
end $$;

-- ── Anonimiza como u1 ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'))::text, true);
select lives_ok($$ select public.anonymize_own_account() $$, 'anonymize_own_account() roda pro próprio usuário');

-- ── Perfil: PII zerada + placeholder + deleted_at ───────────────────────────
select is((select full_name  from public.profiles where id = current_setting('test.u1')::uuid),
          '(Conta excluída)', 'full_name vira placeholder');
select is((select tax_id     from public.profiles where id = current_setting('test.u1')::uuid),
          null::text, 'tax_id (CPF) zerado');
select is((select birth_date from public.profiles where id = current_setting('test.u1')::uuid),
          null::date, 'birth_date zerada');
select isnt((select deleted_at from public.profiles where id = current_setting('test.u1')::uuid),
          null, 'deleted_at marcado');

-- ── Reserva: PII zerada mas a VENDA permanece (linha + profile_id) ──────────
select is((select count(*)::int from public.booking where profile_id = current_setting('test.u1')::uuid),
          1, 'reserva PRESERVADA (venda mantida, profile_id intacto)');
select is((select customer_name from public.booking where profile_id = current_setting('test.u1')::uuid limit 1),
          null::text, 'booking.customer_name zerado');

-- ── Dados pessoais removidos ────────────────────────────────────────────────
select is(
  (select count(*)::int from public.vehicle where profile_id = current_setting('test.u1')::uuid)
  + (select count(*)::int from public.address where profile_id = current_setting('test.u1')::uuid)
  + (select count(*)::int from public.profile_saved where profile_id = current_setting('test.u1')::uuid),
  0, 'vehicle/address/profile_saved de u1 removidos');

-- ── Isolamento: u2 intacto ──────────────────────────────────────────────────
select is((select full_name from public.profiles where id = current_setting('test.u2')::uuid),
          'João Souza', 'u2 (controle) não foi tocado');
select is((select count(*)::int from public.vehicle where profile_id = current_setting('test.u2')::uuid),
          1, 'veículo de u2 preservado');

-- ── Guarda "só consumidor": operador não pode se auto-anonimizar ────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u3'))::text, true);
select throws_ok($$ select public.anonymize_own_account() $$, 'P0001', null,
  'conta vinculada a empresa é bloqueada');

select * from finish();
rollback;
