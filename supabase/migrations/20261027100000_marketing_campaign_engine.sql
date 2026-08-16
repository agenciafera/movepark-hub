-- E3.1 · Motor de campanha: resolução de público e fila de execução.
--
-- A conta pesada (avaliar o segmento contra a base inteira) fica no Postgres; a Edge
-- `marketing-run` só caminha pelos nós do canvas e entrega. Puxar a base para o Deno para filtrar
-- em memória seria trazer e-mail e telefone de todo mundo para fora do banco a cada execução.
--
-- Estas duas funções são chamadas com o `service_role` (a Edge), não pelo painel. Por isso não
-- carregam gate de `is_hub_admin()`: quem chama já é o backend. O `execute` fica revogado de
-- `anon` e `authenticated` justamente porque elas escrevem matrícula e leem contato.
--
-- Spec: docs/specs/marketing-automation.md § Motor de execução

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Matrícula: quem entra na campanha
--
-- Três filtros que não são negociáveis, aplicados aqui e não na Edge, para que qualquer caminho
-- de execução herde a mesma regra:
--   a) descadastrado nunca entra;
--   b) contato já matriculado não entra de novo (unique + `not exists`), senão a pessoa recebe
--      a sequência inteira outra vez a cada disparo;
--   c) `send_cap` corta o público. É o freio de mão contra a campanha nova que pega a base toda.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_enroll_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_definition jsonb;
  v_location_ids uuid[];
  v_send_cap integer;
  v_enrolled integer := 0;
  v_already integer;
