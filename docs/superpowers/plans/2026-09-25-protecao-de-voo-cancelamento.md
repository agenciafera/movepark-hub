# Proteção de voo (atraso ou cancelamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Superflex passa a cobrir também o cancelamento do voo: 24h de saída estendida por conta da Movepark, o que passar disso cobrado pelo estacionamento no balcão, com o Operator registrando a saída real e o valor cobrado, e a unidade avisada por painel e e-mail.

**Architecture:** Alarga o que existe. A RPC `extend_booking_flight_delay` ganha motivo e saída pedida, e separa a saída coberta (até +24h, capacidade segurada, crédito ao parceiro) do excedente (previsão com preço congelado). Uma RPC nova registra a saída real no check-out do Operator e o valor cobrado no balcão. A Edge `extend-booking` escolhe o template pelo excedente e manda o e-mail da unidade. Front: diálogo do cliente com motivo e frase do excedente, aviso e passo de check-out no Operator, três números no card do Manager e um relatório mensal.

**Tech Stack:** Postgres/plpgsql + pgTAP (no banco vivo, via `bash $SP/tap.sh`), Edge Deno, React + TanStack Query + Vitest, templates Meta via Graph API.

Spec: `docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md`.

**Estado em 25/09/2026:** as oito tarefas foram executadas e publicadas (commits `d6c72316` a `ae65408c`). Prova ao vivo na reserva de teste MP-DC8C9E: acionamento por cancelamento, WhatsApp com o template do excedente, selo e aviso no Operator, check-out com saída real e R$ 27,00 cobrados, três números no Manager e relatório mensal. Não conferido: a chegada do e-mail da unidade (a Fera não tem e-mail; foi usado um temporário sem abrir a caixa).

## Global Constraints

- Trabalho direto na `main`; commit e push por tarefa. Migrations com `HHMMSS` único (`ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` vazio).
- Migration aplicada por `supabase db query --linked -f <arquivo>` + `supabase migration repair --status applied <ts>`; depois editar `src/types/database.ts` à mão (o gen devolve schema errado).
- pgTAP roda no banco vivo em transação revertida: `bash $SP/tap.sh <teste> <migration...>` (`SP` = scratchpad da sessão). Nunca `supabase start`.
- Edges: `supabase functions deploy <nome>`; testes `cd supabase/functions && deno test --no-check --allow-env --allow-net --allow-read`.
- Copy sem travessão nem meia-risca; "Movepark" grafado assim; textos passam pela skill `revisar-texto`.
- Benefício continua sendo a flag `flight_delay_protection` (sem flag nova). Limite: `flight_extension_max_hours` = 24, `flight_extension_after_checkout_minutes` = 120, uma vez por reserva.
- Excedente é do parceiro: nada de gateway, split ou comissão. O Hub só registra.
- Guards de CI: toda mutation nova em `api.ts`/`*Api.ts` precisa de teste no mesmo diretório; toda Edge precisa de `*.test.ts`; rota nova entra no inventário de rotas (não há rota nova aqui).

---

### Task 1: Migration e RPCs (extensão com motivo e excedente; saída real pelo Operator)

**Files:**
- Create: `supabase/migrations/20261125120000_protecao_de_voo_cancelamento.sql`
- Create: `supabase/tests/flight_protection.test.sql`
- Modify: `src/types/database.ts` (tabela `booking_fare_extension`, RPCs)

**Interfaces:**
- Produces: `extend_booking_flight_delay(p_booking_id uuid, p_new_check_out_at timestamptz, p_actor text, p_reason text, p_flight_number text, p_kind text default 'delay')` → jsonb `{booking_id, old_check_out_at, new_check_out_at (coberta), requested_check_out_at, added_days, partner_credit_cents, overage_daily_cents, overage_cents}`. `p_new_check_out_at` passa a ser a saída PEDIDA (sem teto); a RPC calcula a coberta.
- Produces: `operator_record_flight_checkout(p_booking_id uuid, p_actual_check_out_at timestamptz, p_overage_charged_cents int, p_note text)` → jsonb `{overage_cents, overage_charged_cents, actual_check_out_at}`; exige `member_has_scope(company, 'bookings:checkin')` ou hub_admin; conclui a reserva (`status = completed`, `checked_out_at = p_actual_check_out_at`).
- Produces: view `flight_protection_monthly (month date, company_id, claims int, delay int, cancellation int, partner_credit_cents bigint, overage_cents bigint, overage_charged_cents bigint)`, lida por hub_admin.

- [x] **Step 1: Escrever o teste pgTAP que falha**

Copie o fixture de `supabase/tests/flight_extension.test.sql` (linhas 7 a 36: usuário, unidade da Agência Fera listada na transação, reserva Superflex com saída daqui a 1 hora) e acrescente um Operator da empresa:

