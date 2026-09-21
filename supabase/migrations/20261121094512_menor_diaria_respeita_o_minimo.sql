-- A menor diária do lote respeita a estadia mínima.
--
-- `lowest_daily_rate` acrescentava a menor estadia vendável (o piso) às durações candidatas, mas
-- não tirava as que ficam ABAIXO dele. Como `simulate_price` precifica qualquer duração sem olhar
-- a estadia mínima, e o empate na diária resolve pela menor duração, um lote de tabela plana que
-- exige 3 diárias saía no card como "a partir de R$ 30,00 em 1 diária": uma estadia que o
-- estacionamento não vende (ADR-009).
--
-- O bug é latente. Medido no vivo em 21/09/2026: 10 lotes ativos têm mínimo em dias e nenhum
-- anuncia abaixo dele, porque toda tabela de lá cai com a duração e a faixa longa vence. Quem
-- acusou foi o caso 7 de `supabase/tests/lowest_daily_rate.test.sql`, que nunca tinha rodado
-- verde: o job `db` do CI estava vermelho desde o dia em que o teste nasceu.
--
-- A única mudança é o `and d >= a.piso` no CTE `candidato`. Assinatura, grants e o resto do corpo
-- são os de 20261121040000.

create or replace function public.lowest_daily_rate(
  p_lpt_ids uuid[],
  p_days integer[] default array[1, 7, 15, 30]
)
returns table (
  location_parking_type_id uuid,
  days integer,
  total numeric,
  old_total numeric,
  daily numeric,
  min_stay_days integer
)
language plpgsql
stable
set search_path to 'public', 'extensions'
as $$
declare
  v_days integer[];
begin
  if p_lpt_ids is null or cardinality(p_lpt_ids) = 0 then
    return;
  end if;
  if cardinality(p_lpt_ids) > 100 then
    raise exception 'p_lpt_ids inválido: no máximo 100 lotes por chamada';
  end if;

  select array_agg(distinct d order by d) into v_days
  from unnest(coalesce(p_days, array[1, 7, 15, 30])) d
  where d between 1 and 60;

  if v_days is null or cardinality(v_days) > 8 then
    raise exception 'p_days inválido: informe de 1 a 8 durações entre 1 e 60 diárias';
  end if;

  return query
  with alvo as materialized (
    select
      lpt.id,
      c.slug as company_slug,
      l.slug as location_slug,
      pt.code as parking_type_code,
      -- Menor duração vendável: a exigência declarada e o início da tabela, valendo a maior das
      -- duas. É a mesma conta que a busca fazia em TypeScript (`minSellableDays`).
      greatest(
        coalesce(
          case when lpt.has_minimum_stay and lpt.minimum_stay_unit = 'days'
               then lpt.minimum_stay_value end,
          1
        ),
        coalesce(
          (select min(t.from_day)
             from pricing_rule pr
             join pricing_tier t on t.pricing_rule_id = pr.id and not t.is_old_price
            where pr.location_parking_type_id = lpt.id),
          1
        )
      ) as piso
    from location_parking_type lpt
    join location l on l.id = lpt.location_id
      and l.deleted_at is null
      and l.status = 'active'
    join company c on c.id = l.company_id
      and c.deleted_at is null
      and c.status = 'active'
    join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
    join parking_type pt on pt.id = cpt.parking_type_id
    where lpt.id = any(p_lpt_ids)
      and lpt.is_active
  ),
  candidato as materialized (
    select a.id, a.company_slug, a.location_slug, a.parking_type_code, a.piso, x.d
    from alvo a
    cross join lateral (
      select distinct d
      from unnest(v_days || array[a.piso]) d
      where d between 1 and 60
        -- Duração abaixo do piso não é candidata: `simulate_price` precifica qualquer duração,
        -- sem olhar a estadia mínima, então quem tem que barrar é esta função.
        and d >= a.piso
    ) x
  ),
  -- `materialized` de propósito: sem isso o planner reavalia `simulate_price` no filtro e de
  -- novo na projeção, dobrando o custo da simulação.
  simulado as materialized (
    select
      cd.id,
      cd.piso,
      cd.d as days,
      (s.sim ->> 'price')::numeric as total,
      (s.sim ->> 'old_price')::numeric as old_total
    from candidato cd
    cross join lateral (
      select simulate_price(cd.company_slug, cd.location_slug, cd.parking_type_code, cd.d) as sim
    ) s
  )
  select distinct on (sm.id)
    sm.id,
    sm.days,
    sm.total,
    sm.old_total,
    round(sm.total / sm.days, 2) as daily,
    -- Piso 1 não é piso: o lote vende uma diária e não há exigência a comunicar.
    nullif(sm.piso, 1) as min_stay_days
  from simulado sm
  where sm.total is not null
    and sm.total > 0
  order by sm.id, round(sm.total / sm.days, 2), sm.days;
end;
$$;
