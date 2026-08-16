-- E3.1 · Automação de marketing no Manager (matriz de perfis, funil, leads, segmentos, campanhas).
--
-- Spec: docs/specs/marketing-automation.md
--
-- Três decisões que explicam o formato do schema:
--
-- 1. O contato de marketing NÃO é identidade (ADR-006). `auth.users` continua sendo a fonte única
--    da credencial, e o contato operacional do pedido continua no snapshot da `booking`. O que
--    nasce aqui é a espinha de CRM: consentimento, estágio no funil, dono, tags. As colunas de
--    endereço se chamam `marketing_email`/`marketing_phone` de propósito, para ninguém confundir
--    com credencial: elas existem porque um disparador precisa de um endereço para entregar, e
--    escrever nelas nunca promove o identificador a login. Promover continua exigindo OTP.
--
-- 2. Comportamento é derivado, nunca gravado. Coorte, ticket médio, recorrência e sazonalidade
--    saem de `booking` em tempo de consulta (views + funções). Materializar isso criaria uma
--    segunda verdade que envelhece em silêncio: o dia em que a reserva é cancelada, o rótulo
--    "cliente recorrente" continuaria lá.
--
-- 3. Segmento é dado, não código. A definição é uma árvore jsonb avaliada por
--    `marketing_eval_definition`, sem SQL dinâmico. Um segmento é escrito pelo time de growth na
--    tela, então a avaliação não pode virar concatenação de string com valor vindo da UI.
--
-- Disparo real (e-mail + WhatsApp) nasce TRAVADO: `marketing_dispatch_enabled` = false. O motor
-- roda inteiro, resolve o público, monta a mensagem e grava em `marketing_message` com status
-- `skipped` até alguém ligar a chave de propósito. Ferramenta de disparo em massa que nasce ligada
-- manda e-mail para cliente real no primeiro teste.

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────

create type public.marketing_cohort as enum (
  'lead',            -- ainda não comprou
  'primeira_compra', -- exatamente uma compra
  'recorrente',      -- duas ou mais, cadência saudável
  'campeao',         -- alta frequência e recente
  'sazonal_ferias',  -- concentra viagem em janeiro, julho e dezembro
  'em_risco',        -- recorrente que passou do dobro da própria cadência
  'inativo'          -- sem compra há mais de um ano
);

create type public.marketing_growth_stage as enum (
  'aquisicao',   -- entrou, não comprou
  'ativacao',    -- primeira compra
  'retencao',    -- comprando de novo
  'reativacao'   -- comprou e sumiu
);

create type public.marketing_channel as enum ('email', 'whatsapp');

create type public.marketing_campaign_status as enum (
  'draft', 'scheduled', 'running', 'paused', 'done', 'archived'
);

create type public.marketing_enrollment_status as enum (
  'active', 'waiting', 'completed', 'exited', 'failed'
);

create type public.marketing_message_status as enum (
  'queued',     -- montada, aguardando disparo
  'sent',       -- entregue ao provedor
  'failed',     -- provedor recusou
  'skipped',    -- chave de disparo desligada, ou teto do dia
  'suppressed'  -- descadastro, falta de consentimento ou lista de supressão
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contato de marketing (a espinha do CRM)
--
-- `contact_key` é o identificador normalizado e determinístico: e-mail em minúsculo quando existe,
-- senão telefone só com dígitos, senão o uuid do profile. É por ele que a reserva anônima e a
-- reserva logada da mesma pessoa colapsam em um contato só.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.marketing_contact (
  id uuid primary key default gen_random_uuid(),
  contact_key text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,

  -- Endereço de entrega de marketing. NÃO é credencial (ADR-006): escrever aqui não cria login.
  marketing_email text,
  marketing_phone text,
  display_name text,

  source text not null default 'booking',
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,

  -- Consentimento por canal. E-mail transacional-adjacente de quem já comprou nasce permitido;
  -- WhatsApp nasce NEGADO porque a Meta exige opt-in ativo e template aprovado.
  email_consent boolean not null default true,
  whatsapp_consent boolean not null default false,
  consent_source text,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),

  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint marketing_contact_has_address check (
    marketing_email is not null or marketing_phone is not null or profile_id is not null
  )
);

create unique index marketing_contact_unsubscribe_token_key
  on public.marketing_contact(unsubscribe_token);
create index marketing_contact_profile_idx on public.marketing_contact(profile_id)
  where profile_id is not null;
create index marketing_contact_email_idx on public.marketing_contact(lower(marketing_email))
  where marketing_email is not null;
create index marketing_contact_tags_idx on public.marketing_contact using gin(tags);

comment on table public.marketing_contact is
  'Espinha de CRM do marketing. Não é identidade (ADR-006): marketing_email/marketing_phone são endereço de entrega, nunca credencial.';