```sql
-- pgTAP: proteção de voo com cancelamento e excedente no balcão (25/09/2026).
-- Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md. Transação com rollback.
begin;
select plan(14);

do $$
declare cust uuid := gen_random_uuid(); oper uuid := gen_random_uuid(); v_lpt uuid; r jsonb; v_cid uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pv-cust@ex.com',now(),now()),
    (oper,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pv-oper@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer'), (oper,'company_operator') on conflict (id) do nothing;
  select lpt.id into v_lpt
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  select c.id into v_cid from public.location_parking_type lpt join public.location l on l.id = lpt.location_id join public.company c on c.id = l.company_id where lpt.id = v_lpt;
  insert into public.profile_company(profile_id, company_id, role) values (oper, v_cid, 'operator');
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '5 days', now() + interval '7 days', null, false, null, null, null, null, 'superflex');
  update public.booking set status = 'checked_in', check_in_at = now() - interval '47 hours', check_out_at = now() + interval '1 hour'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.cid', v_cid::text, false);
  perform set_config('test.oper', oper::text, false);
end $$;

-- ── cancelamento com saída pedida além das 24h ───────────────────────────────
select lives_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '49 hours', 'customer', 'voo cancelado', 'LA3456', 'cancellation')$f$, current_setting('test.bk')),
  'saída pedida a 49h não é recusada: a RPC cobre 24h e o resto vira excedente');
select is((select kind from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 'cancellation', 'o motivo fica na extensão');
select ok((select new_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid) between now() + interval '24 hours 59 minutes' and now() + interval '25 hours 1 minute',
  'a saída coberta é a prevista mais 24h');
select ok((select requested_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid) between now() + interval '48 hours 59 minutes' and now() + interval '49 hours 1 minute',
  'a saída pedida fica gravada inteira');
select is((select check_out_at from public.booking where id = current_setting('test.bk')::uuid), (select new_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid),
  'a reserva estende só até a coberta');
-- Agência Fera: diária a 27,00 no motor (3 diárias = 81); o snapshot é a diária cheia, sem comissão
select is((select overage_daily_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 2700, 'o preço da diária excedente fica congelado');
select is((select overage_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 2700, 'excedente previsto: 1 dia além da coberta (49h - 25h = 24h, arredonda para cima)');
select is((select partner_credit_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 2160, 'o crédito das 24h continua o de sempre');

-- ── saída real pelo Operator ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.oper'), 'role', 'authenticated')::text, true);
select lives_ok(format($f$select public.operator_record_flight_checkout(%L::uuid, now() + interval '30 hours', 2700, null)$f$, current_setting('test.bk')),
  'o operador registra a saída real e o valor cobrado');
select is((select status::text || '|' || (checked_out_at is not null)::text from public.booking where id = current_setting('test.bk')::uuid), 'completed|true', 'a reserva é concluída com a hora real');
select is((select overage_cents || '|' || overage_charged_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), '2700|2700',
  'saída real 5h depois da coberta: 1 dia de excedente, cobrado');
select throws_ok(format($f$select public.operator_record_flight_checkout(%L::uuid, now(), 0, null)$f$, current_setting('test.bk')), 'P0001', null, 'não registra duas vezes');
reset role;

-- ── sem excedente: saída real dentro da coberta ──────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.booking set status = 'checked_in', checked_out_at = null where id = current_setting('test.bk')::uuid;
update public.booking_fare_extension set actual_check_out_at = null, overage_charged_cents = null, overage_recorded_at = null where booking_id = current_setting('test.bk')::uuid;
select lives_ok(format($f$select public.operator_record_flight_checkout(%L::uuid, now() + interval '10 hours', 0, null)$f$, current_setting('test.bk')), 'service_role também registra');
select is((select overage_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 0, 'dentro da coberta o excedente é zero');

select * from finish();
rollback;
```

- [x] **Step 2: Rodar para ver falhar**

Run: `bash $SP/tap.sh supabase/tests/flight_protection.test.sql`
Expected: erros de `column "kind" does not exist` / função com 6 argumentos inexistente.

- [x] **Step 3: Escrever a migration**

