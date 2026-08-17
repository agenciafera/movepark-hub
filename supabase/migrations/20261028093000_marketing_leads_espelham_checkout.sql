-- E3.1 · O kanban de leads espelha o checkout, do início até a compra ou o abandono.
--
-- Até aqui `marketing_lead` era CRM manual: alguém criava o cartão e arrastava. Agora a reserva
-- move o cartão sozinha, porque o checkout já é a fonte da verdade do funil de consumidor e
-- manter os dois em dia na mão é trabalho que ninguém faz.
--
-- O mapa é o ciclo da reserva (booking-flow.md):
--   pending                          → "Reserva iniciada"  (o checkout começou, o hold está de pé)
--   confirmed / checked_in / completed → "Cliente"          (pagou)
--   expired / cancelled / no_show    → "Perdido"            (abandonou ou desistiu)
--
-- Três decisões que explicam o formato:
--
-- 1. **O gatilho falha aberto.** Se qualquer coisa aqui der errado, ele registra um warning e
--    deixa a reserva seguir. Bloquear um checkout pago para gravar uma linha de CRM seria trocar
--    receita por relatório. É a única razão de existir o bloco `exception` no fim.
--
-- 2. **Arrastar na mão desliga a sincronia daquele cartão** (`auto_synced`). Sem isso, o time
--    move um lead e no próximo `update` da reserva ele volta sozinho para o lugar de antes, o que
--    lê como bug e faz a pessoa parar de confiar no quadro.
--
-- 3. **A etapa é resolvida por `stage_key`, não por nome.** Renomear "Perdido" para "Não fechou"
--    na tela não pode quebrar o gatilho.
--
-- Spec: docs/specs/marketing-automation.md § Leads

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chave estável da etapa
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_pipeline_stage
  add column if not exists stage_key text;

comment on column public.marketing_pipeline_stage.stage_key is
  'Chave estável da etapa, usada pelo gatilho do checkout. O nome é editável na tela; a chave não.';

create unique index if not exists marketing_pipeline_stage_key_uniq
  on public.marketing_pipeline_stage(pipeline_id, stage_key)
  where stage_key is not null;

update public.marketing_pipeline_stage st
set stage_key = case st.name
  when 'Descoberta' then 'descoberta'
  when 'Interesse' then 'interesse'
  when 'Reserva iniciada' then 'reserva_iniciada'
  when 'Cliente' then 'cliente'
  when 'Perdido' then 'perdido'
end
from public.marketing_pipeline p
where p.id = st.pipeline_id
  and p.slug = 'consumidor'
  and st.stage_key is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O lead sabe de qual reserva veio
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_lead
  add column if not exists booking_id uuid references public.booking(id) on delete set null,
  add column if not exists auto_synced boolean not null default false;

comment on column public.marketing_lead.auto_synced is
  'true = o cartão segue o status da reserva. Arrastar na mão zera isto, senão o cartão voltaria sozinho.';

-- Uma reserva, um cartão. É o que torna o gatilho idempotente: ele roda a cada update de status.
create unique index if not exists marketing_lead_booking_uniq
  on public.marketing_lead(booking_id)
  where booking_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O gatilho
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_stage_for_booking(p_status public.booking_status)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case
    when p_status = 'pending' then 'reserva_iniciada'
    when p_status in ('confirmed', 'checked_in', 'completed') then 'cliente'
    when p_status in ('expired', 'cancelled', 'no_show') then 'perdido'
  end;
$fn$;

comment on function public.marketing_stage_for_booking(public.booking_status) is
  'Mapa status da reserva → etapa do kanban. Função à parte para o pgTAP conferir o mapa sem simular um checkout.';

-- O miolo fica numa função própria, e não dentro do gatilho, porque o backfill precisa da mesma
-- lógica. Reaproveitar aqui é o que garante que carga inicial e tempo real nunca divirjam.
create or replace function public.marketing_upsert_lead_for_booking(p_booking public.booking)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_pipeline uuid;
  v_stage uuid;
  v_stage_key text;
  v_contact uuid;
  v_key text;