comment on column public.marketing_contact.contact_key is
  'Identificador normalizado e determinístico (e-mail, senão telefone só-dígitos, senão uid:<profile_id>).';
comment on column public.marketing_contact.whatsapp_consent is
  'Nasce false: a Meta exige opt-in ativo para mensagem iniciada pela marca.';

create trigger set_updated_at before update on public.marketing_contact
  for each row execute function public.set_updated_at();

-- Lista de supressão: vale mesmo sem contato cadastrado (bounce, reclamação, pedido manual).
create table public.marketing_suppression (
  id uuid primary key default gen_random_uuid(),
  contact_key text not null,
  channel public.marketing_channel not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (contact_key, channel)
);

comment on table public.marketing_suppression is
  'Bloqueio duro por canal. Checada no disparo antes do consentimento: bounce e reclamação não voltam atrás.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Pipeline de leads (kanban)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.marketing_pipeline (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_default boolean not null default false,
  -- Colunas escolhidas na visão de lista. Preferência de exibição, não regra de negócio.
  column_prefs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.marketing_pipeline
  for each row execute function public.set_updated_at();

create table public.marketing_pipeline_stage (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.marketing_pipeline(id) on delete cascade,
  name text not null,
  color text not null default 'neutral',
  sort_order integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_stage_not_won_and_lost check (not (is_won and is_lost))
);

create index marketing_pipeline_stage_pipeline_idx
  on public.marketing_pipeline_stage(pipeline_id, sort_order);

create trigger set_updated_at before update on public.marketing_pipeline_stage
  for each row execute function public.set_updated_at();

create table public.marketing_lead (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.marketing_pipeline(id) on delete cascade,
  stage_id uuid not null references public.marketing_pipeline_stage(id) on delete restrict,
  contact_id uuid not null references public.marketing_contact(id) on delete cascade,
  -- O estacionamento de interesse. É o que faz o kanban responder ao filtro de unidade do painel.
  location_id uuid references public.location(id) on delete set null,
  title text,
  value_cents integer not null default 0,
  owner_id uuid references public.profiles(id) on delete set null,
  source text not null default 'manual',
  custom jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index marketing_lead_stage_idx on public.marketing_lead(stage_id, sort_order)
  where deleted_at is null;
create index marketing_lead_location_idx on public.marketing_lead(location_id)
  where deleted_at is null;
create index marketing_lead_contact_idx on public.marketing_lead(contact_id);

create trigger set_updated_at before update on public.marketing_lead
  for each row execute function public.set_updated_at();

create table public.marketing_lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_lead(id) on delete cascade,
  kind text not null default 'note',
  body text,
  meta jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index marketing_lead_activity_lead_idx
  on public.marketing_lead_activity(lead_id, created_at desc);

-- Toda troca de coluna vira linha na timeline. Sem isso o kanban conta o presente e esquece o
-- caminho, que é justamente o que o funil precisa medir.
create or replace function public.marketing_lead_log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
    insert into public.marketing_lead_activity (lead_id, kind, body, meta, actor_id)
    values (
      new.id, 'stage_change', null,
      jsonb_build_object('from', old.stage_id, 'to', new.stage_id),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.marketing_lead_log_stage_change() from public, anon, authenticated;

create trigger marketing_lead_stage_change
  before update on public.marketing_lead
  for each row execute function public.marketing_lead_log_stage_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Segmentos e campanhas
-- ─────────────────────────────────────────────────────────────────────────────

create table public.marketing_segment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  -- {"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2}, {...grupo aninhado}]}
  definition jsonb not null default '{"match":"all","rules":[]}'::jsonb,
  location_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at before update on public.marketing_segment
  for each row execute function public.set_updated_at();

comment on column public.marketing_segment.definition is
  'Árvore de filtros avaliada por marketing_eval_definition. Dado, não SQL: nunca concatenar em query.';

create table public.marketing_campaign (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.marketing_campaign_status not null default 'draft',
  segment_id uuid references public.marketing_segment(id) on delete set null,
  location_ids uuid[] not null default '{}',
  -- {"nodes":[{id,type,x,y,data}],"edges":[{from,to,branch}]}: o canvas drag-and-drop.
  canvas jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  -- Teto por execução. Freio de mão: campanha nova não manda para a base inteira por engano.
  send_cap integer not null default 100,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint marketing_campaign_send_cap_positive check (send_cap > 0 and send_cap <= 10000)
);

create trigger set_updated_at before update on public.marketing_campaign
  for each row execute function public.set_updated_at();

create table public.marketing_enrollment (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaign(id) on delete cascade,
  contact_id uuid not null references public.marketing_contact(id) on delete cascade,
  status public.marketing_enrollment_status not null default 'active',
  current_node_id text,
  wait_until timestamptz,
  entered_at timestamptz not null default now(),
  completed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  unique (campaign_id, contact_id)
);

create index marketing_enrollment_due_idx
  on public.marketing_enrollment(campaign_id, status, wait_until);

comment on table public.marketing_enrollment is
  'Uma matrícula por contato por campanha (unique). É o que impede a mesma pessoa de reentrar no fluxo e receber tudo de novo.';

create table public.marketing_message (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaign(id) on delete cascade,
  enrollment_id uuid references public.marketing_enrollment(id) on delete cascade,
  contact_id uuid not null references public.marketing_contact(id) on delete cascade,
  node_id text,
  channel public.marketing_channel not null,
  status public.marketing_message_status not null default 'queued',
  to_address text,
  subject text,
  body text,
  template_name text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index marketing_message_campaign_idx
  on public.marketing_message(campaign_id, created_at desc);
create index marketing_message_sent_idx
  on public.marketing_message(channel, sent_at)
  where status = 'sent';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: tudo é do hub_admin. Nenhuma dessas tabelas é lida pelo consumidor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_contact          enable row level security;
alter table public.marketing_suppression      enable row level security;
alter table public.marketing_pipeline         enable row level security;
alter table public.marketing_pipeline_stage   enable row level security;
alter table public.marketing_lead             enable row level security;
alter table public.marketing_lead_activity    enable row level security;
alter table public.marketing_segment          enable row level security;
alter table public.marketing_campaign         enable row level security;
alter table public.marketing_enrollment       enable row level security;
alter table public.marketing_message          enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_contact', 'marketing_suppression', 'marketing_pipeline',
    'marketing_pipeline_stage', 'marketing_lead', 'marketing_lead_activity',
    'marketing_segment', 'marketing_campaign', 'marketing_enrollment', 'marketing_message'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin())',
      t || '_hub_admin', t
    );
    -- anon não tem nada aqui: base de marketing não é dado público.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fato de reserva: a base de todo o comportamento
--
-- Uma linha por reserva viva, já com a chave de contato normalizada e o veículo anexado. Todo o
-- resto (métricas, coorte, funil, segmento) lê daqui, então a regra de "quem é essa pessoa" e
-- "o que conta como compra" mora em um lugar só.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_contact_key(
  p_email text, p_phone text, p_profile_id uuid
) returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    lower(nullif(btrim(p_email), '')),
    nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''),
    case when p_profile_id is not null then 'uid:' || p_profile_id::text end
  );