```sql
-- Proteção de voo: atraso ou cancelamento (25/09/2026).
-- Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md
--
-- A RPC passa a receber a saída PEDIDA (sem teto) e separa: coberta (até +24h, capacidade segurada,
-- crédito ao parceiro) e excedente (previsão, preço da diária congelado, cobrado no balcão pelo
-- parceiro). O Operator registra a saída real no check-out e o que cobrou.

alter table public.booking_fare_extension
  add column if not exists kind text not null default 'delay' check (kind in ('delay', 'cancellation')),
  add column if not exists requested_check_out_at timestamptz,
  add column if not exists overage_daily_cents integer not null default 0,
  add column if not exists overage_cents integer not null default 0,
  add column if not exists actual_check_out_at timestamptz,
  add column if not exists overage_charged_cents integer,
  add column if not exists overage_note text,
  add column if not exists overage_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists overage_recorded_at timestamptz;

-- Excedente em dias inteiros além da saída coberta (arredonda para cima). Zero quando sai antes.
create or replace function public.flight_overage_days(p_covered timestamptz, p_actual timestamptz)
returns integer language sql immutable as $$
  select greatest(0, ceil(extract(epoch from (p_actual - p_covered)) / 86400))::int;
$$;

drop function if exists public.extend_booking_flight_delay(uuid, timestamptz, text, text, text);
create or replace function public.extend_booking_flight_delay(
  p_booking_id uuid, p_new_check_out_at timestamptz, p_actor text default 'system',
  p_reason text default null, p_flight_number text default null, p_kind text default 'delay')
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_status public.booking_status; v_check_in timestamptz; v_check_out timestamptz;
  v_location_id uuid; v_benefits jsonb; v_pt uuid; v_code text; v_company_id uuid;
  v_lpt_id uuid; v_cap int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_added int := 0;
  v_max_hours int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_max_hours'), 24);
  v_after_min int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_after_checkout_minutes'), 120);
  v_flight text := nullif(upper(trim(coalesce(p_flight_number, ''))), '');
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'delay');
  v_company_slug text; v_location_slug text; v_pt_code text; v_take int;
  v_days int; v_price_before numeric; v_price_after numeric; v_credit int := 0; v_settlement uuid;
  v_covered timestamptz; v_daily int := 0; v_overage int := 0;
begin
  if v_kind not in ('delay', 'cancellation') then
    raise exception 'Motivo inválido: use atraso ou cancelamento.' using errcode = 'P0001';
  end if;
  select status, check_in_at, check_out_at, location_id, fare_benefits, code, coalesce(commission_take_rate_bps, -1)
    into v_status, v_check_in, v_check_out, v_location_id, v_benefits, v_code, v_take
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if not coalesce((v_benefits ->> 'flight_delay_protection')::boolean, false) then
    raise exception 'Proteção de voo disponível só na Tarifa Superflex.' using errcode = 'P0001';
  end if;
  if v_status not in ('confirmed', 'checked_in') then
    raise exception 'Só reservas confirmadas ou em andamento podem ser estendidas.' using errcode = 'P0001';
  end if;
  if v_flight is null then raise exception 'Informe o número do voo para acionar a proteção.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.booking_fare_extension where booking_id = p_booking_id) then
    raise exception 'A proteção de voo já foi usada nesta reserva.' using errcode = 'P0001';
  end if;
  if now() > v_check_out + make_interval(mins => v_after_min) then
    raise exception 'A proteção só pode ser acionada até % minutos depois da saída prevista.', v_after_min using errcode = 'P0001';
  end if;
  if p_new_check_out_at <= v_check_out then
    raise exception 'A nova saída precisa ser depois da saída atual.' using errcode = 'P0001';
  end if;

  -- Coberta: até 24h por conta da Movepark. O resto é excedente (previsão, sem capacidade).
  v_covered := least(p_new_check_out_at, v_check_out + make_interval(hours => v_max_hours));

  select bi.parking_type_id into v_pt from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, c.id, case when v_take >= 0 then v_take else c.take_rate_bps end
    into v_lpt_id, v_cap, v_company_slug, v_location_slug, v_pt_code, v_company_id, v_take
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  for v_date in
    select generate_series((v_check_out - interval '1 microsecond')::date + 1, (v_covered - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001'; end if;
    if v_booked + coalesce(v_external, 0) >= v_cap then raise exception 'Sem disponibilidade para estender até %.', v_date using errcode = 'P0001'; end if;
    update public.location_parking_availability set booked_count = booked_count + 1 where location_parking_type_id = v_lpt_id and date = v_date;
    v_added := v_added + 1;
  end loop;

  v_days := greatest(1, ceil(extract(epoch from (v_check_out - v_check_in)) / 86400)::int);
  begin
    v_price_before := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days) ->> 'price')::numeric;
    v_price_after  := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days + greatest(v_added, 1)) ->> 'price')::numeric;
  exception when others then
    v_price_before := null; v_price_after := null;
  end;
  -- Diária cheia da unidade (o que o balcão cobra), congelada para o excedente.
  if v_price_before is not null and v_price_after is not null and v_price_after > v_price_before then
    v_daily := round((v_price_after - v_price_before) * 100 / greatest(v_added, 1))::int;
  end if;
  if v_added > 0 and v_daily > 0 then
    v_credit := round(v_daily * v_added * (10000 - coalesce(v_take, 0)) / 10000)::int;
    insert into public.payout_debt_settlement (company_id, provider, amount_cents, kind, note)
    values (v_company_id, 'pagarme', v_credit, 'flight_extension_credit',
            format('Proteção de voo (%s) da reserva %s: %s diária(s) pagas pela Movepark', case when v_kind = 'cancellation' then 'cancelamento' else 'atraso' end, v_code, v_added))
    returning id into v_settlement;
  end if;
  v_overage := public.flight_overage_days(v_covered, p_new_check_out_at) * v_daily;

  update public.booking set check_out_at = v_covered, flight_number = coalesce(flight_number, v_flight) where id = p_booking_id;
  insert into public.booking_fare_extension (booking_id, old_check_out_at, new_check_out_at, added_days, actor, reason, flight_number,
    partner_credit_cents, settlement_id, kind, requested_check_out_at, overage_daily_cents, overage_cents)
  values (p_booking_id, v_check_out, v_covered, v_added, coalesce(p_actor, 'system'), p_reason, v_flight,
    v_credit, v_settlement, v_kind, p_new_check_out_at, v_daily, v_overage);
  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object('booking_id', p_booking_id, 'old_check_out_at', v_check_out, 'new_check_out_at', v_covered,
    'requested_check_out_at', p_new_check_out_at, 'added_days', v_added, 'partner_credit_cents', v_credit,
    'overage_daily_cents', v_daily, 'overage_cents', v_overage, 'kind', v_kind);
end $$;
revoke all on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text, text) to service_role;

-- Saída real registrada pelo Operator no check-out (escopo bookings:checkin), hub_admin ou service_role.
create or replace function public.operator_record_flight_checkout(
  p_booking_id uuid, p_actual_check_out_at timestamptz, p_overage_charged_cents integer default 0, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_company uuid; v_ext public.booking_fare_extension%rowtype; v_overage int; v_status public.booking_status;
begin
  select l.company_id, b.status into v_company, v_status from public.booking b join public.location l on l.id = b.location_id where b.id = p_booking_id and b.deleted_at is null;
  if v_company is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_hub_admin() or public.member_has_scope(v_company, 'bookings:checkin')) then
    raise exception 'Sem permissão para registrar o check-out.' using errcode = '42501';
  end if;
  select * into v_ext from public.booking_fare_extension where booking_id = p_booking_id order by created_at desc limit 1;
  if v_ext.id is null then raise exception 'Esta reserva não tem proteção de voo acionada.' using errcode = 'P0001'; end if;
  if v_ext.overage_recorded_at is not null then raise exception 'A saída real desta reserva já foi registrada.' using errcode = 'P0001'; end if;
  if v_status not in ('checked_in', 'confirmed') then raise exception 'Só reservas em uso podem ter a saída registrada.' using errcode = 'P0001'; end if;
  if p_actual_check_out_at > now() + interval '10 minutes' then raise exception 'A saída real não pode estar no futuro.' using errcode = 'P0001'; end if;
  v_overage := public.flight_overage_days(v_ext.new_check_out_at, p_actual_check_out_at) * v_ext.overage_daily_cents;
  update public.booking_fare_extension
     set actual_check_out_at = p_actual_check_out_at, overage_cents = v_overage,
         overage_charged_cents = greatest(0, coalesce(p_overage_charged_cents, 0)), overage_note = nullif(trim(coalesce(p_note, '')), ''),
         overage_recorded_by = auth.uid(), overage_recorded_at = now()
   where id = v_ext.id;
  update public.booking set status = 'completed', checked_out_at = p_actual_check_out_at where id = p_booking_id;
  return jsonb_build_object('overage_cents', v_overage, 'overage_charged_cents', greatest(0, coalesce(p_overage_charged_cents, 0)), 'actual_check_out_at', p_actual_check_out_at);
end $$;
revoke all on function public.operator_record_flight_checkout(uuid, timestamptz, integer, text) from public, anon;
grant execute on function public.operator_record_flight_checkout(uuid, timestamptz, integer, text) to authenticated, service_role;

-- Relatório mensal (hub_admin): custo da Movepark e o que o parceiro cobrou por fora.
create or replace view public.flight_protection_monthly with (security_invoker = true) as
  select date_trunc('month', e.created_at)::date as month, l.company_id,
         count(*)::int as claims,
         count(*) filter (where e.kind = 'delay')::int as delay,
         count(*) filter (where e.kind = 'cancellation')::int as cancellation,
         coalesce(sum(e.partner_credit_cents), 0)::bigint as partner_credit_cents,
         coalesce(sum(e.overage_cents), 0)::bigint as overage_cents,
         coalesce(sum(e.overage_charged_cents), 0)::bigint as overage_charged_cents
    from public.booking_fare_extension e
    join public.booking b on b.id = e.booking_id
    join public.location l on l.id = b.location_id
   group by 1, 2;
grant select on public.flight_protection_monthly to authenticated;
```

