-- E0.13 · Estadia mínima: o motor para de cotar abaixo do piso, e o espelho grava o piso.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O que apareceu ao virar Abbapark, Nationpark, Plenty, Garageinn e Aeroparking para externo:
-- desses cinco parceiros, quatro recusam estadia curta (3 diárias em Abbapark, Nationpark e
-- Plenty; 2 no Aeroparking). O amostrador começava no dia 1, tomava 400 e abortava a vaga
-- inteira. Corrigido no TS (discoverMinimumDays). Aqui ficam as duas metades que são do banco.
--
-- 1. `_apply_pricing` cotava abaixo do piso, e cotava ERRADO.
--
--    Na busca da faixa, a faixa aberta (`to_day is null`) casava sem olhar o `from_day`. Numa
--    tabela que começa no dia 3, pedir 1 diária caía na ÚLTIMA faixa e devolvia a diária mais
--    barata da curva. No Abbapark isso dava R$ 23,90 para uma diária que o parceiro nem vende,
--    contra R$ 77,70 das 3 diárias mínimas. Pior que errado: barato. A unidade subiria como a
--    mais barata na ordenação da busca, ganharia o clique, e a recusa só apareceria no site do
--    parceiro, depois que o cliente já escolheu.
--
--    Sem faixa que sirva, o preço agora é NULL. A busca já descarta resultado sem preço
--    ("Drop unpriceable results" em supabase/functions/search/index.ts), então a unidade
--    simplesmente não aparece para uma estadia que o parceiro recusaria.
--
--    Isto não muda nada no que está no ar: hoje NENHUMA regra tem primeira faixa acima do dia 1
--    (conferido no banco vivo, 0 linhas). O ramo só passa a existir para as unidades espelhadas.
--
--    `_apply_pricing` tem DUAS sobrecargas (6 e 13 argumentos) com o mesmo laço copiado. Quem
--    o `simulate_price` chama é a de 13; a de 6 continua exposta e chamável. As duas são
--    corrigidas aqui, senão o piso valeria por qual assinatura o chamador usou.
--
-- 2. `wl_mirror_apply_pricing` ganha `p_minimum_days` e carimba o piso na vaga, para o painel e
--    a vitrine lerem de `location_parking_type` em vez de deduzir da primeira faixa.

-- ───────────────── 1. O motor não cota abaixo da primeira faixa ─────────────────

create or replace function public._apply_pricing(
  p_strategy text,
  p_tiers jsonb,
  p_source_strategy text default null,
  p_source_tiers jsonb default null,
  p_surcharge_multiplier double precision default null,
  p_days integer default 1
) returns numeric
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_tier JSONB;
  v_from_day INT;
  v_to_day INT;
  v_unit_price NUMERIC;
  v_total_price NUMERIC;
  v_price NUMERIC := NULL;
  v_remaining INT;
  v_base NUMERIC;
BEGIN
  IF p_strategy = 'tiered_progressive' THEN
    v_remaining := p_days;
    FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) ORDER BY (value->>'from_day')::int LOOP
      v_from_day := (v_tier->>'from_day')::int;
      v_to_day   := NULLIF(v_tier->>'to_day', 'null')::int;
      v_unit_price := (v_tier->>'unit_price')::numeric;
      IF v_remaining <= 0 THEN EXIT; END IF;
      IF v_to_day IS NULL THEN
        v_price := COALESCE(v_price, 0) + v_remaining * v_unit_price;
        v_remaining := 0;
      ELSE
        DECLARE
          v_days_in_tier INT := LEAST(v_remaining, v_to_day - v_from_day + 1);
        BEGIN
          v_price := COALESCE(v_price, 0) + v_days_in_tier * v_unit_price;
          v_remaining := v_remaining - v_days_in_tier;
        END;
      END IF;
    END LOOP;

  ELSIF p_strategy IN ('uniform_by_duration', 'fixed_bracket') THEN
    -- Both strategies: find bracket where p_days falls, apply total_price or days×unit_price.
    -- For infinite bracket (to_day IS NULL): also days×unit_price.
    --
    -- O `p_days >= v_from_day` na faixa aberta é o piso: sem ele a faixa aberta casa com
    -- QUALQUER duração, inclusive as que estão abaixo do começo da tabela.
    FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) ORDER BY (value->>'from_day')::int LOOP
      v_from_day    := (v_tier->>'from_day')::int;
      v_to_day      := NULLIF(v_tier->>'to_day', 'null')::int;
      v_unit_price  := (v_tier->>'unit_price')::numeric;
      v_total_price := (v_tier->>'total_price')::numeric;
      IF (v_to_day IS NULL AND p_days >= v_from_day)
         OR p_days BETWEEN v_from_day AND v_to_day THEN
        v_price := COALESCE(v_total_price, p_days * v_unit_price);
        EXIT;
      END IF;
    END LOOP;

  ELSIF p_strategy = 'surcharge' THEN
    v_base := public._apply_pricing(p_source_strategy, p_source_tiers, NULL, NULL, NULL, p_days);
    IF v_base IS NOT NULL THEN
      v_price := ROUND((v_base * p_surcharge_multiplier::numeric), 2);
    END IF;
  END IF;

  RETURN v_price;