begin
  v_stage_key := public.marketing_stage_for_booking(p_booking.status);
  if v_stage_key is null then return; end if;

  v_key := public.marketing_contact_key(
    p_booking.customer_email, p_booking.customer_phone, p_booking.profile_id);
  -- Reserva sem e-mail, telefone nem conta: não há a quem prender o cartão.
  if v_key is null then return; end if;

  select p.id into v_pipeline
  from public.marketing_pipeline p where p.slug = 'consumidor' limit 1;
  if v_pipeline is null then return; end if;

  select st.id into v_stage
  from public.marketing_pipeline_stage st
  where st.pipeline_id = v_pipeline and st.stage_key = v_stage_key;
  if v_stage is null then return; end if;

  -- Contato: cria na primeira vez, completa o que faltava depois. Nunca mexe em consentimento nem
  -- em descadastro, porque quem pediu para sair não volta por ter feito uma reserva.
  insert into public.marketing_contact as c
    (contact_key, profile_id, marketing_email, marketing_phone, display_name, source, last_synced_at)
  values (
    v_key,
    p_booking.profile_id,
    nullif(btrim(p_booking.customer_email), ''),
    nullif(btrim(p_booking.customer_phone), ''),
    nullif(btrim(coalesce(p_booking.customer_name,
      concat_ws(' ', p_booking.customer_first_name, p_booking.customer_last_name))), ''),
    'checkout',
    now()
  )
  on conflict (contact_key) do update set
    profile_id      = coalesce(excluded.profile_id, c.profile_id),
    marketing_email = coalesce(c.marketing_email, excluded.marketing_email),
    marketing_phone = coalesce(c.marketing_phone, excluded.marketing_phone),
    display_name    = coalesce(c.display_name, excluded.display_name),
    last_synced_at  = now()
  returning c.id into v_contact;

  insert into public.marketing_lead as l
    (pipeline_id, stage_id, contact_id, location_id, booking_id, source, auto_synced, title)
  values (
    v_pipeline, v_stage, v_contact, p_booking.location_id, p_booking.id, 'checkout', true,
    'Reserva ' || p_booking.code
  )
  on conflict (booking_id) where booking_id is not null do update set
    -- Cartão arrastado na mão para de seguir a reserva.
    stage_id = case when l.auto_synced then excluded.stage_id else l.stage_id end,
    location_id = excluded.location_id,
    updated_at = now()
  where l.deleted_at is null;
end;
$fn$;

revoke all on function public.marketing_upsert_lead_for_booking(public.booking)
  from public, anon, authenticated;

create or replace function public.marketing_sync_lead_from_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  -- Só mexe quando o status muda de verdade. Um update de `updated_at` não é evento de funil.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  perform public.marketing_upsert_lead_for_booking(new);
  return new;
exception when others then
  -- Falha ABERTA: marketing não pode derrubar checkout. Bloquear uma reserva paga para gravar
  -- uma linha de CRM seria trocar receita por relatório.
  raise warning 'marketing_sync_lead_from_booking falhou para a reserva % (%): %',
    new.id, new.status, sqlerrm;
  return new;
end;
$fn$;

revoke all on function public.marketing_sync_lead_from_booking() from public, anon, authenticated;

drop trigger if exists marketing_sync_lead on public.booking;
create trigger marketing_sync_lead
  after insert or update of status on public.booking
  for each row execute function public.marketing_sync_lead_from_booking();