Nota: `booking_fare_extension` já tem RLS? Confira com `select relrowsecurity from pg_class where relname='booking_fare_extension'`. Se não tiver policy de leitura para o dono e para a empresa, acrescente: dono (`booking.profile_id = auth.uid()`), operador (`member_has_scope(company, 'bookings:read')`), hub_admin tudo. O cliente e o Operator leem a extensão pelo PostgREST na Task 4 e 5.

- [x] **Step 4: Rodar o teste até passar**

Run: `bash $SP/tap.sh supabase/tests/flight_protection.test.sql supabase/migrations/20261125120000_protecao_de_voo_cancelamento.sql`
Expected: `ok 1` a `ok 14`. Se o valor da diária da Fera (2700) divergir, meça com `select public.simulate_price('agencia-fera', <slug>, <code>, 2)` e `..., 3)` e ajuste os números do teste, nunca a regra.

Rode também o teste antigo, que usa a assinatura de 5 argumentos: `bash $SP/tap.sh supabase/tests/flight_extension.test.sql supabase/migrations/20261125120000_protecao_de_voo_cancelamento.sql`. Ajuste as mensagens esperadas ("Proteção de voo disponível só na Tarifa Superflex.", "A proteção de voo já foi usada nesta reserva.") e o caso "mais de 24h é alteração de data", que deixa de ser recusa: vira `lives_ok` com `new_check_out_at` = prevista + 24h.

- [x] **Step 5: Aplicar, tipar e commitar**

```bash
supabase db query --linked -f supabase/migrations/20261125120000_protecao_de_voo_cancelamento.sql
supabase migration repair --status applied 20261125120000
```
Em `src/types/database.ts`: na tabela `booking_fare_extension` (Row/Insert/Update) acrescente `kind: string`, `requested_check_out_at: string | null`, `overage_daily_cents: number`, `overage_cents: number`, `actual_check_out_at: string | null`, `overage_charged_cents: number | null`, `overage_note: string | null`, `overage_recorded_by: string | null`, `overage_recorded_at: string | null`; em Functions: `extend_booking_flight_delay` ganha `p_kind?: string`; `operator_record_flight_checkout: { Args: { p_booking_id: string; p_actual_check_out_at: string; p_overage_charged_cents?: number; p_note?: string }; Returns: Json }`; `flight_overage_days: { Args: { p_covered: string; p_actual: string }; Returns: number }`; em Views: `flight_protection_monthly` com as 8 colunas.

```bash
bun run typecheck
git add supabase/migrations/20261125120000_protecao_de_voo_cancelamento.sql supabase/tests/flight_protection.test.sql supabase/tests/flight_extension.test.sql src/types/database.ts
git commit -m "feat(voo): protecao de voo cobre cancelamento: 24h cobertas, excedente congelado e saida real pelo Operator"
git push origin main
```

---

### Task 2: Edge `extend-booking` com motivo, excedente, template e e-mail da unidade

**Files:**
- Modify: `supabase/functions/extend-booking/logic.ts`, `logic.test.ts`, `index.ts`
- Modify: `supabase/functions/_shared/email.ts` (+ `email.test.ts`)
- Modify: `supabase/functions/_shared/notify.ts` (`WHATSAPP_TEMPLATE_ENV`)

**Interfaces:**
- Consumes: RPC da Task 1 (`p_kind`, retorno com `overage_*`).
- Produces: `parseExtendInput` devolve também `kind: "delay" | "cancellation"`; `pickExtendedEvent(overageCents) → "extended" | "extended_overage"`; `overageSentence(coveredIso, dailyCents) → string`; `tplBookingExtended(b, name, url, overage?: { coveredAt: string; dailyCents: number })`; `tplFlightProtectionUnit(args)`; evento `extended_overage` em `NotifyEvent` mapeado para `WHATSAPP_BOOKING_EXTENDED_OVERAGE_TEMPLATE`.

- [x] **Step 1: Testes que falham (`logic.test.ts`)**

```ts
Deno.test("parseExtendInput: motivo cancelamento entra, motivo inventado cai em delay", () => {
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456", kind: "cancellation" }).input?.kind, "cancellation");
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456", kind: "greve" }).input?.kind, "delay");
});
Deno.test("pickExtendedEvent: com excedente o aviso muda de template", () => {
  assertEquals(pickExtendedEvent(0), "extended");
  assertEquals(pickExtendedEvent(2700), "extended_overage");
});
Deno.test("overageSentence: diz até quando é por nossa conta e o preço por dia no balcão", () => {
  const s = overageSentence("2026-12-14T08:00:00Z", 2700);
  assertEquals(s.includes("R$ 27,00 por dia") && s.includes("pago no estacionamento"), true);
});
```

