-- pgTAP: tolerância de saída (86ajp6vrq). A contagem de diárias arredonda qualquer
-- excedente para cima; `location.tolerance_minutes` é o excedente que NÃO vira diária nova.
-- Prova a regra pelo `price_breakdown.days` que a criação persiste. Transação com rollback.
--
-- Cada caso usa uma janela de datas diferente de propósito: a idempotência da reserva
-- dedupa (mesmo usuário, mesma vaga, mesmas datas) e devolveria a reserva anterior,
-- mascarando o efeito da tolerância.

begin;
select plan(5);

select has_column('public', 'location', 'tolerance_minutes', 'location.tolerance_minutes existe');

-- Padrão da plataforma: 60 minutos, honrando a FAQ global que promete
-- "60 minutos depois sem cobrança". Unidade nova já nasce com a promessa valendo.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'location' and column_name = 'tolerance_minutes'),
  '60', 'tolerance_minutes nasce com default 60 (padrão da plataforma)');

-- ── fixture: customer + um tipo de vaga do seed, sem estadia mínima ──────────
do $$
declare
  u uuid := gen_random_uuid();
  v_lpt uuid; v_loc uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tol@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;

  select lpt.id, lpt.location_id into v_lpt, v_loc
    from public.location_parking_type lpt
   where lpt.capacity > 0 and lpt.is_active
   limit 1;

  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false
   where id = v_lpt;

  -- A) sem tolerância: 2 dias e 30 minutos cobram 3 diárias (o arredondamento de sempre)
  update public.location set tolerance_minutes = 0 where id = v_loc;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:30:00Z');
  perform set_config('test.sem_tolerancia', r::text, false);

  -- B) tolerância de 60: a MESMA duração (2 dias e 30 minutos) cobra 2 diárias
  update public.location set tolerance_minutes = 60 where id = v_loc;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-14T12:00:00Z', '2026-12-16T12:30:00Z');
  perform set_config('test.com_tolerancia', r::text, false);

  -- C) além da tolerância: 2 dias e 90 minutos com tolerância 60 volta a cobrar 3
  r := public.create_booking_atomic(u, v_lpt, '2026-12-18T12:00:00Z', '2026-12-20T13:30:00Z');
  perform set_config('test.alem_tolerancia', r::text, false);
end $$;

select is(
  (select (price_breakdown ->> 'days')::int from public.booking
    where id = (current_setting('test.sem_tolerancia')::jsonb ->> 'booking_id')::uuid),
  3, 'sem tolerância: 2 dias e 30 min cobram 3 diárias');

select is(
  (select (price_breakdown ->> 'days')::int from public.booking
    where id = (current_setting('test.com_tolerancia')::jsonb ->> 'booking_id')::uuid),
  2, 'tolerância de 60 min: a mesma duração cobra 2 diárias');

select is(
  (select (price_breakdown ->> 'days')::int from public.booking
    where id = (current_setting('test.alem_tolerancia')::jsonb ->> 'booking_id')::uuid),
  3, 'passou da tolerância (90 min > 60): volta a cobrar 3 diárias');

select * from finish();
rollback;
