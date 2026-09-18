-- Menor diária do lote, calculada pelo motor de preço.
--
-- O card do estacionamento mostrava o preço da janela que a vitrine pediu (1 diária), e não o
-- melhor preço que a unidade pratica. No Virapark isso escrevia "R$ 40,00 / 1 diária" numa tabela
-- que vende a diária por R$ 24,90 a partir de 7 diárias: o número da tela era o mais caro da
-- unidade, justamente na comparação em que o cliente escolhe.
--
-- Quem responde "qual é a menor diária" é o motor (`simulate_price`), nunca o TypeScript: a regra
-- mora no Postgres (docs/specs/pricing-engine.md) e a tabela tem estratégia, faixa por total e
-- faixa por diária. Aqui a função simula as durações de referência da vitrine (as mesmas de
-- `destination_price_index` e da página /precos, para o card e a tabela não brigarem), acrescenta
-- a menor estadia que o lote de fato vende e devolve a duração em que a diária sai mais barata.
--
-- Empate na diária resolve pela MENOR duração: se a tabela é plana, a promessa honesta é a que
-- exige menos dias do cliente.
--
-- Segurança: a função NÃO é security definer. Os joins correm sob a RLS de quem pergunta, então
-- anônimo só precifica o que anônimo enxerga, e o testador continua vendo rascunho. Os filtros
-- estruturais (ativo, não apagado, empresa ativa) são explícitos porque não dependem do papel de
-- quem lê, e `simulate_price` é security definer: sem eles um id avulso precificaria lote fora
-- do ar.
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

comment on function public.lowest_daily_rate(uuid[], integer[]) is
  'Menor diária que cada lote pratica, pelo motor de preço, com a duração em que ela vale. Alimenta o "a partir de" do card na home, na página de destino e na busca.';

grant execute on function public.lowest_daily_rate(uuid[], integer[]) to anon, authenticated, service_role;
