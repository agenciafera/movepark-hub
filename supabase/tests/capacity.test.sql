-- pgTAP: reserva + capacidade (create_booking_atomic / release_booking_capacity).
-- Hold atômico: cada data da estadia incrementa location_parking_availability.booked_count;
-- se booked_count >= capacity → erro. Roda em transação com rollback.

begin;
select plan(11);

-- ── fixture: DOIS customers + um tipo de vaga do seed com capacidade = 1 ────
-- O 2º cliente existe porque create_booking_atomic deduplica por (cliente + compra): repetir a
-- mesma chamada com o MESMO cliente devolve replay da pending e nunca chega no guard que se quer
-- testar. Um segundo cliente disputando a mesma vaga é o modelo real da capacidade. Ver 86ajmycpc.
do $$
declare u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cap@ex.com',now(),now()),
           (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cap2@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer'), (u2,'customer') on conflict (id) do nothing;
  -- `limit 1` sem `order by` devolve linha arbitrária, e a arbitrária pode não ter preço para a
  -- estadia do teste: aí `create_booking_atomic` morre em "Preço indisponível" e o arquivo inteiro
  -- cai por causa da fixture, não da regra. Aqui a escolha é determinística E exige que a linha
  -- precifique de fato, pela mesma `simulate_price` que a criação da reserva usa.
  select lpt.id into v_lpt
  from public.location_parking_type lpt
  join public.location l   on l.id = lpt.location_id
  join public.company c    on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
    and (public.simulate_price(c.slug, l.slug, pt.code, 2) ->> 'price') is not null
  order by c.slug, l.slug, pt.code
  limit 1;
  -- Normaliza a linha emprestada do banco, não só a capacidade: ela pode já vir com estadia
  -- mínima ou data mínima ligadas, e aí a reserva do happy path morre antes de testar capacidade.
  -- Cada seção liga o que precisa e desliga depois.
  update public.location_parking_type
     set capacity = 1, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.lpt', v_lpt::text, false);

  -- Datas relativas a hoje, nunca cravadas. O arquivo nasceu com 10-12/set de 2026 e passou a
  -- falhar sozinho quando essa data virou passado ("A data e o horário de entrada não podem estar
  -- no passado"), derrubando o teste inteiro por envelhecimento e não por regressão.
  perform set_config('test.d_in',   (current_date + 30)::text,  false);
  perform set_config('test.d_out',  (current_date + 32)::text,  false);
  perform set_config('test.d2_in',  (current_date + 45)::text,  false);
  perform set_config('test.d2_out', (current_date + 47)::text,  false);
  perform set_config('test.d_min',  (current_date + 400)::text, false);
end $$;

-- ── 1) happy path: cria reserva de duas diárias ────────────────────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    (current_setting('test.d_in') || 'T12:00:00Z')::timestamptz,
    (current_setting('test.d_out') || 'T12:00:00Z')::timestamptz);
  perform set_config('test.bk', r::text, false);
end $$;

select ok((current_setting('test.bk')::jsonb->>'code') is not null, 'reserva criada tem code');
select ok((current_setting('test.bk')::jsonb->>'booking_id') is not null, 'reserva tem booking_id');
select cmp_ok((current_setting('test.bk')::jsonb->>'total_amount')::numeric, '>', 0::numeric, 'total_amount > 0');
select is((current_setting('test.bk')::jsonb->>'days')::int, 2, 'days = 2 (entrada → saída)');

-- booked_count = 1 na primeira data
select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = current_setting('test.d_in')::date),
  1, 'booked_count incrementado para 1');

-- ── 2) capacidade esgotada: 2ª reserva nas MESMAS datas → erro ─────────────
select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt'),
    current_setting('test.d_in') || 'T12:00:00Z', current_setting('test.d_out') || 'T12:00:00Z'),
  'P0001', NULL,
  'segunda reserva nas mesmas datas é bloqueada por capacidade');

-- ── 3) release devolve a capacidade ────────────────────────────────────────
do $$
begin
  perform public.release_booking_capacity((current_setting('test.bk')::jsonb->>'booking_id')::uuid);
end $$;

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = current_setting('test.d_in')::date), 0),
  0, 'release_booking_capacity zera o booked_count');

-- ── 4) estadia mínima bloqueia a reserva ───────────────────────────────────
update public.location_parking_type
   set has_minimum_stay = true, minimum_stay_value = 5, minimum_stay_unit = 'days'
 where id = current_setting('test.lpt')::uuid;

select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt'),
    current_setting('test.d_in') || 'T12:00:00Z', current_setting('test.d_out') || 'T12:00:00Z'),
  'P0001', NULL,
  'estadia abaixo do mínimo é bloqueada');

update public.location_parking_type set has_minimum_stay = false where id = current_setting('test.lpt')::uuid;

-- ── 5) data mínima de entrada bloqueia a reserva ───────────────────────────
update public.location_parking_type
   set has_minimum_date = true, minimum_date = current_setting('test.d_min')::date
 where id = current_setting('test.lpt')::uuid;

select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt'),
    current_setting('test.d_in') || 'T12:00:00Z', current_setting('test.d_out') || 'T12:00:00Z'),
  'P0001', NULL,
  'entrada antes da data mínima é bloqueada');

update public.location_parking_type set has_minimum_date = false where id = current_setting('test.lpt')::uuid;

-- ── 6) expiração de pending abandonado libera o hold e marca expired ────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    (current_setting('test.d2_in') || 'T12:00:00Z')::timestamptz,
    (current_setting('test.d2_out') || 'T12:00:00Z')::timestamptz);
  -- backdata o vencimento p/ simular abandono
  update public.booking set expires_at = now() - interval '1 hour'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.exp', r::text, false);
  perform public.cron_expire_pending_bookings();
end $$;

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = current_setting('test.d2_in')::date), 0),
  0, 'cron_expire_pending_bookings devolve a vaga');

select is(
  (select status::text from public.booking
   where id = (current_setting('test.exp')::jsonb ->> 'booking_id')::uuid),
  'expired', 'cron_expire_pending_bookings marca o abandono como expired');

select * from finish();
rollback;