END;
$function$;

comment on function public._apply_pricing(text, jsonb, text, jsonb, double precision, integer) is
  'Aplica a estratégia de preço sobre as faixas. Devolve NULL quando a duração pedida fica abaixo da primeira faixa (tabela com estadia mínima): quem chama trata a ausência de preço, e a busca descarta o resultado.';

-- A de 13 argumentos: a que o simulate_price usa de verdade. Mesmo laço, mesmo piso.
create or replace function public._apply_pricing(
  p_strategy text,
  p_tiers jsonb,
  p_source_strategy text default null,
  p_source_tiers jsonb default null,
  p_surcharge_multiplier double precision default null,
  p_days integer default 1,
  p_inc_one_day double precision default null,
  p_inc_two_days double precision default null,
  p_inc_base double precision default null,
  p_inc_mult double precision default null,
  p_monthly_fixed double precision default null,
  p_monthly_daily double precision default null,
  p_hourly_daily double precision default null
) returns numeric
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tier jsonb;
  v_from_day int;
  v_to_day int;
  v_unit_price numeric;
  v_total_price numeric;
  v_price numeric := null;
  v_remaining int;
  v_base numeric;
  v_months int;
  v_rem int;
begin
  if p_strategy = 'tiered_progressive' then
    v_remaining := p_days;
    for v_tier in select * from jsonb_array_elements(p_tiers) order by (value->>'from_day')::int loop
      v_from_day := (v_tier->>'from_day')::int;
      v_to_day   := nullif(v_tier->>'to_day', 'null')::int;
      v_unit_price := (v_tier->>'unit_price')::numeric;
      if v_remaining <= 0 then exit; end if;
      if v_to_day is null then
        v_price := coalesce(v_price, 0) + v_remaining * v_unit_price;
        v_remaining := 0;
      else
        declare
          v_days_in_tier int := least(v_remaining, v_to_day - v_from_day + 1);
        begin
          v_price := coalesce(v_price, 0) + v_days_in_tier * v_unit_price;
          v_remaining := v_remaining - v_days_in_tier;
        end;
      end if;
    end loop;

  elsif p_strategy in ('uniform_by_duration', 'fixed_bracket') then
    -- `p_days >= v_from_day` na faixa aberta: é o piso da tabela. Ver o cabeçalho desta migration.
    for v_tier in select * from jsonb_array_elements(p_tiers) order by (value->>'from_day')::int loop
      v_from_day    := (v_tier->>'from_day')::int;
      v_to_day      := nullif(v_tier->>'to_day', 'null')::int;
      v_unit_price  := (v_tier->>'unit_price')::numeric;
      v_total_price := (v_tier->>'total_price')::numeric;
      if (v_to_day is null and p_days >= v_from_day)
         or p_days between v_from_day and v_to_day then
        v_price := coalesce(v_total_price, p_days * v_unit_price);
        exit;
      end if;
    end loop;

  elsif p_strategy = 'incremental_formula' then
    if p_days = 1 and p_inc_one_day is not null then
      v_price := p_inc_one_day::numeric;
    elsif p_days = 2 and p_inc_two_days is not null then
      v_price := p_inc_two_days::numeric;
    elsif p_inc_base is not null and p_inc_mult is not null then
      v_price := round((p_inc_base + p_days * p_inc_mult)::numeric, 2);
    end if;

  elsif p_strategy = 'monthly_remainder' then
    if p_monthly_fixed is not null then
      -- Regra especial: 15-30 dias → preço do pacote mensal
      if p_days between 15 and 30 then
        v_price := p_monthly_fixed::numeric;
      else
        v_months := floor(p_days::numeric / 30)::int;
        v_rem := p_days - (v_months * 30);
        v_price := round(
          (v_months * p_monthly_fixed + v_rem * coalesce(p_monthly_daily, 0))::numeric,
          2
        );
      end if;
    end if;

  elsif p_strategy = 'hourly_capped' then
    -- Pro simulate_price com p_days, cobra N × teto_diário.
    -- Cálculo granular minuto-a-minuto fica pro motor de booking real.
    if p_hourly_daily is not null then
      v_price := round((p_days * p_hourly_daily)::numeric, 2);
    end if;

  elsif p_strategy = 'surcharge' then
    v_base := public._apply_pricing(
      p_source_strategy, p_source_tiers, null, null, null, p_days,
      null, null, null, null, null, null, null
    );
    if v_base is not null and p_surcharge_multiplier is not null then
      v_price := round((v_base * p_surcharge_multiplier::numeric), 2);
    end if;
  end if;

  return v_price;
