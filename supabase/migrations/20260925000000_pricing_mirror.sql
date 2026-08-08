-- E0.13 · Espelhamento da tabela de preço do white-label.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O amostrador vive na Edge (`wl-price-mirror`); aqui mora o que o banco precisa saber:
-- de onde veio o preço, quando foi medido pela última vez, e o registro do que MUDOU.
--
-- Regra do log: **evento, não batimento.** O `wl_reconcile_log` deste mesmo projeto tem 30 mil
-- linhas contra 225 reservas justamente por gravar toda passada, inclusive as em que nada
-- aconteceu. Aqui a passada que não muda nada só atualiza um carimbo, no lugar.

-- ─────────────────────── 1. Carimbo na regra (crescimento zero) ───────────────────────

alter table public.pricing_rule
  add column if not exists mirror_source text,
  add column if not exists mirror_sampled_at timestamptz,
  add column if not exists mirror_verified_at timestamptz,
  add column if not exists mirror_status text not null default 'ok';

alter table public.pricing_rule drop constraint if exists pricing_rule_mirror_source_check;
alter table public.pricing_rule
  add constraint pricing_rule_mirror_source_check
  check (mirror_source is null or mirror_source in ('wl_sampling'));

alter table public.pricing_rule drop constraint if exists pricing_rule_mirror_status_check;
alter table public.pricing_rule
  add constraint pricing_rule_mirror_status_check
  check (mirror_status in ('ok', 'divergent'));

comment on column public.pricing_rule.mirror_source is
  'Origem do preço. wl_sampling = reconstruído do white-label pelo job de espelhamento (E0.13); null = tabela própria da Movepark.';
comment on column public.pricing_rule.mirror_sampled_at is
  'Quando a tabela MUDOU pela última vez. Passada que confirma o mesmo preço não mexe aqui.';
comment on column public.pricing_rule.mirror_verified_at is
  'Quando o job olhou pela última vez, mudando algo ou não. É o carimbo de frescor.';
comment on column public.pricing_rule.mirror_status is
  'divergent = o motor do Hub e o do parceiro discordaram na última verificação; a vitrine cai para "a partir de".';

-- ─────────────────────── 2. Log por evento ───────────────────────

create table if not exists public.pricing_mirror_run (
  id uuid primary key default gen_random_uuid(),
  location_parking_type_id uuid not null
    references public.location_parking_type(id) on delete cascade,
  -- change  = a tabela do parceiro mudou e foi regravada (histórico de preço, guarda-se sempre)
  -- divergent = motor do Hub discordou do parceiro na verificação diferencial
  -- error   = a amostragem não completou
  kind text not null check (kind in ('change', 'divergent', 'error')),
  calls integer not null default 0,
  /** Fingerprint anterior e novo, para responder "que preço o parceiro praticava em tal data". */
  before jsonb,
  after jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pricing_mirror_run_lpt_idx
  on public.pricing_mirror_run (location_parking_type_id, created_at desc);

comment on table public.pricing_mirror_run is
  'Log POR EVENTO do espelhamento de preço (E0.13). Só grava quando a tabela do parceiro mudou, quando os motores divergiram ou quando a amostragem falhou. Passada silenciosa não gera linha: atualiza pricing_rule.mirror_verified_at no lugar.';

alter table public.pricing_mirror_run enable row level security;

drop policy if exists pricing_mirror_run_admin_read on public.pricing_mirror_run;
create policy pricing_mirror_run_admin_read on public.pricing_mirror_run
  for select to authenticated using (public.is_hub_admin());

-- ─────────────────── 3. Impressão digital da tabela vigente ───────────────────

-- Compara-se por texto com escala fixa: `1` e `1.00` são o mesmo preço, e comparar jsonb cru
-- transformaria mudança de escala em "mudou de preço", gerando log toda passada.
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
          'is_old_price', t.is_old_price
        )
        order by t.is_old_price, t.from_day
      )
      from public.pricing_tier t where t.pricing_rule_id = r.id
    ), '[]'::jsonb)
  )
  from public.pricing_rule r
  where r.id = p_rule_id;
$$;

revoke all on function public.pricing_rule_fingerprint(uuid) from public, anon;
grant execute on function public.pricing_rule_fingerprint(uuid) to authenticated, service_role;

-- ─────────────────── 4. Aplicar a amostragem, gravando só o que mudou ───────────────────

-- Devolve `{changed, run_id, before, after}`. O `changed = false` é o caso comum: preço de
-- estacionamento não muda toda semana, e é essa comparação que evita inundar o log.
--
-- O mesmo teste que economiza linha é o que detecta a mudança de tabela do parceiro. Não são
-- duas coisas: a otimização é o gatilho do alarme.
create or replace function public.wl_mirror_apply_pricing(
  p_location_parking_type_id uuid,
  p_rule jsonb,
  p_tiers jsonb,
  p_calls integer default 0,
  p_anomalies jsonb default '[]'::jsonb
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

revoke all on function public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.wl_mirror_apply_pricing(uuid, jsonb, jsonb, integer, jsonb)
  to service_role;

-- Marca divergência entre o motor do Hub e o do parceiro. A vitrine lê `mirror_status` e cai
-- para "a partir de" enquanto alguém não olha.
create or replace function public.wl_mirror_flag_divergence(
  p_location_parking_type_id uuid,
  p_detail jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_flag_divergence: apenas backend' using errcode = '42501';
  end if;

  update public.pricing_rule
     set mirror_status = 'divergent', mirror_verified_at = now()
   where location_parking_type_id = p_location_parking_type_id;

  insert into public.pricing_mirror_run (location_parking_type_id, kind, detail)
  values (p_location_parking_type_id, 'divergent', coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.wl_mirror_flag_divergence(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.wl_mirror_flag_divergence(uuid, jsonb) to service_role;

-- ─────────────────── 5. Retenção dos logs de integração ───────────────────

-- O `wl_reconcile_log` grava toda passada de 15 em 15 minutos e já acumulou 30 mil linhas
-- contra 225 reservas, sem nunca ter sido limpo. Segue o precedente do `api_request_log`,
-- que apaga o que passa de 90 dias.
--
-- No espelhamento a régua é outra por natureza da linha: `change` é HISTÓRICO DE PREÇO e não
-- se apaga, porque é o que responde "quanto o parceiro cobrava naquela data" se alguém
-- questionar um valor. Só divergência e erro envelhecem.
create or replace function public.cron_prune_integration_logs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconcile integer;
  v_mirror integer;
begin
  delete from public.wl_reconcile_log where created_at < now() - interval '90 days';
  get diagnostics v_reconcile = row_count;

  delete from public.pricing_mirror_run
   where kind in ('divergent', 'error') and created_at < now() - interval '90 days';
  get diagnostics v_mirror = row_count;

  return jsonb_build_object('wl_reconcile_log', v_reconcile, 'pricing_mirror_run', v_mirror);
end;
$$;

revoke all on function public.cron_prune_integration_logs() from public, anon, authenticated;
grant execute on function public.cron_prune_integration_logs() to service_role;
