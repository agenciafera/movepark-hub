-- pgTAP: RPCs do dashboard do Manager (manager_dashboard_overview e manager_daily_flow).
-- Elas trazem pro Hub os indicadores de operação que só existiam no backoffice legado
-- (diárias vendidas, quebra por destino, permanência, fluxo horário).
--
-- Gate: is_hub_admin() (ADR-005). anon não executa; customer é barrado com 42501.
-- As assertivas de número usam um destino próprio da fixture (o resumo é hub-wide,
-- então somar em cima do seed daria número instável) ou comparam antes/depois.
-- Transação com rollback; timezone fixado em UTC pra ::date ser determinístico.

begin;
set local time zone 'UTC';
select plan(17);

select has_function('public', 'manager_dashboard_overview',
  ARRAY['timestamptz', 'timestamptz', 'timestamptz', 'timestamptz', 'uuid[]'],
  'manager_dashboard_overview(from, to, compare_from, compare_to, location_ids) existe');
select has_function('public', 'manager_daily_flow', ARRAY['date', 'uuid[]'],
  'manager_daily_flow(date, uuid[]) existe');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'manager_dashboard_overview'),
  true, 'manager_dashboard_overview é SECURITY DEFINER');

-- ── Grants: privilegiada, então anon fica de fora ────────────────────────────
select ok(not has_function_privilege('anon',
  'public.manager_dashboard_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid[])', 'EXECUTE'),
  'anon NÃO executa manager_dashboard_overview');
select ok(not has_function_privilege('anon', 'public.manager_daily_flow(date, uuid[])', 'EXECUTE'),
  'anon NÃO executa manager_daily_flow');
select ok(has_function_privilege('authenticated',
  'public.manager_dashboard_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid[])', 'EXECUTE'),
  'authenticated mantém EXECUTE (o gate é o is_hub_admin lá dentro)');

-- ── Fixture: hub_admin, customer, destino/unidade próprios e reservas ────────
do $$
declare
  ua uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  v_company uuid;
  v_dest uuid;
  v_loc uuid;
  v_code text := 'MDT' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_day timestamptz := date_trunc('day', now());
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mdash-admin@ex.com', now(), now()),
    (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mdash-cust@ex.com', now(), now());
  -- `do update`, não `do nothing`: o trigger on_auth_user_created já cria o profile
  -- como `customer`, então um `do nothing` deixaria o "hub_admin" da fixture sem o papel.
  insert into public.profiles(id, role) values (ua, 'hub_admin'), (uc, 'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.destination (code, name, short_name, type, city, state, latitude, longitude, slug)
    values (v_code, 'Aeroporto de Teste', 'Teste', 'airport', 'São Paulo', 'SP', -23.4, -46.4,
            lower(v_code))
    returning id into v_dest;

  insert into public.company (name, slug) values ('Manager Dash Co', 'manager-dash-' || v_code)
    returning id into v_company;
  insert into public.location (company_id, name, slug, destination_id, timezone)
    values (v_company, 'Manager Dash Loc', 'manager-dash-loc-' || v_code, v_dest, 'America/Sao_Paulo')
    returning id into v_loc;

  -- Estadia de 4 dias-calendário (20, 21, 22, 23 → check-out no 4º dia).
  insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status,
                              total_amount, passenger_count)
  values ('MP-' || v_code || '-A', uc, v_loc,
          v_day - interval '5 days' + interval '10 hours',
          v_day - interval '2 days' + interval '10 hours',
          'confirmed', 400, 2);

  -- Estadia no mesmo dia: 1 diária.
  insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status,
                              total_amount, passenger_count)
  values ('MP-' || v_code || '-B', uc, v_loc,
          v_day - interval '3 days' + interval '8 hours',
          v_day - interval '3 days' + interval '20 hours',
          'confirmed', 100, 1);

  -- Cancelada: entra no funil de status, fica fora de receita e diárias.
  insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status,
                              total_amount)
  values ('MP-' || v_code || '-C', uc, v_loc,
          v_day - interval '1 day' + interval '9 hours',
          v_day - interval '1 day' + interval '18 hours',
          'cancelled', 999);

  perform set_config('test.ua', ua::text, false);
  perform set_config('test.uc', uc::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.dest', v_code, false);
end $$;

-- ── Gate: customer é barrado nas duas ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uc'))::text, true);
select throws_ok(
  $$ select public.manager_dashboard_overview(now() - interval '30 days', now()) $$,
  '42501', null, 'customer não lê o resumo do dashboard');
select throws_ok(
  $$ select public.manager_daily_flow(current_date) $$,
  '42501', null, 'customer não lê o fluxo diário');
reset role;

-- ── hub_admin lê ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);