$$;

comment on function public.marketing_contact_key(text, text, uuid) is
  'Chave determinística do contato: e-mail, senão telefone só-dígitos, senão uid:<profile>. É o que funde reserva anônima e logada da mesma pessoa.';

create or replace view public.marketing_booking_fact as
select
  b.id as booking_id,
  public.marketing_contact_key(b.customer_email, b.customer_phone, b.profile_id) as contact_key,
  b.profile_id,
  b.location_id,
  l.company_id,
  b.status,
  -- O que conta como compra. `pending` é carrinho, `expired`/`cancelled` não viraram receita.
  (b.status in ('confirmed', 'checked_in', 'completed')) as is_purchase,
  b.created_at,
  b.check_in_at,
  b.check_out_at,
  b.total_amount,
  b.fare_tier,
  b.utm_source,
  b.utm_medium,
  b.utm_campaign,
  b.origin,
  nullif(btrim(coalesce(b.customer_name, concat_ws(' ', b.customer_first_name, b.customer_last_name))), '') as customer_name,
  nullif(btrim(b.customer_email), '') as customer_email,
  nullif(btrim(b.customer_phone), '') as customer_phone,
  v.model as vehicle_model,
  v.color as vehicle_color,
  -- Janela de férias no Brasil: janeiro, julho e dezembro. Documentado na spec porque é escolha,
  -- não fato: carnaval anda no calendário e não entra nesse recorte.
  (extract(month from b.check_in_at)::int in (1, 7, 12)) as is_vacation_window
from public.booking b
join public.location l on l.id = b.location_id
left join public.vehicle v on v.id = b.vehicle_id
where b.deleted_at is null;

revoke all on public.marketing_booking_fact from anon, authenticated;

comment on view public.marketing_booking_fact is
  'Uma linha por reserva viva com a chave de contato já normalizada. Base única de comportamento do marketing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Métricas por contato, recorte opcional por unidade
