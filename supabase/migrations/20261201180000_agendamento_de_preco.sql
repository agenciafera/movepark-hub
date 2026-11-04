-- Agendamento de tabela de preço (docs/specs/agendamento-de-preco.md).
--
-- O parceiro programa a próxima tabela com data: "a partir de 01/12 vale esta". A vigência é pela
-- data da COMPRA (D1): o motor (`simulate_price`) não muda, quem troca a tabela na hora marcada é o
-- pg_cron `pricing-schedule-apply`, que roda a cada minuto. O site se atualiza sozinho pelos
-- triggers `*_site_rebuild` que pricing_rule/pricing_tier/company_parking_type já têm.
--
-- De quebra, `operator_set_pricing` ganha `p_old_tiers`: a opção "tabela própria" do preço riscado
-- existia no editor sem ter onde preencher as faixas.

-- ─── 1. Escrita única da tabela de preço ───────────────────────────────────────────────────────
-- Era copiada em operator_set_pricing e api_set_pricing; o agendamento seria a terceira cópia.
-- Interna: sem gate, só chamada por funções que já autorizaram.
create or replace function public._pricing_write(
  p_location_parking_type_id uuid,
  p_base_price numeric,
  p_rule jsonb,
  p_tiers jsonb,
  p_old_tiers jsonb default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cpt_id uuid;
  v_rule_id uuid;
  rec jsonb;
begin
  select lpt.company_parking_type_id into v_cpt_id
    from public.location_parking_type lpt
   where lpt.id = p_location_parking_type_id;
  if v_cpt_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;

  if p_base_price is not null then
    update public.company_parking_type set base_price = p_base_price where id = v_cpt_id;
  end if;

  insert into public.pricing_rule (
    location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance,
    old_price_strategy, old_price_multiplier, advance_booking_minutes,
    incremental_one_day_price, incremental_two_days_price, incremental_base, incremental_multiplier,
    monthly_fixed_price, monthly_daily_rate,
    hourly_initial_rate, hourly_one_hour_rate, hourly_fraction_rate, hourly_daily_rate, hourly_hours_per_day,
    surcharge_source_id, surcharge_multiplier
  ) values (
    p_location_parking_type_id,
    coalesce(p_rule->>'strategy', 'uniform_by_duration'),
    coalesce(p_rule->>'fractional_day_policy', 'any_extra'),
    (p_rule->>'fractional_day_tolerance')::numeric,
    coalesce(p_rule->>'old_price_strategy', 'none'),
    (p_rule->>'old_price_multiplier')::numeric,
    (p_rule->>'advance_booking_minutes')::int,
    (p_rule->>'incremental_one_day_price')::numeric,
    (p_rule->>'incremental_two_days_price')::numeric,
    (p_rule->>'incremental_base')::numeric,
    (p_rule->>'incremental_multiplier')::numeric,
    (p_rule->>'monthly_fixed_price')::numeric,
    (p_rule->>'monthly_daily_rate')::numeric,
    (p_rule->>'hourly_initial_rate')::numeric,
    (p_rule->>'hourly_one_hour_rate')::numeric,
    (p_rule->>'hourly_fraction_rate')::numeric,
    (p_rule->>'hourly_daily_rate')::numeric,
    (p_rule->>'hourly_hours_per_day')::int,
    nullif(p_rule->>'surcharge_source_id', '')::uuid,
    (p_rule->>'surcharge_multiplier')::numeric
  )
  on conflict (location_parking_type_id) do update set
    strategy = excluded.strategy,
    fractional_day_policy = excluded.fractional_day_policy,
    fractional_day_tolerance = excluded.fractional_day_tolerance,
    old_price_strategy = excluded.old_price_strategy,
    old_price_multiplier = excluded.old_price_multiplier,
    advance_booking_minutes = excluded.advance_booking_minutes,
    incremental_one_day_price = excluded.incremental_one_day_price,
    incremental_two_days_price = excluded.incremental_two_days_price,
    incremental_base = excluded.incremental_base,
    incremental_multiplier = excluded.incremental_multiplier,
    monthly_fixed_price = excluded.monthly_fixed_price,
    monthly_daily_rate = excluded.monthly_daily_rate,
    hourly_initial_rate = excluded.hourly_initial_rate,
    hourly_one_hour_rate = excluded.hourly_one_hour_rate,
    hourly_fraction_rate = excluded.hourly_fraction_rate,
    hourly_daily_rate = excluded.hourly_daily_rate,
    hourly_hours_per_day = excluded.hourly_hours_per_day,
    surcharge_source_id = excluded.surcharge_source_id,
    surcharge_multiplier = excluded.surcharge_multiplier
  returning id into v_rule_id;

  delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, coalesce((rec->>'from_day')::int, 1), (rec->>'to_day')::int,
      (rec->>'unit_price')::numeric, (rec->>'total_price')::numeric, false);
  end loop;

  -- null preserva o riscado: quem não mexe nele (API, editor antigo) não apaga sem querer.
  if p_old_tiers is not null then
    delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = true;
    for rec in select value from jsonb_array_elements(p_old_tiers) loop
      insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
      values (v_rule_id, coalesce((rec->>'from_day')::int, 1), (rec->>'to_day')::int,
        (rec->>'unit_price')::numeric, (rec->>'total_price')::numeric, true);
    end loop;
  end if;

  return v_rule_id;
