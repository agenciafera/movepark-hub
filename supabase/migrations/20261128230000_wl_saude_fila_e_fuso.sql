-- Integração Hub ↔ white-label: fuso das datas, ordem da fila e saúde visível.
-- Spec: docs/specs/shared-availability.md (§ Saúde da integração) e espelhamento-preco-wl.md.
--
-- O que estava errado, medido em produção em 08/10/2026:
--
--   1. A data enviada ao WL saía de `to_char(check_in_at, 'YYYY-MM-DD')` no fuso da sessão,
--      que é UTC. Entrada às 22h em São Paulo ia ao parceiro como o dia seguinte: 5 de 31
--      reservas entregues tinham o dia de entrada errado. A correção vale só para o que vai
--      ao WL. O motor de capacidade do próprio Hub também conta dia em UTC (`::date` em
--      _create_booking_core, check_availability e afins), mas isso é convenção interna dele,
--      consistente consigo mesma, e mudar é decisão à parte.
--
--   2. A fila `wl_delivery` saía por `next_attempt_at` e ninguém marcava a linha em
--      processamento. Um `reserve` em espera podia sair DEPOIS do `release` do mesmo id: o
--      WL ignora o release de um id que não conhece, aplica o reserve e a vaga fica presa.
--      Duas execuções do cron também podiam pegar a mesma linha. Agora a Edge reivindica as
--      linhas por `wl_delivery_claim` (FOR UPDATE SKIP LOCKED + concessão de 5 minutos), em
--      ordem de criação, e o release espera o reserve do mesmo id sair.
--
--   3. `failed` era fim de linha, sem reenvio e sem ninguém sabendo. Ganha `wl_delivery_retry`
--      (hub_admin) e entra na saúde.
--
--   4. Erro do espelho de preço gravava uma linha de log e deixava `mirror_status = 'ok'`:
--      a BePark errou 140 vezes e a tela seguiu dizendo "ok". E, como o erro não mexia em
--      `mirror_verified_at`, a vaga que falha continuava sendo a mais velha e voltava no topo
--      de toda passada, ocupando a vez das outras. Agora o erro é estado (`error`, com a
--      mensagem) e carimba a verificação, então o rodízio segue.
--
--   5. A reconciliação só escrevia no console da Edge. Se o WL caísse, `external_booked_count`
--      congelava calado. Agora cada vaga tem carimbo de última leitura boa e do último erro,
--      numa tabela própria (`wl_sync_state`): gravar em `location_parking_type` a cada 15
--      minutos dispararia rebuild do site, porque ela tem o trigger `_site_rebuild`.
--
--   6. Nada disso tinha onde aparecer. `wl_integration_health()` responde se a integração
--      está de pé (checada todo dia pelo workflow wl-health.yml, no molde do
--      site_rebuild_health) e `manager_wl_health()` alimenta a tela /manager/white-label.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Data local de São Paulo para o que vai ao WL
-- ─────────────────────────────────────────────────────────────────────────────
-- Todas as unidades com WL estão no fuso de Brasília (SP, PR, MG). `location` não tem coluna
-- de fuso; se um dia entrar parceiro em Manaus ou Cuiabá, é aqui que muda.
create or replace function public.wl_local_date(p_at timestamptz)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select to_char(p_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
$$;

revoke all on function public.wl_local_date(timestamptz) from public, anon, authenticated;
grant execute on function public.wl_local_date(timestamptz) to service_role;

create or replace function public.wl_enqueue_delivery()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_op text := tg_argv[0]; v_booking_id uuid; v_pt uuid; v_rec record;
begin
  if tg_table_name = 'booking_item' then
    v_booking_id := new.booking_id; v_pt := new.parking_type_id;
  else
    v_booking_id := new.id;
    select parking_type_id into v_pt from public.booking_item where booking_id = v_booking_id and item_type = 'parking' limit 1;
  end if;
  if v_pt is null then return new; end if;
  select c.id as company_id, c.wl_sync_enabled, lpt.wl_category_slug, lpt.wl_product_slug, b.check_in_at, b.check_out_at
    into v_rec
  from public.booking b
  join public.location l on l.id = b.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
  join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
  where b.id = v_booking_id limit 1;
  if not coalesce(v_rec.wl_sync_enabled, false) or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then return new; end if;
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, public.wl_external_id(v_booking_id) || ':' || v_op, v_op,
    jsonb_build_object('external_id', public.wl_external_id(v_booking_id), 'operation', v_op,
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1,
      'start_date', public.wl_local_date(v_rec.check_in_at), 'end_date', public.wl_local_date(v_rec.check_out_at)))
  on conflict (event_id) do nothing;
  return new;