- [x] **Step 2: Rodar e ver falhar** (`deno test --no-check --allow-env --allow-net --allow-read extend-booking/logic.test.ts`).

- [x] **Step 3: Implementar em `logic.ts`**

```ts
export type ExtendKind = "delay" | "cancellation";
export interface ExtendInput { bookingCode: string; newCheckOutAt: string; reason: string | null; flightNumber: string; kind: ExtendKind; }
// dentro de parseExtendInput, antes do return:
const kind: ExtendKind = b.kind === "cancellation" ? "cancellation" : "delay";
// e inclua `kind` no objeto devolvido.

export function pickExtendedEvent(overageCents: number): "extended" | "extended_overage" {
  return overageCents > 0 ? "extended_overage" : "extended";
}
export function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
export function fmtBRDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function overageSentence(coveredIso: string, dailyCents: number): string {
  return `Até ${fmtBRDateTime(coveredIso)} é por nossa conta. Depois disso, ${fmtBRL(dailyCents)} por dia, pago no estacionamento na retirada.`;
}
```

- [x] **Step 4: `index.ts`**: passar `p_kind: input.kind` à RPC; ler `result.overage_cents`, `result.overage_daily_cents`, `result.new_check_out_at`; chamar `notifyBooking` com `event: pickExtendedEvent(overage)`, `whatsappParams` = `[nome, código, saídaCoberta]` sem excedente e `[nome, código, saídaCoberta, fmtBRL(daily)]` com; `email: (c) => tplBookingExtended(nd, c.name, url, overage > 0 ? { coveredAt: result.new_check_out_at, dailyCents: daily } : undefined)`. Depois, e-mail da unidade: buscar `location.email, name` da reserva; se houver e-mail e `getEmailConfig(admin).from`, `sendEmail({ from, to: location.email, subject, html })` com `tplFlightProtectionUnit({ bookingCode, kind, flightNumber, coveredAt, dailyCents, overageCents, operatorUrl: `${siteUrl()}/operator/bookings/${code}` })`. Best-effort, com `console.error` em falha.

- [x] **Step 5: `_shared/email.ts`**: `tplBookingExtended` ganha o quarto parâmetro opcional e, quando presente, troca o `checkItem("Nada a pagar…")` por `checkItem(overageSentence)` e o título por "Saída estendida: 24h por nossa conta". Nova `tplFlightProtectionUnit` (assunto `Proteção de voo acionada na reserva ${code}`; tabela com motivo, voo, sai sem custo até, preço por dia no balcão, excedente previsto; botão "Abrir no Operator"). Em `email.test.ts`, dois testes: o bloco do excedente aparece só quando pedido; o e-mail da unidade traz voo, hora coberta e preço.

- [x] **Step 6: `_shared/notify.ts`**: `NotifyEvent` ganha `"extended_overage"`; `WHATSAPP_TEMPLATE_ENV.extended_overage = "WHATSAPP_BOOKING_EXTENDED_OVERAGE_TEMPLATE"`.

- [x] **Step 7: Rodar todos os testes Deno, deploy e commit**

```bash
cd supabase/functions && deno test --no-check --allow-env --allow-net --allow-read && cd ../..
supabase functions deploy extend-booking
git add supabase/functions && git commit -m "feat(voo): extend-booking com motivo, template do excedente e e-mail da unidade" && git push origin main
```

---

### Task 3: Template `movepark_saida_estendida_excedente` na Meta e segredo

**Files:**
- Nenhum no repo. Usa a Edge temporária guardada em `$SP/whatsapp-templates-admin/index.ts` (fora do git; se o scratchpad sumiu, recrie do histórico do commit `1f4795b6`, seção "Como vou criar").

- [x] **Step 1:** Acrescente em `TEMPLATES` o corpo, categoria UTILITY, pt_BR, 4 parâmetros:
  `Oi, {{1}}. A saída da reserva {{2}} foi estendida até {{3}} por nossa conta. Depois disso, o estacionamento cobra {{4}} por dia na retirada. O estacionamento já sabe.` com exemplo `["Ana", "MP-1A2B3C", "28/09 às 23:40", "R$ 27,00"]`.
- [x] **Step 2:** `supabase secrets set TEMPLATE_ADMIN_KEY=<hex de openssl rand -hex 24>`; copie a pasta para `supabase/functions/whatsapp-templates-admin`, `supabase functions deploy whatsapp-templates-admin --no-verify-jwt`, chame `{"action":"create","waba":"449333654922434","names":["movepark_saida_estendida_excedente"]}`; apague a pasta do repo (o guard de cobertura de Edges reprova pasta sem teste).
- [x] **Step 3:** Faça `list` a cada minuto até `APPROVED` (levou até 25 min nos anteriores).
- [x] **Step 4:** `supabase secrets set WHATSAPP_BOOKING_EXTENDED_OVERAGE_TEMPLATE=movepark_saida_estendida_excedente`; `supabase functions delete whatsapp-templates-admin --yes`; `supabase secrets unset TEMPLATE_ADMIN_KEY`.
- [x] **Step 5:** Registre em `docs/specs/tarifas-operacao.md` §3a a linha do template novo.

---

### Task 4: Cliente: diálogo com motivo e frase do excedente

**Files:**
- Create: `src/features/bookings/flightProtection.logic.ts`, `flightProtection.logic.test.ts`
- Rename: `src/features/bookings/FlightDelayDialog.tsx` → `FlightProtectionDialog.tsx` (atualize os imports em `src/routes/bookings-detail.tsx` e `src/features/bookings/BookingDetailView.tsx`)
- Modify: `src/features/bookings/customerApi.ts` (`useExtendBookingFlightDelay` aceita `kind`; `MyBookingDetail.fare_extensions` traz `kind, new_check_out_at, requested_check_out_at, overage_daily_cents, overage_cents, actual_check_out_at, overage_charged_cents`), `customerApi.test.tsx`
- Modify: `src/routes/bookings-detail.tsx` (botão "Meu voo atrasou ou foi cancelado"; estado da proteção)