end;
$function$;

comment on function public._apply_pricing(text, jsonb, text, jsonb, double precision, integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Aplica a estratégia de preço sobre as faixas. Devolve NULL quando a duração pedida fica abaixo da primeira faixa (tabela com estadia mínima): quem chama trata a ausência de preço, e a busca descarta o resultado.';

-- ───────────────── 2. O espelho grava o piso na vaga ─────────────────

-- Assinatura nova (ganha p_minimum_days). O DROP é obrigatório: `create or replace` com lista de
-- argumentos diferente criaria uma SEGUNDA função, e a chamada por nome ficaria ambígua.
drop function if exists public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb);

create or replace function public.wl_mirror_apply_pricing(
  p_location_parking_type_id uuid,
  p_rule jsonb,
  p_tiers jsonb,
  p_calls integer default 0,
  p_anomalies jsonb default '[]'::jsonb,
  p_minimum_days integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_run_id uuid;
  rec jsonb;
begin
  -- Backend-only: é o job que chama, nunca o cliente.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_apply_pricing: apenas backend' using errcode = '42501';
  end if;

  select id into v_rule_id from public.pricing_rule
   where location_parking_type_id = p_location_parking_type_id;
  v_before := case when v_rule_id is null then null else public.pricing_rule_fingerprint(v_rule_id) end;

  insert into public.pricing_rule (
    location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance,
    old_price_strategy, mirror_source, mirror_sampled_at, mirror_verified_at, mirror_status
  ) values (
    p_location_parking_type_id,
    coalesce(p_rule->>'strategy', 'uniform_by_duration'),
    coalesce(p_rule->>'fractional_day_policy', 'any_extra'),
    (p_rule->>'fractional_day_tolerance')::numeric,
    coalesce(p_rule->>'old_price_strategy', 'none'),
    'wl_sampling', now(), now(), 'ok'
  )
  on conflict (location_parking_type_id) do update set
    strategy = excluded.strategy,
    fractional_day_policy = excluded.fractional_day_policy,
    fractional_day_tolerance = excluded.fractional_day_tolerance,
    old_price_strategy = excluded.old_price_strategy,
    mirror_source = 'wl_sampling',
    mirror_verified_at = now()
  returning id into v_rule_id;

  -- Substitui TODAS as faixas, inclusive as de balcão: a tabela do parceiro é a verdade
  -- inteira aqui, e manter faixa velha misturaria duas amostragens.
  delete from public.pricing_tier where pricing_rule_id = v_rule_id;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, is_old_price)
    values (
      v_rule_id,
      coalesce((rec->>'from_day')::int, 1),
      (rec->>'to_day')::int,
      (rec->>'unit_price')::numeric,
      coalesce((rec->>'is_old_price')::boolean, false)
    );
  end loop;

  -- O piso também é regra do parceiro, e é espelhado como as faixas. Guardá-lo aqui deixa o
  -- painel e a vitrine lerem o número direto, sem inferir da primeira faixa.
  update public.location_parking_type
     set has_minimum_stay  = coalesce(p_minimum_days, 1) > 1,
         minimum_stay_value = case when coalesce(p_minimum_days, 1) > 1 then p_minimum_days end,
         minimum_stay_unit  = case when coalesce(p_minimum_days, 1) > 1 then 'days'::public.minimum_stay_unit end
   where id = p_location_parking_type_id;

  v_after := public.pricing_rule_fingerprint(v_rule_id);

  if v_before is distinct from v_after then
    update public.pricing_rule set mirror_sampled_at = now() where id = v_rule_id;
    insert into public.pricing_mirror_run (
      location_parking_type_id, kind, calls, before, after, anomalies
    ) values (
      p_location_parking_type_id, 'change', p_calls, v_before, v_after, coalesce(p_anomalies, '[]'::jsonb)
    ) returning id into v_run_id;
  end if;

  return jsonb_build_object(
    'changed', v_before is distinct from v_after,
    'run_id', v_run_id,
    'before', v_before,
    'after', v_after
  );
end;
$$;

revoke all on function public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb, integer)
  to service_role;
