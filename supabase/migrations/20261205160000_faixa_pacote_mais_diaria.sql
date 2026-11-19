-- Faixa "pacote + diária extra" no motor de preço, e a Pare Seguro acima de 30 dias.
-- Spec: docs/specs/pricing-engine.md (Padrão 3)
--
-- O sintoma: na Pare Seguro (Guarulhos), qualquer estadia acima de 30 dias ficava sem preço e o
-- botão de reservar não ativava. As duas tabelas paravam no dia 30 (1 a 14 por diária, 15 a 30
-- por pacote fechado), e sem faixa que cubra o dia 31 o `_apply_pricing` devolve null.
--
-- A regra do parceiro é a do site dele: "acima de 30, pacote + diária extra". O editor de preço
-- já oferecia isso (campos "Preço total fixo" e "Preço/dia (faixa aberta)" lado a lado no
-- `fixed_bracket`), e a spec já trazia o exemplo "30+ dias: R$ 792 + (dias - 30) × R$ 26,40".
-- Só o motor não sabia fazer a conta: `coalesce(total, dias × diária)` descartava a diária
-- sempre que havia total.
--
-- A partir daqui, uma faixa com os DOIS campos preenchidos cobra o pacote mais a diária por dia
-- dentro da faixa:
--
--   total_price + (dias - from_day + 1) × unit_price
--
-- Ou seja, faixa "31+ : R$ 290 + R$ 18,90/dia" cobra R$ 308,90 em 31 dias e R$ 327,80 em 32.
-- Faixa com um campo só segue exatamente como antes. Nenhuma faixa do banco tinha os dois campos
-- quando esta migration foi escrita (o amostrador do white-label também nunca gera), então
-- nenhum preço existente muda.

create or replace function public._apply_pricing(
  p_strategy text,
  p_tiers jsonb,
  p_source_strategy text default null::text,
  p_source_tiers jsonb default null::jsonb,
  p_surcharge_multiplier double precision default null::double precision,
  p_days integer default 1,
  p_inc_one_day double precision default null::double precision,
  p_inc_two_days double precision default null::double precision,
  p_inc_base double precision default null::double precision,
  p_inc_mult double precision default null::double precision,
  p_monthly_fixed double precision default null::double precision,
  p_monthly_daily double precision default null::double precision,
  p_hourly_daily double precision default null::double precision
)
returns numeric
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
    -- `p_days >= v_from_day` na faixa aberta: é o piso da tabela.
    for v_tier in select * from jsonb_array_elements(p_tiers) order by (value->>'from_day')::int loop
      v_from_day    := (v_tier->>'from_day')::int;
      v_to_day      := nullif(v_tier->>'to_day', 'null')::int;
      v_unit_price  := (v_tier->>'unit_price')::numeric;
      v_total_price := (v_tier->>'total_price')::numeric;
      if (v_to_day is null and p_days >= v_from_day)
         or p_days between v_from_day and v_to_day then
        if v_total_price is not null and v_unit_price is not null then
          -- Pacote + diária extra: o total é a base e cada dia dentro da faixa soma a diária.
          v_price := v_total_price + (p_days - v_from_day + 1) * v_unit_price;
        else
          v_price := coalesce(v_total_price, p_days * v_unit_price);
        end if;
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

-- ---------------------------------------------------------------------------------------------
-- Pare Seguro (Guarulhos): faixa 31+ nas duas vagas, na tabela vigente e na agendada.
-- Decidido com o Diego em 19/11/2026: acima de 30 dias cobra o pacote de 15 a 30 mais a diária
-- da própria vaga por dia extra. O "de" (preço de balcão) segue a mesma forma com a diária de
-- balcão. Em ambiente sem esses registros (db reset local), nada é inserido.
-- ---------------------------------------------------------------------------------------------

-- Tabela vigente.
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
select pr.id, 31, null, v.unit, v.total, v.old
from public.pricing_rule pr
join (values
  -- Descoberta: R$ 290 + R$ 18,90/dia (balcão R$ 290 + R$ 19,90)
  ('6c490113-7216-4f3e-a924-e3686e49c01f'::uuid, 18.90::numeric, 290::numeric, false),
  ('6c490113-7216-4f3e-a924-e3686e49c01f'::uuid, 19.90::numeric, 290::numeric, true),
  -- Coberta: R$ 350 + R$ 28,90/dia (balcão R$ 350 + R$ 29,90)
  ('0e95427a-18c3-4ba2-b301-ac1e2c576da6'::uuid, 28.90::numeric, 350::numeric, false),
  ('0e95427a-18c3-4ba2-b301-ac1e2c576da6'::uuid, 29.90::numeric, 350::numeric, true)
) as v(lpt, unit, total, old) on v.lpt = pr.location_parking_type_id
where not exists (
  select 1 from public.pricing_tier t
  where t.pricing_rule_id = pr.id and t.is_old_price = v.old and t.to_day is null
);

-- Tabela agendada para 01/12/2026: diária nova de cada vaga por dia extra.
update public.pricing_schedule s
set tiers = s.tiers || jsonb_build_array(
      jsonb_build_object('from_day', 31, 'to_day', null, 'unit_price', v.unit, 'total_price', v.total)),
    old_tiers = s.old_tiers || jsonb_build_array(
      jsonb_build_object('from_day', 31, 'to_day', null, 'unit_price', v.old_unit, 'total_price', v.old_total))
from (values
  -- Descoberta: R$ 370 + R$ 24,90/dia (balcão R$ 407 + R$ 27,40)
  ('d2910406-9471-400c-9481-d8a1ba3748f7'::uuid, 24.90::numeric, 370::numeric, 27.40::numeric, 407::numeric),
  -- Coberta: R$ 420 + R$ 38,90/dia (balcão R$ 462 + R$ 42,80)
  ('bc5d971c-f90e-490c-b1d9-96f74037db36'::uuid, 38.90::numeric, 420::numeric, 42.80::numeric, 462::numeric)
) as v(id, unit, total, old_unit, old_total)
where s.id = v.id
  and s.status = 'scheduled'
  and not exists (
    select 1 from jsonb_array_elements(s.tiers) t where t->>'to_day' is null
  );