select lives_ok(
  $$ select public.manager_dashboard_overview(now() - interval '30 days', now()) $$,
  'hub_admin lê o resumo do dashboard');

-- O resumo é hub-wide, então as assertivas leem só a linha do destino da fixture.
select is(
  (select (d ->> 'bookings')::int
     from jsonb_array_elements(
       public.manager_dashboard_overview(now() - interval '30 days', now()) -> 'by_destination'
     ) d
    where d ->> 'code' = current_setting('test.dest')),
  2, 'reserva cancelada fica fora da contagem de reservas pagas do destino');
select is(
  (select (d ->> 'revenue')::numeric
     from jsonb_array_elements(
       public.manager_dashboard_overview(now() - interval '30 days', now()) -> 'by_destination'
     ) d
    where d ->> 'code' = current_setting('test.dest')),
  500::numeric, 'receita do destino soma só as pagas (400 + 100)');
-- 4 dias-calendário + 1 (estadia no mesmo dia conta 1), a mesma convenção da capacidade.
select is(
  (select (d ->> 'vehicle_days')::int
     from jsonb_array_elements(
       public.manager_dashboard_overview(now() - interval '30 days', now()) -> 'by_destination'
     ) d
    where d ->> 'code' = current_setting('test.dest')),
  5, 'diárias contam dia-calendário ocupado, e a estadia no mesmo dia vale 1');

-- ── Novos x recorrentes: a 2ª reserva do mesmo cliente é recorrente ──────────
select set_config('test.ret_before',
  (public.manager_dashboard_overview(now() - interval '30 days', now()) #>> '{customers,returning}'),
  false);
reset role;

insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
values ('MP-' || current_setting('test.dest') || '-D', current_setting('test.uc')::uuid,
        current_setting('test.loc')::uuid,
        date_trunc('day', now()) - interval '4 days' + interval '11 hours',
        date_trunc('day', now()) - interval '4 days' + interval '19 hours',
        'confirmed', 150);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select is(
  (public.manager_dashboard_overview(now() - interval '30 days', now()) #>> '{customers,returning}')::int,
  current_setting('test.ret_before')::int + 1,
  'reserva nova de quem já comprou entra como cliente recorrente');
reset role;

-- ── Recorte por unidade ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
-- Filtrando pela unidade da fixture, o total do período é só o dela (3 pagas: 400 + 100 + 150).
select is(
  (public.manager_dashboard_overview(now() - interval '30 days', now(), null, null,
     array[current_setting('test.loc')::uuid]) #>> '{current,bookings}')::int,
  3, 'p_location_ids recorta o resumo na unidade escolhida');
-- Array vazio quer dizer "todas", não "nenhuma": o filtro limpo não pode zerar a tela.
select is(
  (public.manager_dashboard_overview(now() - interval '30 days', now(), null, null, '{}'::uuid[])
     #>> '{current,bookings}')::int,
  (public.manager_dashboard_overview(now() - interval '30 days', now()) #>> '{current,bookings}')::int,
  'array vazio de unidades vale como toda a rede');
reset role;

-- ── Fluxo horário: a hora sai no fuso da unidade ─────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select set_config('test.flow_before', coalesce((
  select h ->> 'vehicles'
  from jsonb_array_elements(
    public.manager_daily_flow((now() at time zone 'America/Sao_Paulo')::date) -> 'entries'
  ) h
  where (h ->> 'hour')::int = 8
), '0'), false);
reset role;

insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status,
                            total_amount, passenger_count)
values ('MP-' || current_setting('test.dest') || '-E', current_setting('test.uc')::uuid,
        current_setting('test.loc')::uuid,
        (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '8 hours')
          at time zone 'America/Sao_Paulo',
        (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '20 hours')
          at time zone 'America/Sao_Paulo',
        'confirmed', 120, 3);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select is(
  (select (h ->> 'vehicles')::int
     from jsonb_array_elements(
       public.manager_daily_flow((now() at time zone 'America/Sao_Paulo')::date) -> 'entries'
     ) h
    where (h ->> 'hour')::int = 8),
  current_setting('test.flow_before')::int + 1,
  'chegada das 8h local cai na hora 8 do fluxo do dia');
select is(
  (select count(*)::int
     from jsonb_array_elements(
       public.manager_daily_flow((now() at time zone 'America/Sao_Paulo')::date) -> 'entries'
     )),
  24, 'o fluxo devolve as 24 horas do dia, inclusive as sem movimento');
reset role;

select * from finish();
rollback;