end; $function$;

revoke all on function public.wl_enqueue_delivery() from public, anon, authenticated;

create or replace function public.wl_enqueue_dates_changed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_rec record; v_pt uuid; v_old text; v_new text;
begin
  select bi.parking_type_id into v_pt from public.booking_item bi
   where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  if v_pt is null then return; end if;
  select c.id as company_id, c.wl_sync_enabled, lpt.wl_category_slug, lpt.wl_product_slug,
         b.check_in_at, b.check_out_at, b.status
    into v_rec
    from public.booking b
    join public.location l on l.id = b.location_id
    join public.company c on c.id = l.company_id
    join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
    join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
   where b.id = p_booking_id limit 1;
  if not coalesce(v_rec.wl_sync_enabled, false) or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then return; end if;
  if v_rec.status not in ('pending', 'confirmed', 'checked_in') then return; end if;

  v_old := public.wl_external_id(p_booking_id);
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, v_old || ':release', 'release',
    jsonb_build_object('external_id', v_old, 'operation', 'release',
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1))
  on conflict (event_id) do nothing;

  update public.booking set wl_external_version = wl_external_version + 1 where id = p_booking_id;
  v_new := public.wl_external_id(p_booking_id);
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, v_new || ':reserve', 'reserve',
    jsonb_build_object('external_id', v_new, 'operation', 'reserve',
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1,
      'start_date', public.wl_local_date(v_rec.check_in_at), 'end_date', public.wl_local_date(v_rec.check_out_at)))
  on conflict (event_id) do nothing;
end $function$;

