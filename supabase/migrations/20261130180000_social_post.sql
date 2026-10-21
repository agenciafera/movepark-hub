-- Fila de publicação do Instagram (E3.6).
--
-- A plataforma não gera conteúdo: o post chega pronto da skill `instagram` (Claude, com a foto do
-- Higgsfield pelo MCP), pela Edge `social-draft`, e espera aqui até um hub_admin aprovar. A Edge
-- `social-dispatch`, chamada pelo pg_cron, publica na hora marcada, um por dia, e só com
-- `app_setting.social_dispatch_enabled = 'true'`.
--
-- Escrita: só a Edge (service role) e as RPCs definer abaixo. Cliente nenhum escreve direto,
-- porque o que sai daqui é publicação pública com a marca da Movepark.
--
-- Ver docs/specs/instagram-fila-de-publicacao.md.

create type public.social_post_status as enum (
  'pending_review', 'approved', 'publishing', 'published', 'failed', 'rejected', 'overdue'
);

create type public.social_post_kind as enum ('image', 'carousel');

create table public.social_post (
  id uuid primary key default gen_random_uuid(),
  -- `<origem>:<corte>`. Reenviar o mesmo rascunho atualiza a linha enquanto ela espera aprovação.
  draft_key text not null unique,
  status public.social_post_status not null default 'pending_review',
  kind public.social_post_kind not null,
  caption text not null,
  -- [{ url, path, alt, texto }] em ordem. 10 é o teto da skill (a API aceita 20 desde 2026).
  slides jsonb not null,
  keyphrase text,
  cut_number smallint check (cut_number between 1 and 4),
  blog_post_id uuid references public.blog_post(id) on delete set null,
  destination_id uuid references public.destination(id) on delete set null,
  cta_url text,
  -- Data de referência de todo R$ do post. A conferência bloqueia R$ sem ela.
  price_date date,
  scheduled_at timestamptz not null,
  -- { blockers: [], warnings: [] }. Escrito só pela Edge, que é onde a conferência roda.
  validation jsonb not null default '{"blockers": [], "warnings": []}'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  -- Gravado assim que o container pai existe: deixa a nova tentativa consultar a Meta antes de
  -- publicar, para o mesmo post nunca sair duas vezes.
  ig_container_id text,
  ig_media_id text,
  ig_permalink text,
  published_at timestamptz,
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_post_slides_validos check (
    jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 1 and 10
  ),
  constraint social_post_kind_bate check (
    (kind = 'image') = (jsonb_array_length(slides) = 1)
  ),
  constraint social_post_publicado_tem_midia check (
    status <> 'published' or ig_media_id is not null
  )
);

create index social_post_fila_idx on public.social_post (status, scheduled_at)
  where deleted_at is null;

create trigger social_post_set_updated_at
  before update on public.social_post
  for each row execute function public.set_updated_at();

comment on table public.social_post is
  'Fila de publicação do Instagram (E3.6). Entra pela Edge social-draft, sai pela social-dispatch. Só hub_admin lê; escrita só por Edge e RPC definer.';

create table public.social_post_event (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_post(id) on delete cascade,
  kind text not null check (kind in (
    'draft_received', 'caption_edited', 'approved', 'rejected', 'rescheduled', 'dry_run',
    'container_child', 'container_parent', 'container_status', 'media_publish', 'permalink',
    'consulta', 'reconciled', 'overdue', 'failed'
  )),
  http_status integer,
  -- Caminho, método e campos da chamada à Graph API. NUNCA o access_token.
  request jsonb,
  response jsonb,
  note text,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index social_post_event_post_idx on public.social_post_event (social_post_id, created_at);

comment on table public.social_post_event is
  'Rastro da fila do Instagram: toda chamada à Meta e toda decisão humana, como o payment_gateway_event faz com a Pagar.me.';

-- ── RLS: leitura só de hub_admin, escrita de ninguém pelo cliente ─────────────────────
alter table public.social_post enable row level security;
alter table public.social_post_event enable row level security;

create policy social_post_admin_read on public.social_post
  for select to authenticated using (public.is_hub_admin());
create policy social_post_event_admin_read on public.social_post_event
  for select to authenticated using (public.is_hub_admin());

revoke all on public.social_post, public.social_post_event from anon;
revoke insert, update, delete, truncate on public.social_post, public.social_post_event from authenticated;

-- ── A chave do disparo ────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value)
values ('social_dispatch_enabled', 'false')
on conflict (key) do nothing;

-- ── Um post por dia, no fuso de São Paulo ─────────────────────────────────────────────
create or replace function public.social_post_day_taken(p_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.social_post s
     where s.id <> p_id
       and s.deleted_at is null
       and s.status in ('approved', 'publishing', 'published')
       and (coalesce(s.published_at, s.scheduled_at) at time zone 'America/Sao_Paulo')::date
         = (p_at at time zone 'America/Sao_Paulo')::date
  );
$$;

revoke all on function public.social_post_day_taken(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.social_post_day_taken(uuid, timestamptz) to service_role;

-- ── Aprovar ───────────────────────────────────────────────────────────────────────────
create or replace function public.social_post_approve(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status <> 'pending_review' then
    raise exception 'Só post aguardando aprovação pode ser aprovado (está %).', p.status using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p.validation -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'O post tem bloqueios da conferência e não pode ser aprovado.' using errcode = 'P0001';
  end if;
  if p.scheduled_at <= now() then
    raise exception 'A data do post já passou. Reagende antes de aprovar.' using errcode = 'P0001';
  end if;
  if public.social_post_day_taken(p.id, p.scheduled_at) then
    raise exception 'Já existe post agendado ou publicado nesse dia.' using errcode = 'P0001';
  end if;

  update public.social_post
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, actor)
  values (p_id, 'approved', auth.uid());
end;
$$;

revoke all on function public.social_post_approve(uuid) from public, anon;
grant execute on function public.social_post_approve(uuid) to authenticated, service_role;

-- ── Recusar ───────────────────────────────────────────────────────────────────────────
create or replace function public.social_post_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Diga o motivo da recusa.' using errcode = 'P0001';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode mais ser recusado (está %).', p.status using errcode = 'P0001';
  end if;

  update public.social_post set status = 'rejected' where id = p_id;

  insert into public.social_post_event (social_post_id, kind, note, actor)
  values (p_id, 'rejected', v_motivo, auth.uid());
end;
$$;

revoke all on function public.social_post_reject(uuid, text) from public, anon;
grant execute on function public.social_post_reject(uuid, text) to authenticated, service_role;

-- ── Reagendar (é também o "tentar de novo" do post que falhou) ────────────────────────
create or replace function public.social_post_reschedule(p_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;
  if p_at is null or p_at <= now() then
    raise exception 'A nova data precisa estar no futuro.' using errcode = 'P0001';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode ser reagendado (está %).', p.status using errcode = 'P0001';
  end if;
  if public.social_post_day_taken(p.id, p_at) then
    raise exception 'Já existe post agendado ou publicado nesse dia.' using errcode = 'P0001';
  end if;

  update public.social_post
     set scheduled_at = p_at,
         status = case
           when p.status in ('overdue', 'failed') then 'approved'::public.social_post_status
           else p.status
         end,
         last_error = case when p.status = 'failed' then null else p.last_error end
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, request, actor)
  values (p_id, 'rescheduled',
          jsonb_build_object('de', p.scheduled_at, 'para', p_at, 'status_anterior', p.status),
          auth.uid());
end;
$$;

revoke all on function public.social_post_reschedule(uuid, timestamptz) from public, anon;
grant execute on function public.social_post_reschedule(uuid, timestamptz) to authenticated, service_role;
