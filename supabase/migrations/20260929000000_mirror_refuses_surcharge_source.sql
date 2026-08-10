-- E0.13 · O espelho recusa reescrever a tabela que outra unidade empresta.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O acidente que isto tranca, encontrado em 10/08/2026 ao virar o Aeropark (ex-Bandeirapark)
-- para externo:
--
-- O valet do AEROVALET em Guarulhos não tinha tabela própria. Ele usava `strategy = 'surcharge'`
-- com `surcharge_source_id` apontando para o valet do AEROPARK e multiplicador 1.0, artefato do
-- import legado (mesmo valet de GRU, mesma lista de preço). Quando o Aeropark virou externo, o
-- espelho reescreveu a tabela dele com a do parceiro, e o Aerovalet foi junto:
--
--     1 diária   R$ 149,00  →  sem preço (o parceiro do Aeropark exige 2 diárias)
--     6 diárias  R$ 594,00  →  R$ 475,20
--    18 diárias  R$ 792,00  →  R$ 1.782,00
--    35 diárias  R$ 924,00  →  R$ 3.465,00
--
-- O Aerovalet é unidade `hub`: a reserva fecha no checkout da Movepark, pelo preço que a tela
-- mostra. Ou seja, uma unidade que a gente vende foi reprecificada em silêncio pela tabela de
-- OUTRO parceiro, e teria que honrar o que aparecesse. A tabela do Aerovalet foi restaurada
-- (fixed_bracket próprio, valores da tabela legada) e o vínculo, cortado.
--
-- A trava: `wl_mirror_apply_pricing` recusa a vaga que serve de fonte de `surcharge` para uma
-- regra de OUTRA unidade. Recusar é o certo aqui, e não "espelhar mesmo assim": quem empresta
-- tabela precisa de decisão humana antes, não de um job noturno reescrevendo por baixo. O job
-- registra a recusa como erro (`pricing_mirror_run.kind = 'error'`), então ela aparece no log
-- em vez de sumir.

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
  -- espelho não a reescreve. Ver o cabeçalho desta migration.
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
    mirror_verified_at = now()
  returning id into v_rule_id;

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
