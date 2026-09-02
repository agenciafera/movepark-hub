-- O espelho de preço para de pedir publicação quando nada mudou.
--
-- Por que existe. A publicação automática (20261030140000) põe um trigger DE STATEMENT em
-- `pricing_rule`, `pricing_tier` e `location_parking_type`, e o espelho do white-label
-- (E0.13) escreve nas três a cada passada, mesmo quando o parceiro não mexeu em nada: o
-- `on conflict do update` sempre regrava `mirror_verified_at`, as faixas são apagadas e
-- reinseridas uma a uma num laço, e a estadia mínima é regravada por cima do mesmo valor.
--
-- Medido em 02/09/2026, em 48 horas de fila: 428 pedidos de `pricing_tier`, 94 de
-- `pricing_rule` e 48 de `location_parking_type`, contra DUAS mudanças reais de preço no
-- mesmo período. Enquanto o Deploy Hook não estava cadastrado isso só engordava a fila. No
-- dia em que ele entrar, vira o contrário: oito passadas por dia, oito builds do site
-- inteiro por dia, nenhum deles publicando conteúdo novo. Um mecanismo que publica sem
-- motivo é tão ruim quanto um que não publica: em pouco tempo ninguém confia no que ele diz.
--
-- O desenho. O espelho fecha a porta do enfileirador enquanto escreve (`set local`, morre
-- com a transação) e, no fim, enfileira ELE MESMO um pedido, só quando a impressão digital
-- da regra mudou ou quando a estadia mínima mudou. É a mesma pergunta que a função já
-- respondia para decidir se grava linha de histórico, então não existe critério novo aqui:
-- o que entra no log de mudança de preço é exatamente o que pede publicação.
--
-- Por que a porta é um GUC de transação e não um `when` no trigger. Trigger de statement não
-- enxerga linha, então não dá para comparar coluna ali. Trocar por trigger de linha
-- resolveria a `pricing_rule`, mas não a `pricing_tier`, que é apagada e reinserida (toda
-- linha é sempre "nova"). A fonte da verdade sobre "isto mudou?" é a impressão digital, e
-- ela só existe dentro do espelho.
--
-- Ver docs/specs/deploy-automatico.md e docs/specs/espelhamento-preco-wl.md.

-- ── 1. O enfileirador ganha uma porta de saída ───────────────────────────────
--
-- Fechada por default: quem não souber da existência dela continua enfileirando. Só o
-- espelho abre, e só durante a própria transação.
create or replace function public.request_site_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('movepark.skip_site_rebuild', true), 'off') = 'on' then
    return null;
  end if;

  insert into public.site_rebuild_request (source_table, op)
  values (tg_table_name, tg_op);
  return null;
end;
$$;

comment on function public.request_site_rebuild() is
  'Trigger de statement: enfileira publicação do site. Respeita movepark.skip_site_rebuild, que o espelho de preço abre para escrever sem pedir build a cada passada.';

-- ── 2. O espelho escreve calado e enfileira só quando mudou ──────────────────
--
-- Redefinição inteira da função (a de 20260930010000) com três acréscimos marcados no corpo.
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
  v_stay_before jsonb;
  v_stay_after jsonb;
  v_mudou boolean;
  rec jsonb;
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_apply_pricing: apenas backend' using errcode = '42501';
  end if;

  -- ACRÉSCIMO 1: daqui até o fim, escrita nenhuma pede publicação. Quem decide é o bloco
  -- final desta função. `set_config(..., true)` é local à transação: se a função estourar no
  -- meio, o rollback leva a porta embora junto.
  perform set_config('movepark.skip_site_rebuild', 'on', true);

  -- Outra vaga empresta esta tabela por `surcharge`? Então ela não é só desta unidade, e o
  -- espelho não a reescreve. Ver 20260929010000.
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

  -- ACRÉSCIMO 2: a estadia mínima sai da mesma amostragem e aparece na vitrine ("entrada a
  -- partir de N diárias"), mas não entra na impressão digital da regra, que só olha
  -- `pricing_rule` e `pricing_tier`. Sem guardar o antes dela, um parceiro que passasse a
  -- exigir 2 diárias mudaria a página e não pediria publicação.
  select jsonb_build_object('tem', has_minimum_stay, 'valor', minimum_stay_value, 'unidade', minimum_stay_unit)
    into v_stay_before
    from public.location_parking_type
   where id = p_location_parking_type_id;

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
    -- Volta para `ok` a cada passada. Quem re-marca divergência é a verificação diferencial,
    -- que roda logo depois desta função (20260930010000).
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

  select jsonb_build_object('tem', has_minimum_stay, 'valor', minimum_stay_value, 'unidade', minimum_stay_unit)
    into v_stay_after
    from public.location_parking_type
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

  -- ACRÉSCIMO 3: um pedido de publicação, e só quando a página do cliente muda de fato. Um
  -- pedido por passada que mudou, não um por statement: o build é do site inteiro, e a fila
  -- ainda vai juntar tudo que acontecer na mesma janela de silêncio.
  v_mudou := (v_before is distinct from v_after) or (v_stay_before is distinct from v_stay_after);
  if v_mudou then
    insert into public.site_rebuild_request (source_table, op) values ('pricing_rule', 'UPDATE');
  end if;

  -- A porta volta a ficar fechada antes de devolver o controle: o que vier depois nesta mesma
  -- transação (a marcação de divergência, por exemplo) enfileira normalmente.
  perform set_config('movepark.skip_site_rebuild', 'off', true);

  return jsonb_build_object(
    'changed', v_before is distinct from v_after,
    'rebuild_requested', v_mudou,
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

comment on function public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb, integer) is
  'E0.13: grava no Hub a tabela amostrada do parceiro. Escreve com a publicação automática silenciada e enfileira um único pedido de build quando o preço ou a estadia mínima mudam.';

-- ── 3. A fila represada perde o ruído acumulado ──────────────────────────────
--
-- São 4 mil pedidos parados desde 19/08 porque o Deploy Hook nunca foi cadastrado, e a
-- esmagadora maioria é exatamente o ruído que esta migration passa a evitar. Deixá-los ali
-- não muda o resultado (o build é do site inteiro e a fila coalesce), mas o primeiro
-- `site_rebuild_health()` depois do hook entrar leria "fila_grande" por causa de passado.
-- Some só o que veio das três tabelas do espelho; pedido de conteúdo (FAQ, blog, destino)
-- fica, porque esse ainda não foi publicado.
delete from public.site_rebuild_request
 where dispatched_at is null
   and source_table in ('pricing_rule', 'pricing_tier', 'location_parking_type');