--
-- Função e não view porque o painel filtra por estacionamento, e o filtro precisa entrar ANTES da
-- agregação: "ticket médio no Confins" não é "ticket médio geral filtrado depois".
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_contact_metrics(
  p_location_ids uuid[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (
  contact_key text,
  profile_id uuid,
  display_name text,
  email text,
  phone text,
  bookings_count integer,
  cancelled_count integer,
  first_booking_at timestamptz,
  last_booking_at timestamptz,
  days_since_last integer,
  days_since_first integer,
  total_spent numeric,
  avg_ticket numeric,
  distinct_locations integer,
  vacation_bookings integer,
  vacation_share numeric,
  avg_gap_days numeric,
  vehicle_model text,
  vehicle_color text,
  last_location_id uuid,
  cohort public.marketing_cohort,
  growth_stage public.marketing_growth_stage,
  subscription_candidate boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with scoped as (
    select f.*
    from public.marketing_booking_fact f
    where f.contact_key is not null
      and (p_location_ids is null or f.location_id = any(p_location_ids))
      and (p_from is null or f.created_at >= p_from)
      and (p_to is null or f.created_at < p_to)
  ),
  agg as (
    select
      s.contact_key,
      max(s.profile_id::text)::uuid as profile_id,
      (array_agg(s.customer_name order by s.created_at desc) filter (where s.customer_name is not null))[1] as display_name,
      (array_agg(s.customer_email order by s.created_at desc) filter (where s.customer_email is not null))[1] as email,
      (array_agg(s.customer_phone order by s.created_at desc) filter (where s.customer_phone is not null))[1] as phone,
      count(*) filter (where s.is_purchase)::int as bookings_count,
      count(*) filter (where s.status in ('cancelled', 'no_show'))::int as cancelled_count,
      min(s.created_at) filter (where s.is_purchase) as first_booking_at,
      max(s.created_at) filter (where s.is_purchase) as last_booking_at,
      coalesce(sum(s.total_amount) filter (where s.is_purchase), 0) as total_spent,
      count(distinct s.location_id) filter (where s.is_purchase)::int as distinct_locations,
      count(*) filter (where s.is_purchase and s.is_vacation_window)::int as vacation_bookings,
      (array_agg(s.vehicle_model order by s.created_at desc) filter (where s.vehicle_model is not null))[1] as vehicle_model,
      (array_agg(s.vehicle_color order by s.created_at desc) filter (where s.vehicle_color is not null))[1] as vehicle_color,
      (array_agg(s.location_id order by s.created_at desc))[1] as last_location_id
    from scoped s
    group by s.contact_key
  ),
  derived as (
    select
      a.*,
      case when a.bookings_count > 0
        then round(a.total_spent / a.bookings_count, 2) else 0 end as avg_ticket,
      -- epoch/86400, e não `extract(day from ...)`: em intervalo, `day` devolve só a parcela de
      -- dias ("1 mon 3 days" daria 3), o que faria todo cliente antigo parecer recente.
      case when a.last_booking_at is not null
        then (extract(epoch from now() - a.last_booking_at) / 86400)::int end as days_since_last,
      case when a.first_booking_at is not null
        then (extract(epoch from now() - a.first_booking_at) / 86400)::int end as days_since_first,
      case when a.bookings_count > 0
        then round(a.vacation_bookings::numeric / a.bookings_count, 4) else 0 end as vacation_share,
      -- Cadência própria da pessoa: quantos dias, em média, ela leva entre uma viagem e outra.
      case when a.bookings_count >= 2
        then round((extract(epoch from a.last_booking_at - a.first_booking_at) / 86400)::numeric
                   / nullif(a.bookings_count - 1, 0), 1) end as avg_gap_days
    from agg a
  )
  select
    d.contact_key,
    d.profile_id,
    d.display_name,
    d.email,
    d.phone,
    d.bookings_count,
    d.cancelled_count,
    d.first_booking_at,
    d.last_booking_at,
    d.days_since_last,
    d.days_since_first,
    d.total_spent,
    d.avg_ticket,
    d.distinct_locations,
    d.vacation_bookings,
    d.vacation_share,
    d.avg_gap_days,
    d.vehicle_model,
    d.vehicle_color,
    d.last_location_id,
    -- A ordem dos ramos é a regra. "Inativo" vence "recorrente" porque quem sumiu há mais de um
    -- ano não é público de retenção; "em risco" vence "recorrente" porque é o único acionável.
    (case
      when d.bookings_count = 0 then 'lead'
      when d.days_since_last > 365 then 'inativo'
      when d.bookings_count >= 4 and d.days_since_last <= 180 then 'campeao'
      when d.bookings_count >= 2 and d.vacation_share >= 0.7 then 'sazonal_ferias'
      when d.bookings_count >= 2 and d.avg_gap_days is not null
           and d.avg_gap_days > 0 and d.days_since_last > d.avg_gap_days * 2 then 'em_risco'
      when d.bookings_count >= 2 then 'recorrente'
      else 'primeira_compra'
    end)::public.marketing_cohort as cohort,
    (case
      when d.bookings_count = 0 then 'aquisicao'
      when d.days_since_last > 365 then 'reativacao'
      when d.bookings_count = 1 then 'ativacao'
      else 'retencao'
    end)::public.marketing_growth_stage as growth_stage,
    -- Candidato a assinante: já mostrou cadência de mensalista. Ou volta muito, ou volta rápido.
    (d.bookings_count >= 3 and coalesce(d.days_since_last, 9999) <= 365)
      or (d.avg_gap_days is not null and d.avg_gap_days <= 45 and d.bookings_count >= 2)
      as subscription_candidate
  from derived d;
$$;

revoke all on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz)
  from public, anon;

comment on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz) is
  'Métricas comportamentais por contato, com recorte por unidade aplicado antes da agregação. Coorte e estágio AARRR são derivados, nunca gravados.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Avaliador de segmento: jsonb, sem SQL dinâmico
--
-- O contato vira um documento jsonb e cada regra é avaliada contra esse documento. Assim o valor
-- digitado na tela nunca toca a montagem da query.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_eval_rule(p_doc jsonb, p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_field text := p_rule ->> 'field';
  v_op    text := coalesce(p_rule ->> 'op', 'eq');
  v_val   jsonb := p_rule -> 'value';
  v_actual jsonb;
  v_num numeric;
  v_target numeric;
  v_text text;
begin
  if v_field is null then return true; end if;
  v_actual := p_doc -> v_field;

  -- Campo ausente só casa com os operadores de vazio.
  if v_actual is null or jsonb_typeof(v_actual) = 'null' then
    return v_op in ('is_empty', 'is_false');
  end if;

  case v_op
    when 'is_empty' then return false;
    when 'is_present' then return true;
    when 'is_true' then return v_actual = 'true'::jsonb;
    when 'is_false' then return v_actual = 'false'::jsonb;
    else null;
  end case;

  -- Comparação numérica quando os dois lados são número.
  if jsonb_typeof(v_actual) = 'number' and v_val is not null and jsonb_typeof(v_val) = 'number' then
    v_num := (v_actual #>> '{}')::numeric;
    v_target := (v_val #>> '{}')::numeric;
    return case v_op
      when 'eq'  then v_num =  v_target
      when 'neq' then v_num <> v_target
      when 'gt'  then v_num >  v_target
      when 'gte' then v_num >= v_target
      when 'lt'  then v_num <  v_target
      when 'lte' then v_num <= v_target
      else false
    end;
  end if;

  if v_op = 'between' and jsonb_typeof(v_actual) = 'number'
     and v_val is not null and jsonb_typeof(v_val) = 'array' then
    v_num := (v_actual #>> '{}')::numeric;
    return v_num >= (v_val -> 0 #>> '{}')::numeric
       and v_num <= (v_val -> 1 #>> '{}')::numeric;
  end if;

  -- Texto e listas.
  v_text := lower(coalesce(v_actual #>> '{}', ''));

  if v_op = 'in' and v_val is not null and jsonb_typeof(v_val) = 'array' then
    return exists (
      select 1 from jsonb_array_elements_text(v_val) e where lower(e) = v_text
    );
  end if;

  if v_op = 'not_in' and v_val is not null and jsonb_typeof(v_val) = 'array' then
    return not exists (
      select 1 from jsonb_array_elements_text(v_val) e where lower(e) = v_text
    );
  end if;

  -- `contains` sobre array (tags) testa pertinência; sobre texto, substring.
  if v_op = 'contains' then
    if jsonb_typeof(v_actual) = 'array' then
      return exists (
        select 1 from jsonb_array_elements_text(v_actual) e
        where lower(e) = lower(coalesce(v_val #>> '{}', ''))
      );
    end if;
    return v_text like '%' || lower(coalesce(v_val #>> '{}', '')) || '%';
  end if;

  return case v_op
    when 'eq'  then v_text =  lower(coalesce(v_val #>> '{}', ''))
    when 'neq' then v_text <> lower(coalesce(v_val #>> '{}', ''))
    else false
  end;
end;
$$;

create or replace function public.marketing_eval_definition(p_doc jsonb, p_def jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_match text := lower(coalesce(p_def ->> 'match', 'all'));
  v_rules jsonb := coalesce(p_def -> 'rules', '[]'::jsonb);
  v_rule jsonb;
  v_result boolean;
  v_any boolean := false;
begin
  -- Segmento sem regra é a base inteira. É intencional e a tela avisa antes de salvar.
  if jsonb_array_length(v_rules) = 0 then return true; end if;

  for v_rule in select * from jsonb_array_elements(v_rules) loop
    -- Grupo aninhado: recursão. É o que permite "(A e B) ou C" na tela.
    if v_rule ? 'rules' then
      v_result := public.marketing_eval_definition(p_doc, v_rule);
    else
      v_result := public.marketing_eval_rule(p_doc, v_rule);
    end if;

    if v_match = 'any' then
      v_any := v_any or coalesce(v_result, false);
    elsif not coalesce(v_result, false) then
      return false;
    end if;
  end loop;

  return case when v_match = 'any' then v_any else true end;
end;
$$;

revoke all on function public.marketing_eval_rule(jsonb, jsonb) from public, anon;
revoke all on function public.marketing_eval_definition(jsonb, jsonb) from public, anon;

-- Documento do contato: o que o avaliador enxerga. Um campo novo aqui vira filtro novo na tela
-- sem tocar no avaliador.
create or replace function public.marketing_contact_doc(
  p_location_ids uuid[] default null
) returns table (contact_key text, doc jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    m.contact_key,
    jsonb_build_object(
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
      'email', m.email,
      'phone', m.phone,
      'tags', coalesce(to_jsonb(c.tags), '[]'::jsonb),
      'email_consent', coalesce(c.email_consent, false),
      'whatsapp_consent', coalesce(c.whatsapp_consent, false),
      'unsubscribed', (c.unsubscribed_at is not null),
      'has_contact_record', (c.id is not null)
    ) as doc
  from public.marketing_contact_metrics(p_location_ids) m
  left join public.marketing_contact c
    on c.contact_key = m.contact_key and c.deleted_at is null;
$$;

revoke all on function public.marketing_contact_doc(uuid[]) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPCs do painel
-- ─────────────────────────────────────────────────────────────────────────────

-- 9.1 Matriz de perfis: quantos contatos, quanto vale e como se comporta cada coorte.
create or replace function public.marketing_profile_matrix(
  p_location_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a matriz de perfis.' using errcode = '42501';
  end if;

  with m as (
    select * from public.marketing_contact_metrics(p_location_ids)
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'contacts', count(*),
        'customers', count(*) filter (where bookings_count > 0),
        'bookings', coalesce(sum(bookings_count), 0),
        'revenue', coalesce(sum(total_spent), 0),
        'avg_ticket', case when coalesce(sum(bookings_count), 0) > 0
          then round(sum(total_spent) / sum(bookings_count), 2) else 0 end,
        'subscription_candidates', count(*) filter (where subscription_candidate)
      ) from m
    ),
    'by_cohort', coalesce((
      select jsonb_agg(x order by x.ord)
      from (
        select
          cohort::text as cohort,
          count(*)::int as contacts,
          coalesce(sum(bookings_count), 0)::int as bookings,
          coalesce(sum(total_spent), 0) as revenue,
          case when coalesce(sum(bookings_count), 0) > 0
            then round(sum(total_spent) / sum(bookings_count), 2) else 0 end as avg_ticket,
          round(avg(days_since_last), 0) as avg_days_since_last,
          count(*) filter (where subscription_candidate)::int as subscription_candidates,
          array_position(enum_range(null::public.marketing_cohort)::text[], cohort::text) as ord
        from m group by cohort
      ) x
    ), '[]'::jsonb),
    'by_growth_stage', coalesce((
      select jsonb_agg(x order by x.ord)
      from (
        select
          growth_stage::text as stage,
          count(*)::int as contacts,
          coalesce(sum(total_spent), 0) as revenue,
          array_position(enum_range(null::public.marketing_growth_stage)::text[], growth_stage::text) as ord
        from m group by growth_stage
      ) x
    ), '[]'::jsonb),
    'by_location', coalesce((
      select jsonb_agg(x order by x.revenue desc)
      from (
        select
          l.id as location_id,
          l.name as location_name,
          count(*)::int as contacts,
          coalesce(sum(m2.total_spent), 0) as revenue,
          count(*) filter (where m2.bookings_count >= 2)::int as recurring,
          count(*) filter (where m2.subscription_candidate)::int as subscription_candidates
        from m m2
        join public.location l on l.id = m2.last_location_id
        group by l.id, l.name
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.marketing_profile_matrix(uuid[]) from public, anon;

-- 9.2 Funil de conversão. Os degraus são os que os dados sustentam de verdade: reserva criada,
-- confirmada (pagou), check-in feito, estadia concluída. Não inventamos "visitas" porque não há
-- evento de sessão gravado; o clique de saída externa vai à parte, como número próprio.
create or replace function public.marketing_conversion_funnel(
  p_from timestamptz,
  p_to timestamptz,
  p_location_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o funil.' using errcode = '42501';
  end if;

  with f as (
    select * from public.marketing_booking_fact
    where created_at >= p_from and created_at < p_to
      and (p_location_ids is null or location_id = any(p_location_ids))
  ),
  steps as (
    select
      count(*)::int as criadas,
      count(*) filter (where status in ('confirmed', 'checked_in', 'completed'))::int as confirmadas,
      count(*) filter (where status in ('checked_in', 'completed'))::int as check_in,
      count(*) filter (where status = 'completed')::int as concluidas,
      count(*) filter (where status = 'expired')::int as expiradas,
      count(*) filter (where status = 'cancelled')::int as canceladas,
      count(*) filter (where status = 'no_show')::int as no_show,
      coalesce(sum(total_amount) filter (where status in ('confirmed', 'checked_in', 'completed')), 0) as receita
    from f
  )
  select jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'criadas',     'label', 'Reservas criadas',  'count', s.criadas),
      jsonb_build_object('key', 'confirmadas', 'label', 'Pagas',             'count', s.confirmadas),
      jsonb_build_object('key', 'check_in',    'label', 'Check-in feito',    'count', s.check_in),
      jsonb_build_object('key', 'concluidas',  'label', 'Estadia concluída', 'count', s.concluidas)
    ),
    'losses', jsonb_build_object(
      'expiradas', s.expiradas, 'canceladas', s.canceladas, 'no_show', s.no_show
    ),
    'revenue', s.receita,
    'exit_clicks', coalesce((
      select count(*)::int from public.external_exit_click e
      where e.created_at >= p_from and e.created_at < p_to
        and (p_location_ids is null or e.location_id = any(p_location_ids))
    ), 0),
    -- Cliente novo x recorrente DENTRO do período. O ranking corre sobre o histórico inteiro e só
    -- depois recorta a janela: quem comprou pela primeira vez em 2024 e voltou agora conta como
    -- recorrente, não como novo. Ranquear já filtrado pelo período diria o contrário.
    'new_vs_returning', (
      select jsonb_build_object(
        'new', count(*) filter (where r.rn = 1),
        'returning', count(*) filter (where r.rn > 1)
      )
      from (
        select
          f2.created_at,
          row_number() over (partition by f2.contact_key order by f2.created_at) as rn
        from public.marketing_booking_fact f2
        where f2.is_purchase and f2.contact_key is not null
          and (p_location_ids is null or f2.location_id = any(p_location_ids))
      ) r
      where r.created_at >= p_from and r.created_at < p_to
    )
  ) into v_result
  from steps s;

  return v_result;
end;
$$;

revoke all on function public.marketing_conversion_funnel(timestamptz, timestamptz, uuid[])
  from public, anon;

-- 9.3 Prévia de segmento: quantos casam e uma amostra, antes de salvar.
create or replace function public.marketing_segment_preview(
  p_definition jsonb,
  p_location_ids uuid[] default null,
  p_limit integer default 25
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a prévia de segmento.' using errcode = '42501';
  end if;

  with matched as (
    select d.contact_key, d.doc
    from public.marketing_contact_doc(p_location_ids) d
    where public.marketing_eval_definition(d.doc, coalesce(p_definition, '{}'::jsonb))
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'reachable_email', (
      select count(*) from matched
      where (doc ->> 'email') is not null
        and (doc ->> 'email') <> ''
        and (doc ->> 'unsubscribed')::boolean is not true
        and (doc ->> 'email_consent')::boolean is not false
    ),
    'reachable_whatsapp', (
      select count(*) from matched
      where (doc ->> 'phone') is not null
        and (doc ->> 'phone') <> ''
        and (doc ->> 'whatsapp_consent')::boolean is true
        and (doc ->> 'unsubscribed')::boolean is not true
    ),
    'sample', coalesce((
      select jsonb_agg(jsonb_build_object('contact_key', contact_key, 'doc', doc))
      from (select * from matched limit greatest(1, least(coalesce(p_limit, 25), 200))) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.marketing_segment_preview(jsonb, uuid[], integer) from public, anon;

-- 9.4 Sincronização de contatos a partir das reservas.
--
-- Upsert por `contact_key`. Não sobrescreve consentimento nem descadastro: quem pediu para sair
-- não volta para a base porque fez uma reserva nova.
create or replace function public.marketing_sync_contacts()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para sincronizar contatos.' using errcode = '42501';
  end if;

  with src as (
    select contact_key, profile_id, display_name, email, phone
    from public.marketing_contact_metrics()
    where contact_key is not null
  ),
  ups as (
    insert into public.marketing_contact as c
      (contact_key, profile_id, marketing_email, marketing_phone, display_name, source, last_synced_at)
    select s.contact_key, s.profile_id, s.email, s.phone, s.display_name, 'booking', now()
    from src s
    on conflict (contact_key) do update set
      profile_id      = coalesce(excluded.profile_id, c.profile_id),
      marketing_email = coalesce(excluded.marketing_email, c.marketing_email),
      marketing_phone = coalesce(excluded.marketing_phone, c.marketing_phone),
      display_name    = coalesce(excluded.display_name, c.display_name),
      last_synced_at  = now()
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where was_insert)::int,
    count(*) filter (where not was_insert)::int
  into v_inserted, v_updated
  from ups;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

revoke all on function public.marketing_sync_contacts() from public, anon;

-- 9.5 Kanban: leads de um pipeline, já com contato e métricas de comportamento.
create or replace function public.marketing_leads(
  p_pipeline_id uuid default null,
  p_location_ids uuid[] default null,
  p_search text default null
) returns table (
  id uuid,
  pipeline_id uuid,
  stage_id uuid,
  stage_name text,
  contact_id uuid,
  contact_key text,
  display_name text,
  email text,
  phone text,
  location_id uuid,
  location_name text,
  title text,
  value_cents integer,
  owner_id uuid,
  source text,
  tags text[],
  custom jsonb,
  sort_order integer,
  stage_changed_at timestamptz,
  bookings_count integer,
  total_spent numeric,
  avg_ticket numeric,
  days_since_last integer,
  cohort text,
  growth_stage text,
  subscription_candidate boolean,
  vehicle_model text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os leads.' using errcode = '42501';
  end if;

  return query
  -- As métricas são calculadas UMA vez e depois casadas por chave. Num lateral por linha, a
  -- função de métricas reprocessaria a base de reservas inteira a cada lead da tela.
  with metrics as materialized (
    select * from public.marketing_contact_metrics(p_location_ids)
  )
  select
    ld.id, ld.pipeline_id, ld.stage_id, st.name,
    c.id, c.contact_key, c.display_name, c.marketing_email, c.marketing_phone,
    ld.location_id, l.name,
    ld.title, ld.value_cents, ld.owner_id, ld.source, c.tags, ld.custom, ld.sort_order,
    ld.stage_changed_at,
    coalesce(m.bookings_count, 0), coalesce(m.total_spent, 0), coalesce(m.avg_ticket, 0),
    m.days_since_last, m.cohort::text, m.growth_stage::text,
    coalesce(m.subscription_candidate, false), m.vehicle_model,
    ld.created_at
  from public.marketing_lead ld
  join public.marketing_pipeline_stage st on st.id = ld.stage_id
  join public.marketing_contact c on c.id = ld.contact_id
  left join public.location l on l.id = ld.location_id
  left join metrics m on m.contact_key = c.contact_key
  where ld.deleted_at is null
    and (p_pipeline_id is null or ld.pipeline_id = p_pipeline_id)
    and (p_location_ids is null or ld.location_id = any(p_location_ids))
    and (
      p_search is null or btrim(p_search) = ''
      or c.display_name ilike '%' || p_search || '%'
      or c.marketing_email ilike '%' || p_search || '%'
      or c.marketing_phone ilike '%' || p_search || '%'
      or ld.title ilike '%' || p_search || '%'
    )
  order by st.sort_order, ld.sort_order, ld.created_at desc;
end;
$$;

revoke all on function public.marketing_leads(uuid, uuid[], text) from public, anon;

-- 9.6 Mover lead de coluna. RPC e não update direto para que a ordenação dentro da coluna e o
-- registro na timeline aconteçam na mesma transação.
create or replace function public.marketing_move_lead(
  p_lead_id uuid,
  p_stage_id uuid,
  p_sort_order integer default 0
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para mover o lead.' using errcode = '42501';
  end if;

  update public.marketing_lead ld
  set stage_id = p_stage_id,
      sort_order = coalesce(p_sort_order, 0),
      closed_at = case
        when (select st.is_won or st.is_lost from public.marketing_pipeline_stage st where st.id = p_stage_id)
        then now() else null end
  where ld.id = p_lead_id and ld.deleted_at is null;

  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.marketing_move_lead(uuid, uuid, integer) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Configuração: a chave de disparo nasce desligada
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.app_setting (key, value) values
  ('marketing_dispatch_enabled', 'false'),
  ('marketing_daily_send_cap', '200'),
  ('marketing_test_recipient', ''),
  ('marketing_email_from', '')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Seed do pipeline padrão de consumidor (AARRR)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare v_pipeline uuid;
begin
  insert into public.marketing_pipeline (name, slug, is_default, column_prefs)
  values (
    'Consumidor', 'consumidor', true,
    '["display_name","email","location_name","cohort","bookings_count","total_spent","days_since_last","owner_id"]'::jsonb
  )
  on conflict (slug) do nothing
  returning id into v_pipeline;

  if v_pipeline is null then
    select id into v_pipeline from public.marketing_pipeline where slug = 'consumidor';
  end if;

  -- Guarda de reexecução: as colunas não têm chave natural, então `on conflict` não protegeria.
  -- Sem isso, rodar a migration duas vezes deixaria o kanban com dez colunas repetidas.
  if not exists (select 1 from public.marketing_pipeline_stage where pipeline_id = v_pipeline) then
    insert into public.marketing_pipeline_stage (pipeline_id, name, color, sort_order, is_won, is_lost)
    values
      (v_pipeline, 'Descoberta',       'neutral', 1, false, false),
      (v_pipeline, 'Interesse',        'cyan',    2, false, false),
      (v_pipeline, 'Reserva iniciada', 'violet',  3, false, false),
      (v_pipeline, 'Cliente',          'green',   4, true,  false),
      (v_pipeline, 'Perdido',          'red',     5, false, true);
  end if;
end $$;