-- Arrastar na mão desliga a sincronia daquele cartão.
create or replace function public.marketing_move_lead(
  p_lead_id uuid,
  p_stage_id uuid,
  p_sort_order integer default 0
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para mover o lead.' using errcode = '42501';
  end if;

  update public.marketing_lead ld
  set stage_id = p_stage_id,
      sort_order = coalesce(p_sort_order, 0),
      -- A partir daqui o cartão é do time, não da reserva.
      auto_synced = false,
      closed_at = case
        when (select st.is_won or st.is_lost from public.marketing_pipeline_stage st where st.id = p_stage_id)
        then now() else null end
  where ld.id = p_lead_id and ld.deleted_at is null;

  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;
end;
$fn$;

revoke all on function public.marketing_move_lead(uuid, uuid, integer) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A lista de leads mostra o estado do checkout
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.marketing_leads(uuid, uuid[], text);

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
  created_at timestamptz,
  booking_id uuid,
  booking_code text,
  booking_status text,
  booking_expires_at timestamptz,
  booking_total numeric,
  auto_synced boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os leads.' using errcode = '42501';
  end if;

  return query
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
    ld.created_at,
    ld.booking_id, b.code, b.status::text, b.expires_at, b.total_amount, ld.auto_synced
  from public.marketing_lead ld
  join public.marketing_pipeline_stage st on st.id = ld.stage_id
  join public.marketing_contact c on c.id = ld.contact_id
  left join public.location l on l.id = ld.location_id
  left join public.booking b on b.id = ld.booking_id
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
$fn$;

revoke all on function public.marketing_leads(uuid, uuid[], text) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tempo real
--
-- Publicação do Realtime na tabela de leads. A RLS continua valendo no canal, então só hub_admin
-- recebe os eventos. `replica identity full` é o que faz o payload do UPDATE trazer a linha antiga,
-- sem a qual o cliente não sabe de qual coluna o cartão saiu.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_lead replica identity full;

do $rt$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketing_lead'
  ) then
    alter publication supabase_realtime add table public.marketing_lead;
  end if;
end $rt$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Quantos contatos cada segmento tem
--
-- Uma chamada só para a lista inteira. Uma por linha faria a tela abrir N conexões e avaliar a
-- base N vezes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_segment_counts(
  p_location_ids uuid[] default null
) returns table (
  segment_id uuid,
  total integer,
  reachable_email integer,
  reachable_whatsapp integer
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para contar os segmentos.' using errcode = '42501';
  end if;

  return query
  with docs as materialized (
    select d.doc from public.marketing_contact_doc(p_location_ids) d
  ),
  segs as (
    select s.id, s.definition from public.marketing_segment s where s.deleted_at is null
  )
  select
    sg.id,
    count(*) filter (where public.marketing_eval_definition(dc.doc, sg.definition))::int,
    count(*) filter (
      where public.marketing_eval_definition(dc.doc, sg.definition)
        and coalesce(dc.doc ->> 'email', '') <> ''
        and (dc.doc ->> 'unsubscribed')::boolean is not true
        and (dc.doc ->> 'email_consent')::boolean is not false
    )::int,
    count(*) filter (
      where public.marketing_eval_definition(dc.doc, sg.definition)
        and coalesce(dc.doc ->> 'phone', '') <> ''
        and (dc.doc ->> 'whatsapp_consent')::boolean is true
        and (dc.doc ->> 'unsubscribed')::boolean is not true
    )::int
  from segs sg
  cross join docs dc
  group by sg.id;
end;
$fn$;

revoke all on function public.marketing_segment_counts(uuid[]) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill das reservas recentes
--
-- Sem isto o quadro nasce vazio e só ganha cartão no próximo checkout, o que faria a tela parecer
-- quebrada no dia da entrega. Recorte de 180 dias para não trazer histórico morto.
-- ─────────────────────────────────────────────────────────────────────────────

do $backfill$
declare v_reserva public.booking;
begin
  for v_reserva in
    select b.* from public.booking b
    where b.deleted_at is null
      and b.created_at >= now() - interval '180 days'
      and public.marketing_stage_for_booking(b.status) is not null
    order by b.created_at
  loop
    -- Chama o MESMO helper do gatilho. Um `update` no-op de status não serviria: o gatilho sai
    -- cedo justamente quando o status não muda, e o backfill não gravaria nada.
    perform public.marketing_upsert_lead_for_booking(v_reserva);
  end loop;
end $backfill$;