end;
$$;

revoke all on function public._pricing_write(uuid, numeric, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._pricing_write(uuid, numeric, jsonb, jsonb, jsonb) to service_role;

-- ─── 2. operator_set_pricing ganha o riscado; api_set_pricing passa a usar a escrita única ─────
drop function if exists public.operator_set_pricing(uuid, numeric, jsonb, jsonb);

create function public.operator_set_pricing(
  p_location_parking_type_id uuid,
  p_base_price numeric,
  p_rule jsonb,
  p_tiers jsonb default '[]'::jsonb,
  p_old_tiers jsonb default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
begin
  select l.company_id into v_company_id
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
   where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar este preço.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite editar preços (pricing:write).' using errcode = '42501';
  end if;

  perform public._pricing_write(p_location_parking_type_id, p_base_price, p_rule, p_tiers, p_old_tiers);
end;
$$;

revoke all on function public.operator_set_pricing(uuid, numeric, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.operator_set_pricing(uuid, numeric, jsonb, jsonb, jsonb) to authenticated, service_role;

create or replace function public.api_set_pricing(
  p_company_id uuid,
  p_location_parking_type_id uuid,
  p_base_price numeric default null,
  p_rule jsonb default '{}'::jsonb,
  p_tiers jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_cpt_id uuid;
  v_rule_id uuid;
begin
  select l.company_id, lpt.company_parking_type_id
    into v_company_id, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if v_company_id <> p_company_id then
    raise exception 'Tipo de vaga não pertence à empresa da chave.' using errcode = '42501';
  end if;

  v_rule_id := public._pricing_write(p_location_parking_type_id, p_base_price, p_rule, p_tiers, null);

  return jsonb_build_object(
    'location_parking_type_id', p_location_parking_type_id,
    'pricing_rule_id', v_rule_id,
    'base_price', (select base_price from public.company_parking_type where id = v_cpt_id),
    'tiers', (select count(*) from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false)
  );
end;
$$;

-- ─── 3. Tabela de agendamentos ──────────────────────────────────────────────────────────────────
create table public.pricing_schedule (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  location_parking_type_id uuid not null references public.location_parking_type(id) on delete cascade,
  effective_date date not null,
  effective_at timestamptz not null,
  base_price numeric(10,2),
  rule jsonb not null,
  tiers jsonb not null default '[]'::jsonb,
  old_tiers jsonb,
  minimum_stay_days integer check (minimum_stay_days is null or minimum_stay_days >= 1),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'applied', 'canceled', 'failed')),
  applied_at timestamptz,
  canceled_at timestamptz,
  error text,
  replaced jsonb,
  created_by uuid references auth.users(id) on delete set null,
  canceled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pricing_schedule is
  'Próximas tabelas de preço com data (vigência pela data da compra). Aplicadas pelo pg_cron '
  'pricing-schedule-apply. Ver docs/specs/agendamento-de-preco.md.';

create unique index pricing_schedule_one_per_day
  on public.pricing_schedule (location_parking_type_id, effective_date)
  where status = 'scheduled';
create index pricing_schedule_due on public.pricing_schedule (effective_at) where status = 'scheduled';
create index pricing_schedule_lpt on public.pricing_schedule (location_parking_type_id, effective_date desc);

create trigger set_updated_at_pricing_schedule
  before update on public.pricing_schedule
  for each row execute function public.set_updated_at();

alter table public.pricing_schedule enable row level security;

create policy pricing_schedule_select on public.pricing_schedule
  for select to authenticated
  using (public.is_hub_admin() or company_id in (select public.current_company_ids()));

revoke all on public.pricing_schedule from anon, authenticated;
grant select on public.pricing_schedule to authenticated;
grant all on public.pricing_schedule to service_role;

-- ─── 4. Criar e cancelar ────────────────────────────────────────────────────────────────────────
create or replace function public.pricing_schedule_create(
  p_location_parking_type_id uuid,
  p_effective_date date,
  p_base_price numeric,
  p_rule jsonb,
  p_tiers jsonb default '[]'::jsonb,
  p_old_tiers jsonb default null,
  p_minimum_stay_days integer default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_tz text;
  v_effective_at timestamptz;
  v_sim jsonb;
  v_id uuid;
begin
  select l.company_id, coalesce(nullif(btrim(l.timezone), ''), 'America/Sao_Paulo')
    into v_company_id, v_tz
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
   where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar este preço.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite editar preços (pricing:write).' using errcode = '42501';
  end if;

  if p_effective_date is null then
    raise exception 'Informe a data em que a tabela passa a valer.' using errcode = '22023';
  end if;
  v_effective_at := (p_effective_date::timestamp) at time zone v_tz;
  if v_effective_at <= now() then
    raise exception 'A data precisa ser a partir de amanhã. Para mudar o preço hoje, salve sem agendar.'
      using errcode = '22023';
  end if;

  -- D6: o espelho do white-label reescreve a tabela a cada passada e desfaria o agendamento.
  if exists (select 1 from public.wl_mirror_target t where t.location_parking_type_id = p_location_parking_type_id) then
    raise exception 'O preço desta vaga vem do sistema antigo (white-label) e é copiado de lá. Programe a mudança no sistema antigo.'
      using errcode = '22023';
  end if;

  if p_rule is null or coalesce(p_rule->>'strategy', '') = '' then
    raise exception 'Informe a estratégia de preço.' using errcode = '22023';
  end if;
  if p_minimum_stay_days is not null and p_minimum_stay_days < 1 then
    raise exception 'A estadia mínima precisa ser de pelo menos 1 diária.' using errcode = '22023';
  end if;

  -- Não agenda tabela que o motor não consegue calcular.
  v_sim := public.simulate_pricing_draft(p_rule, coalesce(p_tiers, '[]'::jsonb), array[1, 2, 3, 7, 15, 30]);
  if jsonb_typeof(v_sim) = 'object' and v_sim ? 'error' then
    raise exception 'Tabela inválida: %', v_sim->>'error' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_sim) e where (e->>'price')::numeric > 0
  ) then
    raise exception 'A tabela não gera preço para nenhuma duração. Confira as faixas.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.pricing_schedule s
     where s.location_parking_type_id = p_location_parking_type_id
       and s.effective_date = p_effective_date
       and s.status = 'scheduled'
  ) then
    raise exception 'Já existe uma tabela programada para este dia. Cancele a anterior antes.'
      using errcode = '23505';
  end if;

  insert into public.pricing_schedule (
    company_id, location_parking_type_id, effective_date, effective_at,
    base_price, rule, tiers, old_tiers, minimum_stay_days, created_by
  ) values (
    v_company_id, p_location_parking_type_id, p_effective_date, v_effective_at,
    p_base_price, p_rule, coalesce(p_tiers, '[]'::jsonb), p_old_tiers, p_minimum_stay_days, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.pricing_schedule_create(uuid, date, numeric, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.pricing_schedule_create(uuid, date, numeric, jsonb, jsonb, jsonb, integer) to authenticated, service_role;

create or replace function public.pricing_schedule_cancel(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_status text;
begin
  select company_id, status into v_company_id, v_status
    from public.pricing_schedule where id = p_id;
  if v_company_id is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar este preço.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite editar preços (pricing:write).' using errcode = '42501';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Só dá para cancelar uma tabela que ainda não entrou em vigor.' using errcode = '22023';
  end if;

  update public.pricing_schedule
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid()
   where id = p_id;
end;
$$;

revoke all on function public.pricing_schedule_cancel(uuid) from public, anon;
grant execute on function public.pricing_schedule_cancel(uuid) to authenticated, service_role;

-- ─── 5. Aplicar o que venceu ────────────────────────────────────────────────────────────────────
create or replace function public.pricing_schedule_apply_due()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  v_replaced jsonb;
  v_applied integer := 0;
begin
  for s in
    select * from public.pricing_schedule
     where status = 'scheduled' and effective_at <= now()
     order by effective_at, created_at
     for update skip locked
  loop
    begin
      if exists (select 1 from public.wl_mirror_target t where t.location_parking_type_id = s.location_parking_type_id) then
        raise exception 'A vaga passou a copiar o preço do sistema antigo (white-label) depois do agendamento.';
      end if;

      -- D9: o que estava em vigor fica gravado no próprio agendamento.
      select jsonb_build_object(
               'base_price', cpt.base_price,
               'minimum_stay', jsonb_build_object(
                 'has_minimum_stay', lpt.has_minimum_stay,
                 'value', lpt.minimum_stay_value,
                 'unit', lpt.minimum_stay_unit),
               'rule', to_jsonb(pr) - 'id' - 'location_parking_type_id' - 'created_at' - 'updated_at',
               'tiers', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'from_day', t.from_day, 'to_day', t.to_day,
                          'unit_price', t.unit_price, 'total_price', t.total_price,
                          'is_old_price', t.is_old_price) order by t.is_old_price, t.from_day)
                   from public.pricing_tier t where t.pricing_rule_id = pr.id), '[]'::jsonb))
        into v_replaced
        from public.location_parking_type lpt
        join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
        left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
       where lpt.id = s.location_parking_type_id;

      perform public._pricing_write(s.location_parking_type_id, s.base_price, s.rule, s.tiers, s.old_tiers);

      if s.minimum_stay_days is not null then
        update public.location_parking_type
           set has_minimum_stay = true,
               minimum_stay_value = s.minimum_stay_days,
               minimum_stay_unit = 'days'
         where id = s.location_parking_type_id;
      end if;

      update public.pricing_schedule
         set status = 'applied', applied_at = now(), replaced = v_replaced, error = null
       where id = s.id;
      v_applied := v_applied + 1;
    exception when others then
      -- Falha isolada: este agendamento fica marcado, os outros seguem.
      update public.pricing_schedule
         set status = 'failed', error = sqlerrm
       where id = s.id;
    end;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.pricing_schedule_apply_due() from public, anon, authenticated;
grant execute on function public.pricing_schedule_apply_due() to service_role;

-- A cada minuto: a troca das 0h não pode esperar uma janela longa, e a consulta é pelo índice parcial.
select cron.schedule('pricing-schedule-apply', '* * * * *', $cron$select public.pricing_schedule_apply_due();$cron$);