**Interfaces:**
- Produces: `coveredCheckOut(currentIso, requestedIso, maxHours = 24) → string` (ISO); `overageDays(coveredIso, laterIso) → number` (ceil, mínimo 0); `overageForecastCents(coveredIso, requestedIso, dailyCents) → number`; `protectionSummary(ext, fmt) → string` (frase de estado para a reserva).

- [x] **Step 1: Testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { coveredCheckOut, overageDays, overageForecastCents, protectionSummary } from "./flightProtection.logic";

describe("coveredCheckOut", () => {
  it("cobre até 24h; pedido menor fica como pedido", () => {
    expect(coveredCheckOut("2026-12-13T08:00:00Z", "2026-12-15T09:00:00Z")).toBe("2026-12-14T08:00:00.000Z");
    expect(coveredCheckOut("2026-12-13T08:00:00Z", "2026-12-13T20:00:00Z")).toBe("2026-12-13T20:00:00.000Z");
  });
});
describe("overageDays e overageForecastCents", () => {
  it("arredonda dias para cima e nunca é negativo", () => {
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-15T09:00:00Z")).toBe(2);
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-14T08:00:00Z")).toBe(0);
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-13T08:00:00Z")).toBe(0);
    expect(overageForecastCents("2026-12-14T08:00:00Z", "2026-12-15T09:00:00Z", 2700)).toBe(5400);
  });
});
describe("protectionSummary", () => {
  const fmt = (iso: string) => `[${iso}]`;
  it("diz o motivo, até quando é por nossa conta e o excedente", () => {
    const s = protectionSummary({ kind: "cancellation", new_check_out_at: "c", requested_check_out_at: "r", overage_daily_cents: 2700, overage_cents: 2700, actual_check_out_at: null, overage_charged_cents: null }, fmt);
    expect(s).toBe("Voo cancelado: saída até [c] por nossa conta. Você pediu até [r]: depois de [c], R$ 27,00 por dia, pago no estacionamento.");
  });
  it("sem excedente e já encerrado", () => {
    expect(protectionSummary({ kind: "delay", new_check_out_at: "c", requested_check_out_at: "c", overage_daily_cents: 0, overage_cents: 0, actual_check_out_at: "a", overage_charged_cents: 0 }, fmt))
      .toBe("Voo atrasado: saída até [c] por nossa conta. Retirado em [a].");
  });
});
```

- [x] **Step 2: Rodar e ver falhar** (`bunx vitest run src/features/bookings/flightProtection.logic.test.ts`).

- [x] **Step 3: Implementar `flightProtection.logic.ts`**

```ts
import { formatBRL } from "@/lib/format";
import { FLIGHT_EXTENSION_MAX_HOURS } from "./booking-modifications.logic";

export type FlightKind = "delay" | "cancellation";
export const FLIGHT_KIND_LABEL: Record<FlightKind, string> = { delay: "Voo atrasado", cancellation: "Voo cancelado" };

export type ExtensionLike = {
  kind: string; new_check_out_at: string; requested_check_out_at: string | null;
  overage_daily_cents: number; overage_cents: number; actual_check_out_at: string | null; overage_charged_cents: number | null;
};