revoke all on function public.wl_enqueue_dates_changed(uuid) from public, anon, authenticated;
grant execute on function public.wl_enqueue_dates_changed(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fila com ordem e concessão
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists wl_delivery_external_id_idx
  on public.wl_delivery (company_id, (payload->>'external_id'));

-- Reivindica até p_limit linhas vencidas para UMA execução da Edge.
--
-- A concessão empurra `next_attempt_at` para frente: outra execução que rode no meio não vê a
-- linha, e se a Edge morrer sem responder a linha volta sozinha quando a concessão vence. Quem
-- grava o resultado (delivered, nova espera ou failed) continua sendo a Edge.
--
-- O `release` só sai quando nenhum `reserve` do MESMO external_id está pendente. O `reserve`
-- que virou `failed` não segura: o WL não conhece o id, o release é inofensivo e sair limpa a
-- fila.
create or replace function public.wl_delivery_claim(
  p_limit integer default 50,
  p_lease interval default interval '5 minutes'
)
returns table (
  id uuid,
  event_id text,
  operation text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  wl_domain text,
  wl_tenant_key text,
  wl_sync_enabled boolean
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with alvo as (
    select d.id
      from public.wl_delivery d
     where d.status = 'pending'
       and d.next_attempt_at <= now()
       and not (
         d.operation = 'release'
         and exists (
           select 1 from public.wl_delivery r
            where r.company_id = d.company_id
              and r.operation = 'reserve'
              and r.status = 'pending'
              and r.payload->>'external_id' = d.payload->>'external_id'
         )
       )
     order by d.created_at, d.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update of d skip locked
  ),
  marcado as (
    update public.wl_delivery w
       set next_attempt_at = now() + coalesce(p_lease, interval '5 minutes')
      from alvo
     where w.id = alvo.id
    returning w.id, w.event_id, w.operation, w.payload, w.attempts, w.max_attempts,
              w.company_id, w.created_at
  )
  select m.id, m.event_id, m.operation, m.payload, m.attempts, m.max_attempts,
         c.wl_domain, c.wl_tenant_key, c.wl_sync_enabled
    from marcado m
    join public.company c on c.id = m.company_id
   order by m.created_at, m.id;
end $function$;

revoke all on function public.wl_delivery_claim(integer, interval) from public, anon, authenticated;
grant execute on function public.wl_delivery_claim(integer, interval) to service_role;

-- Reenvio manual de uma entrega `failed` (botão "Reenviar" na tela de saúde).
create or replace function public.wl_delivery_retry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_n integer;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark reenvia entregas ao white-label.' using errcode = '42501';
  end if;
  update public.wl_delivery
     set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, last_status = null
   where id = p_id and status = 'failed';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

revoke all on function public.wl_delivery_retry(uuid) from public, anon;
grant execute on function public.wl_delivery_retry(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Erro do espelho é estado
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.pricing_rule drop constraint if exists pricing_rule_mirror_status_check;
alter table public.pricing_rule
  add constraint pricing_rule_mirror_status_check
  check (mirror_status = any (array['ok'::text, 'divergent'::text, 'error'::text]));

alter table public.pricing_rule add column if not exists mirror_error text;

comment on column public.pricing_rule.mirror_status is
  'Espelho de preço WL: ok (a última passada aplicou e conferiu), divergent (os motores discordam) ou error (a última passada não conseguiu amostrar; o preço gravado é o da última passada boa).';
comment on column public.pricing_rule.mirror_error is
  'Mensagem da última falha do espelho. Limpa sozinha quando o status sai de error.';

-- A mensagem só vale enquanto o status for `error`. Um trigger limpa em vez de redefinir
-- wl_mirror_apply_pricing (150 linhas) só para zerar uma coluna.
create or replace function public.pricing_rule_mirror_error_clear()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.mirror_status is distinct from 'error' then
    new.mirror_error := null;
  end if;
  return new;
end $function$;

revoke all on function public.pricing_rule_mirror_error_clear() from public, anon, authenticated;

drop trigger if exists pricing_rule_mirror_error_clear on public.pricing_rule;
create trigger pricing_rule_mirror_error_clear
  before update of mirror_status on public.pricing_rule
  for each row execute function public.pricing_rule_mirror_error_clear();

create or replace function public.wl_mirror_flag_error(p_location_parking_type_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_flag_error: apenas backend' using errcode = '42501';
  end if;

  -- Status do espelho não aparece no site: não é motivo para republicar.
  perform set_config('movepark.skip_site_rebuild', 'on', true);

  update public.pricing_rule
     set mirror_status = 'error',
         mirror_error = left(coalesce(p_message, 'erro sem mensagem'), 500),
         mirror_verified_at = now()
   -- Sem filtrar `mirror_source`: a vaga que falha antes da primeira amostragem boa também
   -- precisa do carimbo, senão segue como "nunca verificada" no topo de toda passada.
   where location_parking_type_id = p_location_parking_type_id;

  insert into public.pricing_mirror_run (location_parking_type_id, kind, detail)
  values (p_location_parking_type_id, 'error', jsonb_build_object('message', p_message));

  perform set_config('movepark.skip_site_rebuild', 'off', true);
end $function$;

revoke all on function public.wl_mirror_flag_error(uuid, text) from public, anon, authenticated;
grant execute on function public.wl_mirror_flag_error(uuid, text) to service_role;

-- A divergência também só muda status: mesma razão para não republicar o site.
create or replace function public.wl_mirror_flag_divergence(p_location_parking_type_id uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'wl_mirror_flag_divergence: apenas backend' using errcode = '42501';
  end if;

  perform set_config('movepark.skip_site_rebuild', 'on', true);

  update public.pricing_rule
     set mirror_status = 'divergent', mirror_verified_at = now()
   where location_parking_type_id = p_location_parking_type_id;

  insert into public.pricing_mirror_run (location_parking_type_id, kind, detail)
  values (p_location_parking_type_id, 'divergent', coalesce(p_detail, '{}'::jsonb));

  perform set_config('movepark.skip_site_rebuild', 'off', true);
end;
$function$;

revoke all on function public.wl_mirror_flag_divergence(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wl_mirror_flag_divergence(uuid, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Frescor da reconciliação
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wl_sync_state (
  location_parking_type_id uuid primary key references public.location_parking_type(id) on delete cascade,
  reconciled_at      timestamptz,
  reconcile_error    text,
  reconcile_error_at timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.wl_sync_state is
  'Frescor da reconciliação WL→Hub por vaga: última leitura boa e último erro. Mora fora de location_parking_type porque gravar lá a cada 15 minutos dispararia rebuild do site.';

alter table public.wl_sync_state enable row level security;
revoke all on table public.wl_sync_state from anon;
grant select on table public.wl_sync_state to authenticated;
drop policy if exists wl_sync_state_admin_select on public.wl_sync_state;
create policy wl_sync_state_admin_select on public.wl_sync_state for select to authenticated
  using (public.is_hub_admin());

create or replace function public.wl_reconcile_apply(p_lpt_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company_id uuid; v_row jsonb; v_date date; v_new int; v_old int; v_changed int := 0;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.id = p_lpt_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_date := (v_row->>'date')::date;
    v_new := greatest(0, coalesce((v_row->>'external')::int, 0));
    select external_booked_count into v_old from public.location_parking_availability
     where location_parking_type_id = p_lpt_id and date = v_date;
    if v_old is null and v_new = 0 then continue; end if;
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count, external_booked_count)
    values (p_lpt_id, v_date, 0, v_new)
    on conflict (location_parking_type_id, date) do update set external_booked_count = v_new;
    if coalesce(v_old, 0) is distinct from v_new then
      insert into public.wl_reconcile_log (company_id, location_parking_type_id, date, old_external, new_external)
      values (v_company_id, p_lpt_id, v_date, v_old, v_new);
      v_changed := v_changed + 1;
    end if;
  end loop;

  insert into public.wl_sync_state (location_parking_type_id, reconciled_at, reconcile_error, reconcile_error_at, updated_at)
  values (p_lpt_id, now(), null, null, now())
  on conflict (location_parking_type_id) do update
    set reconciled_at = now(), reconcile_error = null, updated_at = now();

  return v_changed;
end; $function$;

revoke all on function public.wl_reconcile_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wl_reconcile_apply(uuid, jsonb) to service_role;

create or replace function public.wl_reconcile_fail(p_lpt_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.wl_sync_state (location_parking_type_id, reconcile_error, reconcile_error_at, updated_at)
  values (p_lpt_id, left(coalesce(p_error, 'erro sem mensagem'), 500), now(), now())
  on conflict (location_parking_type_id) do update
    set reconcile_error = excluded.reconcile_error, reconcile_error_at = now(), updated_at = now();
end $function$;

revoke all on function public.wl_reconcile_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.wl_reconcile_fail(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Saúde
-- ─────────────────────────────────────────────────────────────────────────────
-- As vagas que o espelho deve cobrir: mesmo recorte da Edge wl-price-mirror.
create or replace view public.wl_mirror_target
with (security_invoker = true) as
select lpt.id as location_parking_type_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
 where lpt.is_active
   and lpt.wl_category_slug is not null
   and lpt.wl_product_slug is not null
   and l.checkout_mode in ('external', 'hub')
   and nullif(btrim(coalesce(c.wl_domain, '')), '') is not null
   and l.deleted_at is null
   and c.deleted_at is null;

-- As vagas que a reconciliação deve cobrir: mesmo recorte da Edge wl-reconcile.
create or replace view public.wl_reconcile_target
with (security_invoker = true) as
select lpt.id as location_parking_type_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
 where lpt.is_active
   and lpt.wl_category_slug is not null
   and lpt.wl_product_slug is not null
   and c.wl_sync_enabled
   and l.deleted_at is null
   and c.deleted_at is null;

revoke all on public.wl_mirror_target, public.wl_reconcile_target from anon, authenticated;
grant select on public.wl_mirror_target, public.wl_reconcile_target to service_role;

create or replace function public.wl_integration_health(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cfg jsonb;
  v_atraso_entrega_min integer;
  v_atraso_reconcile_min integer;
  v_atraso_espelho_h integer;
  v_falhas integer;
  v_atrasadas integer;
  v_reconcile_parada integer;
  v_reconcile_erro integer;
  v_espelho_erro integer;
  v_espelho_divergente integer;
  v_espelho_atrasado integer;
  v_espelho_mais_antigo timestamptz;
  v_motivos text[] := '{}';
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê a saúde do white-label.' using errcode = '42501';
  end if;

  v_cfg := coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'wl_health_policy'),
    '{}'::jsonb
  );
  v_atraso_entrega_min   := coalesce((v_cfg->>'delivery_max_age_minutes')::integer, 60);
  v_atraso_reconcile_min := coalesce((v_cfg->>'reconcile_max_age_minutes')::integer, 120);
  v_atraso_espelho_h     := coalesce((v_cfg->>'mirror_max_age_hours')::integer, 24);

  select count(*) into v_falhas from public.wl_delivery where status = 'failed';

  select count(*) into v_atrasadas
    from public.wl_delivery
   where status = 'pending'
     and created_at < p_now - make_interval(mins => v_atraso_entrega_min);

  select count(*) filter (where s.reconciled_at is null
                             or s.reconciled_at < p_now - make_interval(mins => v_atraso_reconcile_min)),
         count(*) filter (where s.reconcile_error is not null)
    into v_reconcile_parada, v_reconcile_erro
    from public.wl_reconcile_target t
    left join public.wl_sync_state s using (location_parking_type_id);

  select count(*) filter (where pr.mirror_status = 'error'),
         count(*) filter (where pr.mirror_status = 'divergent'),
         count(*) filter (where pr.mirror_verified_at is null
                             or pr.mirror_verified_at < p_now - make_interval(hours => v_atraso_espelho_h)),
         min(pr.mirror_verified_at)
    into v_espelho_erro, v_espelho_divergente, v_espelho_atrasado, v_espelho_mais_antigo
    from public.wl_mirror_target t
    left join public.pricing_rule pr on pr.location_parking_type_id = t.location_parking_type_id;

  if v_falhas > 0 then v_motivos := array_append(v_motivos, 'entrega_falhou'); end if;
  if v_atrasadas > 0 then v_motivos := array_append(v_motivos, 'entrega_atrasada'); end if;
  if v_reconcile_parada > 0 then v_motivos := array_append(v_motivos, 'reconciliacao_parada'); end if;
  if v_espelho_erro > 0 then v_motivos := array_append(v_motivos, 'espelho_com_erro'); end if;
  if v_espelho_divergente > 0 then v_motivos := array_append(v_motivos, 'espelho_divergente'); end if;
  if v_espelho_atrasado > 0 then v_motivos := array_append(v_motivos, 'espelho_atrasado'); end if;

  return jsonb_build_object(
    'ok', cardinality(v_motivos) = 0,
    'motivos', to_jsonb(v_motivos),
    'entregas_falhas', v_falhas,
    'entregas_atrasadas', v_atrasadas,
    'reconciliacao_parada', v_reconcile_parada,
    'reconciliacao_com_erro', v_reconcile_erro,
    'espelho_com_erro', v_espelho_erro,
    'espelho_divergente', v_espelho_divergente,
    'espelho_atrasado', v_espelho_atrasado,
    'espelho_mais_antigo', v_espelho_mais_antigo,
    'limites', jsonb_build_object(
      'entrega_minutos', v_atraso_entrega_min,
      'reconciliacao_minutos', v_atraso_reconcile_min,
      'espelho_horas', v_atraso_espelho_h
    )
  );
end $function$;

revoke all on function public.wl_integration_health(timestamptz) from public, anon;
grant execute on function public.wl_integration_health(timestamptz) to authenticated, service_role;

-- Tudo o que a tela /manager/white-label mostra, numa chamada.
create or replace function public.manager_wl_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê a saúde do white-label.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'health', public.wl_integration_health(now()),
    'deliveries', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (
          select d.id, d.event_id, d.operation, d.status, d.attempts, d.max_attempts,
                 d.last_status, d.last_error, d.next_attempt_at, d.created_at,
                 d.payload->>'start_date' as start_date, d.payload->>'end_date' as end_date,
                 split_part(split_part(d.event_id, ':', 1), '#', 1) as booking_id,
                 c.name as company_name
            from public.wl_delivery d
            join public.company c on c.id = d.company_id
           where d.status = 'failed'
              or (d.status = 'pending' and d.created_at < now() - interval '10 minutes')
           order by d.created_at desc
           limit 100
        ) x
    ), '[]'::jsonb),
    'recent', (
      select jsonb_build_object(
        'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at > now() - interval '24 hours'),
        'pending', count(*) filter (where status = 'pending'),
        'last_delivered_at', max(delivered_at)
      ) from public.wl_delivery
    ),
    'units', coalesce((
      select jsonb_agg(u order by u.company_name, u.location_name, u.parking_type_name)
        from (
          select lpt.id as location_parking_type_id,
                 c.name as company_name, l.name as location_name, pt.name as parking_type_name,
                 l.checkout_mode, c.wl_sync_enabled,
                 lpt.wl_category_slug, lpt.wl_product_slug,
                 (rt.location_parking_type_id is not null) as reconcile_expected,
                 s.reconciled_at, s.reconcile_error, s.reconcile_error_at,
                 pr.mirror_status, pr.mirror_verified_at, pr.mirror_sampled_at, pr.mirror_error
            from public.wl_mirror_target mt
            full join public.wl_reconcile_target rt using (location_parking_type_id)
            join public.location_parking_type lpt on lpt.id = coalesce(mt.location_parking_type_id, rt.location_parking_type_id)
            join public.location l on l.id = lpt.location_id
            join public.company c on c.id = l.company_id
            join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
            join public.parking_type pt on pt.id = cpt.parking_type_id
            left join public.wl_sync_state s on s.location_parking_type_id = lpt.id
            left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
        ) u
    ), '[]'::jsonb)
  );
end $function$;

revoke all on function public.manager_wl_health() from public, anon;
grant execute on function public.manager_wl_health() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cron: espelho mais frequente e timeout explícito
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada passada do espelho só cabe UMA vaga (78 chamadas, uns 80s, contra o orçamento de 60s
-- para começar). De 3 em 3 horas eram 8 passadas por dia para 18 vagas: a fila levava mais de
-- dois dias para girar. De 20 em 20 minutos são 72 passadas: cada vaga é conferida a cada
-- 6 horas, e uma passada (até 150s) nunca encosta na seguinte.
--
-- wl-deliver e wl-reconcile não tinham `timeout_milliseconds`, e o padrão do pg_net é 5s: o
-- disparo morria na resolução de DNS umas 16 vezes por dia sem ninguém ver.
select cron.unschedule(jobid) from cron.job where jobname in ('wl-deliver', 'wl-reconcile', 'wl-price-mirror');

select cron.schedule('wl-deliver', '* * * * *', $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-deliver',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$cron$);

select cron.schedule('wl-reconcile', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-reconcile',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);

select cron.schedule('wl-price-mirror', '*/20 * * * *', $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-price-mirror',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000);
$cron$);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Retenção da fila
-- ─────────────────────────────────────────────────────────────────────────────
-- `wl_delivery` não tinha poda nenhuma. Entregue some depois de 180 dias; `failed` fica até
-- alguém reenviar, porque é pendência.
create or replace function public.cron_prune_integration_logs()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reconcile integer;
  v_mirror integer;
  v_exit integer;
  v_delivery integer;
begin
  delete from public.wl_reconcile_log where created_at < now() - interval '90 days';
  get diagnostics v_reconcile = row_count;

  delete from public.pricing_mirror_run
   where kind in ('divergent', 'error') and created_at < now() - interval '90 days';
  get diagnostics v_mirror = row_count;

  delete from public.external_exit_click where created_at < now() - interval '180 days';
  get diagnostics v_exit = row_count;

  delete from public.wl_delivery where status = 'delivered' and delivered_at < now() - interval '180 days';
  get diagnostics v_delivery = row_count;

  return jsonb_build_object(
    'wl_reconcile_log', v_reconcile,
    'pricing_mirror_run', v_mirror,
    'external_exit_click', v_exit,
    'wl_delivery', v_delivery
  );
end;
$function$;

revoke all on function public.cron_prune_integration_logs() from public, anon, authenticated;