begin
  select
    coalesce(sg.definition, '{"match":"all","rules":[]}'::jsonb),
    case when cardinality(c.location_ids) > 0 then c.location_ids else null end,
    c.send_cap
  into v_definition, v_location_ids, v_send_cap
  from public.marketing_campaign c
  left join public.marketing_segment sg
    on sg.id = c.segment_id and sg.deleted_at is null
  where c.id = p_campaign_id and c.deleted_at is null;

  if not found then
    raise exception 'Campanha não encontrada.' using errcode = 'P0002';
  end if;

  select count(*) into v_already
  from public.marketing_enrollment where campaign_id = p_campaign_id;

  with elegivel as (
    select c.id
    from public.marketing_contact c
    join public.marketing_contact_doc(v_location_ids) d
      on d.contact_key = c.contact_key
    where c.deleted_at is null
      and c.unsubscribed_at is null
      and public.marketing_eval_definition(d.doc, v_definition)
      and not exists (
        select 1 from public.marketing_enrollment e
        where e.campaign_id = p_campaign_id and e.contact_id = c.id
      )
    order by c.created_at
    limit greatest(0, v_send_cap - v_already)
  ),
  ins as (
    insert into public.marketing_enrollment (campaign_id, contact_id, status)
    select id, p_campaign_id, 'active' from elegivel
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select count(*)::int into v_enrolled from ins;

  return jsonb_build_object(
    'enrolled', v_enrolled,
    'already', v_already,
    'send_cap', v_send_cap
  );
end;
$fn$;

revoke all on function public.marketing_enroll_campaign(uuid) from public, anon, authenticated;

comment on function public.marketing_enroll_campaign(uuid) is
  'Matricula o público do segmento na campanha, respeitando descadastro, matrícula existente e send_cap. Chamada pelo service_role (Edge marketing-run).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fila: matrículas prontas para avançar um nó
--
-- Traz junto o documento do contato porque o nó de condição do canvas é avaliado contra ele.
-- Sem isso a Edge teria que fazer uma segunda ida ao banco por contato.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_due_enrollments(
  p_campaign_id uuid,
  p_limit integer default 100
) returns table (
  enrollment_id uuid,
  contact_id uuid,
  contact_key text,
  display_name text,
  email text,
  phone text,
  status public.marketing_enrollment_status,
  current_node_id text,
  email_consent boolean,
  whatsapp_consent boolean,
  email_suppressed boolean,
  whatsapp_suppressed boolean,
  doc jsonb
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
  select
    e.id,
    c.id,
    c.contact_key,
    c.display_name,
    c.marketing_email,
    c.marketing_phone,
    e.status,
    e.current_node_id,
    c.email_consent,
    c.whatsapp_consent,
    exists (
      select 1 from public.marketing_suppression s
      where s.contact_key = c.contact_key and s.channel = 'email'
    ),
    exists (
      select 1 from public.marketing_suppression s
      where s.contact_key = c.contact_key and s.channel = 'whatsapp'
    ),
    coalesce(d.doc, '{}'::jsonb)
  from public.marketing_enrollment e
  join public.marketing_contact c on c.id = e.contact_id
  left join lateral (
    select dd.doc from public.marketing_contact_doc(null) dd
    where dd.contact_key = c.contact_key
    limit 1
  ) d on true
  where e.campaign_id = p_campaign_id
    and e.status in ('active', 'waiting')
    and (e.wait_until is null or e.wait_until <= now())
    and c.deleted_at is null
    and c.unsubscribed_at is null
  order by e.entered_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

revoke all on function public.marketing_due_enrollments(uuid, integer)
  from public, anon, authenticated;

comment on function public.marketing_due_enrollments(uuid, integer) is
  'Matrículas prontas para avançar, com o documento do contato embutido para o nó de condição. Chamada pelo service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Contatos de um segmento, para a tela de segmentos listar quem casou
--
-- Antes disso, o documento do contato ganha `display_name`. Ele ficou de fora na 20261027093000
-- e a lista da tela mostraria uma coluna de nome vazia para todo mundo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_contact_doc(
  p_location_ids uuid[] default null
) returns table (contact_key text, doc jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
  select
    m.contact_key,
    jsonb_build_object(
      'display_name', coalesce(c.display_name, m.display_name),
      'bookings_count', m.bookings_count,
      'cancelled_count', m.cancelled_count,
      'total_spent', m.total_spent,
      'avg_ticket', m.avg_ticket,
      'days_since_last', m.days_since_last,
      'days_since_first', m.days_since_first,
      'distinct_locations', m.distinct_locations,
      'vacation_bookings', m.vacation_bookings,
      'vacation_share', m.vacation_share,
      'avg_gap_days', m.avg_gap_days,
      'vehicle_model', m.vehicle_model,
      'vehicle_color', m.vehicle_color,
      'cohort', m.cohort::text,
      'growth_stage', m.growth_stage::text,
      'subscription_candidate', m.subscription_candidate,
      'last_location_id', m.last_location_id,
      'email', coalesce(c.marketing_email, m.email),
      'phone', coalesce(c.marketing_phone, m.phone),
      'tags', coalesce(to_jsonb(c.tags), '[]'::jsonb),
      'email_consent', coalesce(c.email_consent, false),
      'whatsapp_consent', coalesce(c.whatsapp_consent, false),
      'unsubscribed', (c.unsubscribed_at is not null),
      'has_contact_record', (c.id is not null)
    ) as doc
  from public.marketing_contact_metrics(p_location_ids) m
  left join public.marketing_contact c
    on c.contact_key = m.contact_key and c.deleted_at is null;
$fn$;

-- `create or replace` preserva a ACL, mas re-revogar deixa a intenção explícita: este é ajudante
-- interno, nunca exposto ao cliente logado (ver 20261027094500).
revoke all on function public.marketing_contact_doc(uuid[]) from public, anon, authenticated;

create or replace function public.marketing_segment_contacts(
  p_definition jsonb,
  p_location_ids uuid[] default null,
  p_limit integer default 200
) returns table (
  contact_key text,
  display_name text,
  email text,
  phone text,
  bookings_count integer,
  total_spent numeric,
  avg_ticket numeric,
  days_since_last integer,
  cohort text,
  growth_stage text,
  subscription_candidate boolean,
  vehicle_model text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para listar o segmento.' using errcode = '42501';
  end if;

  return query
  select
    d.contact_key,
    (d.doc ->> 'display_name'),
    (d.doc ->> 'email'),
    (d.doc ->> 'phone'),
    (d.doc ->> 'bookings_count')::int,
    (d.doc ->> 'total_spent')::numeric,
    (d.doc ->> 'avg_ticket')::numeric,
    nullif(d.doc ->> 'days_since_last', '')::int,
    (d.doc ->> 'cohort'),
    (d.doc ->> 'growth_stage'),
    (d.doc ->> 'subscription_candidate')::boolean,
    (d.doc ->> 'vehicle_model')
  from public.marketing_contact_doc(p_location_ids) d
  where public.marketing_eval_definition(d.doc, coalesce(p_definition, '{}'::jsonb))
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$fn$;

revoke all on function public.marketing_segment_contacts(jsonb, uuid[], integer) from public, anon;
