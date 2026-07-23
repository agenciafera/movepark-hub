-- E3.3 / base de conhecimento — F2: fila de frescor + triggers + backfill.
-- Ver docs/specs/knowledge-base.md.
--
-- A unidade de trabalho e a FONTE (uma linha de faq, ou uma coluna de prosa de location), nao o
-- chunk: prosa longa muda o numero de chunks, entao o worker faz delete+reinsert do conjunto daquela
-- fonte. Por isso a fila e por-fonte (outbox molde wps_delivery), com uma linha viva por fonte.
-- Interna: RLS ligada + zero policies (so service_role, via a Edge knowledge-embed).

create table if not exists public.knowledge_source_queue (
  id              uuid primary key default gen_random_uuid(),
  source_type     text not null,
  source_id       uuid not null,
  op              text not null default 'upsert' check (op in ('upsert', 'delete')),
  status          text not null default 'pending' check (status in ('pending', 'processing', 'failed')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 6,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  enqueued_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists knowledge_queue_due_idx
  on public.knowledge_source_queue (next_attempt_at)
  where status in ('pending', 'failed');

create trigger knowledge_queue_set_updated_at
  before update on public.knowledge_source_queue
  for each row execute function public.set_updated_at();

alter table public.knowledge_source_queue enable row level security;
-- Sem policies: so service_role toca.

-- Enfileira (ou revive) o resync de uma fonte. Uma linha viva por fonte: o ultimo op vence.
create or replace function public.enqueue_knowledge_resync(p_source_type text, p_source_id uuid, p_op text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.knowledge_source_queue (source_type, source_id, op, status, attempts, next_attempt_at, last_error, enqueued_at)
  values (p_source_type, p_source_id, p_op, 'pending', 0, now(), null, now())
  on conflict (source_type, source_id) do update
    set op = excluded.op, status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, enqueued_at = now();
$$;

revoke all on function public.enqueue_knowledge_resync(text, uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_knowledge_resync(text, uuid, text) to service_role;

-- Claim atomico do lote (for update skip locked): evita dois ciclos de cron processarem a mesma
-- fonte. Recolhe tambem 'processing' preso ha >10min (worker morto no meio). Marca 'processing' e
-- incrementa attempts; o worker apaga a linha no sucesso ou reprograma no erro.
create or replace function public.knowledge_queue_claim(p_limit integer default 25)
returns setof public.knowledge_source_queue
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  update public.knowledge_source_queue q
     set status = 'processing', attempts = q.attempts + 1, updated_at = now()
   where q.id in (
     select id from public.knowledge_source_queue
      where (status in ('pending', 'failed') and next_attempt_at <= now())
         or (status = 'processing' and updated_at < now() - interval '10 minutes')
      order by next_attempt_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit, 25), 100))
   )
  returning q.*;
end;
$$;

revoke all on function public.knowledge_queue_claim(integer) from public, anon, authenticated;
grant execute on function public.knowledge_queue_claim(integer) to service_role;

-- ── Triggers de enfileiramento ───────────────────────────────────────────────

-- FAQ: publicada e viva -> upsert; despublicada/soft-deletada/apagada -> delete (o worker remove os chunks).
create or replace function public.faq_enqueue_knowledge()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_knowledge_resync('faq', old.id, 'delete');
    return old;
  end if;
  if new.deleted_at is not null or not new.is_published then
    perform public.enqueue_knowledge_resync('faq', new.id, 'delete');
  else
    perform public.enqueue_knowledge_resync('faq', new.id, 'upsert');
  end if;
  return new;
end; $fn$;

drop trigger if exists faq_knowledge_enqueue on public.faq;
create trigger faq_knowledge_enqueue
  after insert or update of question, answer, is_published, deleted_at, scope, location_id, destination_id or delete
  on public.faq for each row execute function public.faq_enqueue_knowledge();

-- Location: prosa por-campo (directions/notice/policy), keyada por location.id. Soft-delete remove tudo.
create or replace function public.location_enqueue_knowledge()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform public.enqueue_knowledge_resync('location_directions', new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_notice',     new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_policy',     new.id, 'delete');
    perform public.enqueue_knowledge_resync('location_amenity',    new.id, 'delete');
    return new;
  end if;
  if new.directions_text is distinct from old.directions_text then
    perform public.enqueue_knowledge_resync('location_directions', new.id, 'upsert');
  end if;
  if new.notice is distinct from old.notice then
    perform public.enqueue_knowledge_resync('location_notice', new.id, 'upsert');
  end if;
  if new.reservation_policy is distinct from old.reservation_policy then
    perform public.enqueue_knowledge_resync('location_policy', new.id, 'upsert');
  end if;
  return new;
end; $fn$;

drop trigger if exists location_knowledge_enqueue on public.location;
create trigger location_knowledge_enqueue
  after update of directions_text, notice, reservation_policy, deleted_at
  on public.location for each row execute function public.location_enqueue_knowledge();

-- Amenity: a fonte 'location_amenity' agrega as notes daquela location; qualquer mudanca re-sincroniza.
create or replace function public.location_amenity_enqueue_knowledge()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_knowledge_resync('location_amenity', old.location_id, 'upsert');
    return old;
  end if;
  perform public.enqueue_knowledge_resync('location_amenity', new.location_id, 'upsert');
  return new;
end; $fn$;

drop trigger if exists location_amenity_knowledge_enqueue on public.location_amenity;
create trigger location_amenity_knowledge_enqueue
  after insert or update of notes or delete
  on public.location_amenity for each row execute function public.location_amenity_enqueue_knowledge();

-- ── Backfill: enfileira as fontes de prosa que ja existem (o worker drena) ────
insert into public.knowledge_source_queue (source_type, source_id, op)
select 'faq', id, 'upsert' from public.faq where is_published and deleted_at is null
union all
select 'location_directions', id, 'upsert' from public.location where directions_text is not null and deleted_at is null
union all
select 'location_notice', id, 'upsert' from public.location where notice is not null and deleted_at is null
union all
select 'location_policy', id, 'upsert' from public.location where reservation_policy is not null and deleted_at is null
union all
select 'location_amenity', location_id, 'upsert' from public.location_amenity where notes is not null group by location_id
on conflict (source_type, source_id) do nothing;