export function coveredCheckOut(currentIso: string, requestedIso: string, maxHours = FLIGHT_EXTENSION_MAX_HOURS): string {
  const cap = new Date(currentIso).getTime() + maxHours * 3_600_000;
  return new Date(Math.min(cap, new Date(requestedIso).getTime())).toISOString();
}
export function overageDays(coveredIso: string, laterIso: string): number {
  const ms = new Date(laterIso).getTime() - new Date(coveredIso).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
export function overageForecastCents(coveredIso: string, requestedIso: string, dailyCents: number): number {
  return overageDays(coveredIso, requestedIso) * dailyCents;
}
export function protectionSummary(e: ExtensionLike, fmt: (iso: string) => string): string {
  const motivo = FLIGHT_KIND_LABEL[(e.kind as FlightKind) in FLIGHT_KIND_LABEL ? (e.kind as FlightKind) : "delay"];
  let s = `${motivo}: saída até ${fmt(e.new_check_out_at)} por nossa conta.`;
  if (e.actual_check_out_at) return `${s} Retirado em ${fmt(e.actual_check_out_at)}.`;
  if (e.overage_cents > 0 && e.requested_check_out_at) {
    s += ` Você pediu até ${fmt(e.requested_check_out_at)}: depois de ${fmt(e.new_check_out_at)}, ${formatBRL(e.overage_daily_cents / 100)} por dia, pago no estacionamento.`;
  }
  return s;
}
```
Confira a assinatura de `formatBRL` em `src/lib/format.ts` (recebe reais). Se `formatBRL(27)` devolver "R$ 27,00" com espaço não separável, ajuste a expectativa do teste para o mesmo caractere.

- [x] **Step 4: Diálogo** `FlightProtectionDialog.tsx`: título "Meu voo atrasou ou foi cancelado"; `Select` de motivo (`delay` padrão, `cancellation`); `datetime-local` "Nova saída prevista" sem `max`; número do voo obrigatório; abaixo do campo, a frase viva: `Até ${formatDateTime(coveredCheckOut(currentCheckOut, novaSaida))} é por nossa conta.` e, se `overageDays > 0`, `Depois disso, o estacionamento cobra a diária dele na retirada.` (o preço exato vem na confirmação, porque o snapshot é do servidor). No `save`, mande `kind` e mostre o toast com `r.new_check_out_at` e, se `r.overage_cents > 0`, `formatBRL(r.overage_daily_cents / 100)` por dia. Hook: `useExtendBookingFlightDelay` recebe `kind` e manda `kind` no body; o retorno tipa `overage_cents`, `overage_daily_cents`, `requested_check_out_at`. Acrescente em `customerApi.test.tsx` um caso: o body leva `kind: "cancellation"`.

- [x] **Step 5: Reserva** (`bookings-detail.tsx`): rótulo do botão "Meu voo atrasou ou foi cancelado"; quando `booking.fare_extensions[0]` existir, mostre `protectionSummary(ext, formatDateTime)` num parágrafo dentro do card da tarifa. `MyBookingDetail.fare_extensions` passa a selecionar os campos listados acima.

- [x] **Step 6: Testes, revisar copy (`revisar-texto`), commit**

```bash
bunx vitest run src/features/bookings src/routes/bookings-detail.test.tsx src/features/mutations.contract.test.ts && bun run typecheck && bun run lint
git add -A && git commit -m "feat(voo): cliente aciona por atraso ou cancelamento e ve ate quando e por nossa conta" && git push origin main
```

---

### Task 5: Operator: aviso na lista e na reserva, check-out com saída real

**Files:**
- Create: `src/features/bookings/FlightCheckoutDialog.tsx`, `flightCheckout.logic.ts`, `flightCheckout.logic.test.ts`
- Modify: `src/features/bookings/api.ts` (`baseSelect` + `useRecordFlightCheckout`), `src/features/bookings/api.test.tsx` (ou o arquivo de contrato que já cobre `useUpdateBookingStatus`)
- Modify: `src/features/bookings/BookingDetailView.tsx`, `src/routes/operator/bookings.tsx`
- Modify: `src/types/domain.ts` (`BookingWithRelations` ganha `fare_extensions`)

**Interfaces:**
- Consumes: RPC `operator_record_flight_checkout` (Task 1); `overageDays` (Task 4).
- Produces: `useRecordFlightCheckout()` mutation `{ bookingId, actualCheckOutAt, chargedCents, note }`; `flightNotice(ext, fmt) → string` (texto do aviso ao Operator); `checkoutPlan(ext, actualIso) → { days, forecastCents }`.

- [x] **Step 1: Testes que falham (`flightCheckout.logic.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { checkoutPlan, flightNotice } from "./flightCheckout.logic";
const ext = { kind: "cancellation", flight_number: "LA3456", new_check_out_at: "2026-12-14T08:00:00Z", requested_check_out_at: "2026-12-15T09:00:00Z", overage_daily_cents: 2700, overage_cents: 5400, actual_check_out_at: null, overage_charged_cents: null };
const fmt = (iso: string) => `[${iso}]`;
describe("flightNotice", () => {
  it("diz motivo, voo, até quando sem custo e o preço por dia", () => {
    expect(flightNotice(ext, fmt)).toBe("Proteção de voo acionada (cancelamento, voo LA3456): sai até [2026-12-14T08:00:00Z] sem custo. Depois disso, R$ 27,00 por dia, a cobrar no balcão.");
  });
});
describe("checkoutPlan", () => {
  it("calcula dias e valor além da coberta", () => {
    expect(checkoutPlan(ext, "2026-12-15T09:00:00Z")).toEqual({ days: 2, forecastCents: 5400 });
    expect(checkoutPlan(ext, "2026-12-14T07:00:00Z")).toEqual({ days: 0, forecastCents: 0 });
  });
});
```

- [x] **Step 2: Rodar e ver falhar.**

- [x] **Step 3: Implementar `flightCheckout.logic.ts`**

```ts
import { formatBRL } from "@/lib/format";
import { overageDays, type ExtensionLike } from "./flightProtection.logic";
export type OperatorExtension = ExtensionLike & { flight_number: string | null };
export function flightNotice(e: OperatorExtension, fmt: (iso: string) => string): string {
  const motivo = e.kind === "cancellation" ? "cancelamento" : "atraso";
  const voo = e.flight_number ? `, voo ${e.flight_number}` : "";
  return `Proteção de voo acionada (${motivo}${voo}): sai até ${fmt(e.new_check_out_at)} sem custo. Depois disso, ${formatBRL(e.overage_daily_cents / 100)} por dia, a cobrar no balcão.`;
}
export function checkoutPlan(e: ExtensionLike, actualIso: string): { days: number; forecastCents: number } {
  const days = overageDays(e.new_check_out_at, actualIso);
  return { days, forecastCents: days * e.overage_daily_cents };
}
```

- [x] **Step 4: Hook e select** em `api.ts`: `baseSelect` ganha `, fare_extensions:booking_fare_extension(id, kind, flight_number, new_check_out_at, requested_check_out_at, overage_daily_cents, overage_cents, actual_check_out_at, overage_charged_cents, overage_note)`; `useRecordFlightCheckout` chama `supabase.rpc("operator_record_flight_checkout", { p_booking_id, p_actual_check_out_at, p_overage_charged_cents, p_note })`, `if (error) throw error`, invalida `bookingsKeys.all`. Teste de contrato: a RPC recebe os quatro campos. `BookingWithRelations` em `domain.ts` ganha `fare_extensions?: OperatorExtension[]`.

- [x] **Step 5: Diálogo** `FlightCheckoutDialog.tsx` (props `bookingId, extension, open, onOpenChange`): `datetime-local` "Hora real de retirada" (padrão agora); abaixo, `checkoutPlan` vivo: "0 dias além da saída coberta: nada a cobrar" ou "N dia(s) além: previsto R$ X"; campo "Cobrado no balcão (R$)" pré-preenchido com o previsto; checkbox "Não cobrado" que zera o campo e exige um motivo curto (`Input`); botão "Registrar check-out" → `useRecordFlightCheckout`; toast "Check-out registrado".

- [x] **Step 6: `BookingDetailView.tsx`**: `const ext = booking.fare_extensions?.[0]`; se `ext` e `audience === "operator"`, o botão "Check-out" abre o `FlightCheckoutDialog` em vez de `transition("completed")`; acima do card "Operação", um aviso (`div` com `bg-badge-pending-bg`) com `flightNotice(ext, formatDateTime)` enquanto `!ext.actual_check_out_at`. No card "Proteção contra atraso de voo" (Manager e Operator), renomeie para "Proteção de voo" e mostre três linhas quando `ext`: crédito ao parceiro (`ext.partner_credit_cents`, buscar no select), excedente previsto (`ext.overage_cents`), excedente cobrado (`ext.overage_charged_cents ?? "ainda não registrado"`).

- [x] **Step 7: Lista do Operator** (`src/routes/operator/bookings.tsx`): na coluna de status, quando `b.fare_extensions?.[0] && !b.fare_extensions[0].actual_check_out_at`, um `Badge tone="pending"` "Proteção de voo".

- [x] **Step 8: Testes, copy, commit**

```bash
bunx vitest run src/features/bookings src/routes/operator src/features/mutations.contract.test.ts && bun run typecheck && bun run lint
git add -A && git commit -m "feat(voo): Operator ve o acionamento e registra a saida real e o cobrado no balcao" && git push origin main
```

---

### Task 6: Relatório mensal no Manager

**Files:**
- Create: `src/features/fares/flightReport.logic.ts`, `flightReport.logic.test.ts`
- Modify: `src/features/fares/api.ts` (`useFlightProtectionMonthly`), `src/routes/manager/tarifas.tsx`

**Interfaces:**
- Consumes: view `flight_protection_monthly` (Task 1).
- Produces: `summarizeFlightMonths(rows) → { month, claims, delay, cancellation, creditCents, overageCents, chargedCents }[]` somando empresas por mês, ordenado do mais novo.

- [x] **Step 1: Teste que falha**: duas empresas no mesmo mês somam; meses ordenados desc.
- [x] **Step 2: Implementar** `summarizeFlightMonths` (reduce por `month`).
- [x] **Step 3: Hook** `useFlightProtectionMonthly()`: `supabase.from("flight_protection_monthly").select("*")`, `if (error) throw error`.
- [x] **Step 4: Tela**: card "Proteção de voo por mês" em `tarifas.tsx` com tabela (mês, acionamentos, atraso, cancelamento, crédito pago ao parceiro, excedente previsto, excedente cobrado no balcão) e `EmptyState` quando vazio.
- [x] **Step 5:** `bunx vitest run src/features/fares src/routes/manager && bun run typecheck`; commit `feat(voo): relatorio mensal da protecao de voo no Manager`; push.

---

### Task 7: Copy, spec e catálogo

**Files:**
- Modify: `src/lib/fares.ts` (rótulo `flight_delay_protection` → "Proteção de voo: atraso ou cancelamento"), `src/features/listing/fareMatrix.logic.ts` e testes (`farePresentation` tooltip), `src/features/content/pages.ts` (FAQ de /cancelamento: pergunta "Meu voo atrasou ou foi cancelado, e agora?" com a regra das 24h por nossa conta e o excedente no balcão)
- Modify: `docs/specs/tarifas-operacao.md` (§2.7 vira "Proteção de voo: atraso ou cancelamento", tabela de benefícios, Q-031 a Q-034 na tabela de questionamentos: cobertura, só Superflex, 24h + excedente no balcão, aviso painel + e-mail), `docs/specs/fares.md`, `docs/specs/README.md` (índice da migration), `docs/specs/operator-panel.md` (check-out com saída real)
- Modify: `src/features/listing/*.test.tsx` que fixam "Proteção contra atraso de voo"

- [x] **Step 1:** Trocar o rótulo e rodar `bunx vitest run src/features/listing src/routes` para ver o que quebra; ajustar as expectativas para o rótulo novo.
- [x] **Step 2:** Passar toda copy nova pela skill `revisar-texto`.
- [x] **Step 3:** Atualizar os docs listados. Sem travessão.
- [x] **Step 3b:** Aviso "sem e-mail de contato" na ficha da unidade do Manager (`src/routes/manager/location-edit.tsx` ou o formulário da unidade em `src/features/locations/`): quando `location.email` estiver vazio, um parágrafo em `text-warning` dizendo que a unidade só recebe avisos operacionais (proteção de voo) pelo painel do Operator. Teste de componente: renderiza com e sem e-mail.
- [x] **Step 4:** `bun run test && bun run typecheck && bun run lint`; commit `docs(voo): protecao de voo cobre cancelamento; copy e questionamentos Q-031 a Q-034`; push.

---

### Task 8: Prova ao vivo

- [x] **Step 1:** Criar reserva Superflex de teste para `peu+teste1@fera.ag` na Agência Fera (SQL, `create_booking_atomic(..., 'superflex')`), ajustar `status = 'checked_in'` e `check_out_at = now() + 1h`.
- [x] **Step 2:** Entrar como o cliente no Chrome de automação (magic link por `generate_link` + `verify` com `token_hash`), abrir a reserva, acionar "Meu voo atrasou ou foi cancelado" com cancelamento, voo LA3456 e saída a +49h. Conferir: `booking_fare_extension` (kind, coberta, pedida, snapshot), WhatsApp com o template do excedente, e-mail da unidade (a Fera tem e-mail? senão medir com uma unidade que tenha).
- [x] **Step 3:** Entrar como `peu+agenciafera@fera.ag`, ver o aviso na lista e na reserva, registrar o check-out com saída real +30h e "cobrado R$ 27,00". Conferir `overage_charged_cents`, `status = completed`, `checked_out_at`.
- [x] **Step 4:** Entrar como hub_admin, ver os três números no card e o relatório mensal.
- [x] **Step 5:** Limpar: cancelar a reserva de teste pelo Manager (ou deixar concluída) e registrar em memória o que foi validado.
