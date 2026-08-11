-- E0.13 · O espelho grava faixa de preço fechado, e não só diária.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- `wl_mirror_apply_pricing` só sabia inserir `unit_price`. Faixa em que o parceiro cobra preço
-- FECHADO (o mesmo total para qualquer duração dentro dela) não cabe nisso, e virava diária
-- arredondada. No valet do Aeropark: R$ 475,20 em 7 diárias dá R$ 67,8857 por dia, arredonda
-- para R$ 67,89, e o Hub passa a cobrar R$ 475,23. Três centavos que ninguém pediu, num preço
-- que é do parceiro. Acontecia em 4 das 30 durações medidas.
--
-- A política de preço é do parceiro e a gente não altera. Arredondar É alterar, mesmo que por
-- centavos, e é a Movepark que responde pelo número que aparece na tela.
--
-- `pricing_tier.total_price` já existe e o `_apply_pricing` já o prefere sobre a diária
-- (`coalesce(total_price, dias × unit_price)`), que é como a tabela legada do valet sempre foi
-- modelada. Só o espelho não sabia escrever ali.
--
-- Vem junto uma correção que apareceu ao testar isto: `mirror_status` não voltava para `ok` no
-- ON CONFLICT. A regra que divergisse uma vez ficava marcada para sempre, e a vitrine seguia em
-- "a partir de" mesmo depois de o espelho passar a reproduzir o parceiro ao centavo.

-- A impressão digital da regra também ignorava `total_price`, então uma faixa fechada que
-- mudasse de valor não contaria como mudança: a passada não gravaria linha de log e ninguém
-- ficaria sabendo que o parceiro mexeu no preço. É o oposto do que o log-por-evento existe para
-- fazer. Efeito colateral aceito: a primeira passada depois disto marca `changed` em todas as
-- vagas, porque a impressão mudou de forma. O `before` gravado mostra exatamente isso.
create or replace function public.pricing_rule_fingerprint(p_rule_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'strategy', r.strategy,
    'fractional_day_policy', r.fractional_day_policy,
    'fractional_day_tolerance', round(coalesce(r.fractional_day_tolerance, 0), 2)::text,
    'old_price_strategy', r.old_price_strategy,
    'tiers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'from_day', t.from_day,
          'to_day', t.to_day,
          'unit_price', round(coalesce(t.unit_price, 0), 2)::text,
          'total_price', round(coalesce(t.total_price, 0), 2)::text,
          'is_old_price', t.is_old_price
        )
        order by t.is_old_price, t.from_day
      )
      from public.pricing_tier t where t.pricing_rule_id = r.id
    ), '[]'::jsonb)
  )
  from public.pricing_rule r where r.id = p_rule_id;
$$;

revoke all on function public.pricing_rule_fingerprint(uuid) from public, anon;
grant execute on function public.pricing_rule_fingerprint(uuid) to authenticated, service_role;

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
  v_borrowers text;
  rec jsonb;
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_apply_pricing: apenas backend' using errcode = '42501';
  end if;

  -- Outra vaga empresta esta tabela por `surcharge`? Então ela não é só desta unidade, e o
  -- espelho não a reescreve. Ver 20260929010000_mirror_refuses_surcharge_source.sql.
  select string_agg(format('%s/%s/%s', c.slug, l.slug, pt.code), ', ')
    into v_borrowers
    from public.pricing_rule pr
    join public.location_parking_type lpt on lpt.id = pr.location_parking_type_id
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
   where pr.surcharge_source_id = p_location_parking_type_id
     and pr.strategy = 'surcharge'
     and lpt.id <> p_location_parking_type_id;

  if v_borrowers is not null then
    raise exception
      'wl_mirror_apply_pricing: a tabela desta vaga é fonte de surcharge para %. Dê tabela própria a quem empresta antes de espelhar.',
      v_borrowers
      using errcode = 'P0001';
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
    mirror_verified_at = now(),
    -- Volta para `ok` a cada passada. O ON CONFLICT não resetava isso, então a regra que
    -- divergisse uma vez ficava `divergent` para sempre e a vitrine seguia em "a partir de"
    -- mesmo depois da causa ser corrigida. Quem re-marca é a verificação diferencial, que roda
    -- logo depois desta função e chama `wl_mirror_flag_divergence` se ainda divergir.
    mirror_status = 'ok'
  returning id into v_rule_id;

  delete from public.pricing_tier where pricing_rule_id = v_rule_id;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (
      pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price
    )
    values (
      v_rule_id,
      coalesce((rec->>'from_day')::int, 1),
      (rec->>'to_day')::int,
      (rec->>'unit_price')::numeric,
      (rec->>'total_price')::numeric,
      coalesce((rec->>'is_old_price')::boolean, false)
    );
  end loop;

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
