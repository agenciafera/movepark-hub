-- Mia para operadores (assistente de IA no /operator). Ver docs/specs/assistente-do-operador.md.
--
-- O agente roda no beast-bots e fala com o Hub pela superfície interna /operator do MCP. Esta
-- migration cria o que o Hub precisa para ser a fronteira de confiança: o token do assistente
-- (o beast-bots nunca recebe o JWT do operador), as ações propostas que só o clique executa, o log
-- da conversa, as lacunas e a base do operador, vetorizada em tabela própria.

-- ── Escopo de plataforma do agente ─────────────────────────────────────────────
insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values (
  'operator:assist', 'assistente',
  'Agente da Mia para operadores: usa a superfície /operator do MCP em nome do operador logado (uso interno do beast-bots).',
  true, true
)
on conflict (scope) do nothing;

-- "Agente agindo por fulano": a chave é do beast-bots, a pessoa é o operador.
alter table public.api_request_log add column if not exists acting_user_id uuid;

-- ── Token do assistente (mpo_) ─────────────────────────────────────────────────
-- Vale 30 minutos, uma empresa, só na superfície /operator. Guardado em sha256: o valor em claro
-- só existe na resposta da Edge e no requestContext do turno.
create table public.operator_assist_session (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index operator_assist_session_expires_idx on public.operator_assist_session (expires_at);
alter table public.operator_assist_session enable row level security;
revoke all on table public.operator_assist_session from anon, authenticated;

-- ── Ações propostas ────────────────────────────────────────────────────────────
create table public.operator_assistant_action (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid not null references public.booking(id) on delete cascade,
  kind text not null check (kind in ('cancel', 'change_dates', 'change_vehicle', 'check_in', 'check_out')),
  params jsonb not null default '{}'::jsonb,
  summary text not null,
  -- Positivo: o cliente paga a diferença. Negativo: estorno ao cliente. Nulo: não mexe em dinheiro.
  effect_cents integer,
  status text not null default 'proposed'
    check (status in ('proposed', 'executing', 'executed', 'failed', 'expired', 'dismissed')),
  result jsonb,
  error text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index operator_assistant_action_owner_idx
  on public.operator_assistant_action (profile_id, company_id, created_at desc);
alter table public.operator_assistant_action enable row level security;
revoke all on table public.operator_assistant_action from anon, authenticated;
grant select on table public.operator_assistant_action to authenticated;
create policy operator_assistant_action_select on public.operator_assistant_action
  for select to authenticated
  using (profile_id = auth.uid() or public.is_hub_admin());

-- ── Conversa ───────────────────────────────────────────────────────────────────
create table public.operator_assistant_message (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  used_tools text[] not null default '{}',
  action_ids uuid[] not null default '{}',
  page text,
  booking_code text,
  error text,
  created_at timestamptz not null default now()
);
create index operator_assistant_message_owner_idx
  on public.operator_assistant_message (profile_id, company_id, created_at desc);
create index operator_assistant_message_company_idx
  on public.operator_assistant_message (company_id, created_at desc);
alter table public.operator_assistant_message enable row level security;
revoke all on table public.operator_assistant_message from anon, authenticated;
grant select on table public.operator_assistant_message to authenticated;
create policy operator_assistant_message_select on public.operator_assistant_message
  for select to authenticated
  using (profile_id = auth.uid() or public.is_hub_admin());

-- ── Base do operador ───────────────────────────────────────────────────────────
-- Tabela própria, e não uma camada da FAQ: o chat do site e a Mia não enxergam nada daqui porque
-- a busca pública (match_knowledge) lê outra tabela. Vazamento impossível por ausência.
create table public.operator_playbook_article (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  body_md text not null,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger set_updated_at before update on public.operator_playbook_article
  for each row execute function public.set_updated_at();
alter table public.operator_playbook_article enable row level security;
revoke all on table public.operator_playbook_article from anon, authenticated;
grant select, insert, update on table public.operator_playbook_article to authenticated;
create policy operator_playbook_article_admin on public.operator_playbook_article
  for all to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

create or replace function public.operator_playbook_enqueue_knowledge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_knowledge_resync('operator_playbook', old.id, 'delete');
    return old;
  end if;
  if new.deleted_at is not null or not new.is_published then
    perform public.enqueue_knowledge_resync('operator_playbook', new.id, 'delete');
  else
    perform public.enqueue_knowledge_resync('operator_playbook', new.id, 'upsert');
  end if;
  return new;
end; $$;
revoke all on function public.operator_playbook_enqueue_knowledge() from public, anon, authenticated;

create trigger operator_playbook_knowledge_enqueue
  after insert or update or delete on public.operator_playbook_article
  for each row execute function public.operator_playbook_enqueue_knowledge();

-- Vetores da base do operador. Mesma forma da knowledge_chunk, para o worker `knowledge-embed`
-- só trocar de tabela; escopo é sempre global (a base não varia por unidade).
create table public.operator_knowledge_chunk (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  chunk_index integer not null,
  scope public.faq_scope not null default 'global',
  location_id uuid,
  destination_id uuid,
  content text not null,
  content_hash text not null,
  token_estimate integer,
  embedding extensions.vector(768),
  embedding_stale boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, chunk_index)
);
alter table public.operator_knowledge_chunk enable row level security;
revoke all on table public.operator_knowledge_chunk from anon, authenticated;

-- ── Lacunas ────────────────────────────────────────────────────────────────────
create table public.operator_assistant_gap (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.company(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  question text not null,
  context text,
  booking_code text,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolution_note text,
  article_id uuid references public.operator_playbook_article(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index operator_assistant_gap_status_idx on public.operator_assistant_gap (status, created_at desc);
alter table public.operator_assistant_gap enable row level security;
revoke all on table public.operator_assistant_gap from anon, authenticated;
grant select, update on table public.operator_assistant_gap to authenticated;
create policy operator_assistant_gap_admin on public.operator_assistant_gap
  for all to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

-- ── Config ─────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value, is_public)
values (
  'operator_assistant',
  '{"enabled": true, "max_messages_per_user_hour": 40, "max_messages_per_company_day": 400}',
  false
)
on conflict (key) do nothing;

-- ── Resolução do token ─────────────────────────────────────────────────────────
-- O escopo é recalculado a cada chamada pelo papel: tirar o acesso de alguém vale na hora, sem
-- esperar o token vencer. hub_admin recebe o catálogo de empresa inteiro (como em member_has_scope).
create or replace function public.operator_assist_resolve(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  s public.operator_assist_session;
  v_profile_role public.user_role;
  v_name text;
  v_member_role public.company_role;
  v_company_name text;
  v_scopes text[];
begin
  select * into s from public.operator_assist_session
  where token_hash = p_token_hash and expires_at > now();
  if s.id is null then
    return jsonb_build_object('ok', false, 'reason', 'token_invalido');
  end if;

  select c.name into v_company_name
  from public.company c where c.id = s.company_id and c.deleted_at is null;
  if v_company_name is null then
    return jsonb_build_object('ok', false, 'reason', 'empresa_inexistente');
  end if;

  select p.role, coalesce(nullif(trim(p.full_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''))
    into v_profile_role, v_name
  from public.profiles p where p.id = s.profile_id and p.deleted_at is null;
  if v_profile_role is null then
    return jsonb_build_object('ok', false, 'reason', 'usuario_inexistente');
  end if;

  if v_profile_role = 'hub_admin' then
    select array_agg(a.scope order by a.scope) into v_scopes
    from public.api_scope a where not a.is_platform_scope;
    return jsonb_build_object(
      'ok', true, 'profile_id', s.profile_id, 'company_id', s.company_id,
      'company_name', v_company_name, 'user_name', v_name, 'role', 'hub_admin',
      'scopes', to_jsonb(coalesce(v_scopes, '{}')));
  end if;

  select pc.role into v_member_role
  from public.profile_company pc
  where pc.profile_id = s.profile_id and pc.company_id = s.company_id;
  if v_member_role is null then
    return jsonb_build_object('ok', false, 'reason', 'sem_vinculo');
  end if;

  select array_agg(crs.scope order by crs.scope) into v_scopes
  from public.company_role_scope crs where crs.role = v_member_role;

  return jsonb_build_object(
    'ok', true, 'profile_id', s.profile_id, 'company_id', s.company_id,
    'company_name', v_company_name, 'user_name', v_name, 'role', v_member_role::text,
    'scopes', to_jsonb(coalesce(v_scopes, '{}')));
end; $$;
revoke all on function public.operator_assist_resolve(text) from public, anon, authenticated;
grant execute on function public.operator_assist_resolve(text) to service_role;

-- ── Busca de reserva ───────────────────────────────────────────────────────────
-- Por código, placa, nome, e-mail ou telefone, sempre dentro da empresa do token.
create or replace function public.assist_find_booking(p_company_id uuid, p_query text, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  q text := trim(coalesce(p_query, ''));
  q_plate text := upper(regexp_replace(q, '[^A-Za-z0-9]', '', 'g'));
  q_digits text := regexp_replace(q, '\D', '', 'g');
  v jsonb;
begin
  if length(q) < 3 then
    raise exception 'Digite ao menos 3 caracteres para buscar.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(r order by r.check_in_at desc), '[]'::jsonb) into v
  from (
    select b.id, b.code, b.status, b.check_in_at, b.check_out_at, b.customer_name,
           ve.license_plate as plate, l.name as location_name, b.fare_tier, b.total_amount
    from public.booking b
    join public.location l on l.id = b.location_id
    left join public.vehicle ve on ve.id = b.vehicle_id
    where l.company_id = p_company_id
      and b.deleted_at is null
      and (
        b.code ilike '%' || q || '%'
        or b.customer_name ilike '%' || q || '%'
        or b.customer_email ilike '%' || q || '%'
        or (length(q_digits) >= 6 and regexp_replace(coalesce(b.customer_phone, ''), '\D', '', 'g') like '%' || q_digits || '%')
        or (length(q_plate) >= 5 and ve.plate_normalized = q_plate)
      )
    order by b.check_in_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 20))
  ) r;
  return v;
end; $$;
revoke all on function public.assist_find_booking(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.assist_find_booking(uuid, text, integer) to service_role;

-- ── Situação da reserva ────────────────────────────────────────────────────────
-- Os fatos crus. O "que dá para fazer agora" é calculado em TS (operator.logic.ts) com as mesmas
-- regras das Edges de cancelamento e troca, para não existirem duas versões da regra.
create or replace function public.assist_booking_situation(p_company_id uuid, p_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ref text := trim(coalesce(p_ref, ''));
  v_id uuid;
  v jsonb;
begin
  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_ref::uuid;
  end if;

  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'status', b.status, 'origin', b.origin,
    'created_at', b.created_at, 'expires_at', b.expires_at,
    'check_in_at', b.check_in_at, 'check_out_at', b.check_out_at,
    'checked_in_at', b.checked_in_at, 'checked_out_at', b.checked_out_at,
    'total_amount', b.total_amount,
    'customer_name', b.customer_name, 'customer_phone', b.customer_phone, 'customer_email', b.customer_email,
    'flight_number', b.flight_number,
    'fare_tier', b.fare_tier, 'fare_price_cents', b.fare_price_cents,
    'fare_cancel_until', b.fare_cancel_until, 'fare_benefits', b.fare_benefits,
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'tolerance_minutes', l.tolerance_minutes,
                                   'checkout_mode', l.checkout_mode),
    'parking_type', (select pt.name from public.booking_item bi join public.parking_type pt on pt.id = bi.parking_type_id
                     where bi.booking_id = b.id and bi.item_type = 'parking' limit 1),
    'vehicle', case when ve.id is null then null
                    else jsonb_build_object('plate', ve.license_plate, 'model', ve.model, 'color', ve.color) end,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'kind', coalesce(pa.kind, 'booking'), 'method', pa.method, 'status', pa.status,
        'amount', pa.amount, 'installments', pa.installments, 'paid_at', pa.paid_at,
        'refunded_amount', pa.refunded_amount, 'refunded_at', pa.refunded_at, 'refund_reason', pa.refund_reason,
        'fare_target_tier', pa.fare_target_tier,
        'date_change_check_in_at', pa.date_change_check_in_at, 'date_change_check_out_at', pa.date_change_check_out_at,
        'expires_at', pa.expires_at, 'created_at', pa.created_at) order by pa.created_at)
      from public.payment pa where pa.booking_id = b.id), '[]'::jsonb),
    'modifications', coalesce((
      select jsonb_agg(m order by m.created_at desc) from (
        select bm.type, bm.actor_role, bm.changes, bm.amount_delta_cents, bm.reason, bm.created_at
        from public.booking_modification bm where bm.booking_id = b.id
        order by bm.created_at desc limit 10) m), '[]'::jsonb),
    'flight_extensions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', fe.kind, 'added_days', fe.added_days, 'new_check_out_at', fe.new_check_out_at,
        'actual_check_out_at', fe.actual_check_out_at, 'created_at', fe.created_at) order by fe.created_at)
      from public.booking_fare_extension fe where fe.booking_id = b.id), '[]'::jsonb),
    'fares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier', f.tier, 'label', f.label, 'price_cents', f.price_cents,
        'cancel_window_minutes', f.cancel_window_minutes, 'benefits', f.benefits) order by f.sort_order)
      from public.fare f where f.is_active), '[]'::jsonb)
  ) into v
  from public.booking b
  join public.location l on l.id = b.location_id
  left join public.vehicle ve on ve.id = b.vehicle_id
  where l.company_id = p_company_id
    and b.deleted_at is null
    and (b.id = v_id or upper(b.code) = upper(v_ref))
  limit 1;

  if v is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  return v;
end; $$;
revoke all on function public.assist_booking_situation(uuid, text) from public, anon, authenticated;
grant execute on function public.assist_booking_situation(uuid, text) to service_role;

-- ── Busca na base do operador ──────────────────────────────────────────────────
-- Ordenação exata sobre o conjunto elegível (a base é pequena), pelo mesmo motivo da correção de
-- 19/08 na match_knowledge: filtro depois do HNSW perde resposta.
create or replace function public.match_operator_knowledge(p_query_embedding text, p_k integer default 6)
returns table (source_id uuid, chunk_index integer, title text, category text, content text, similarity double precision)
language sql
stable
security definer
set search_path to 'public, extensions'
as $$
  with q as (select (p_query_embedding)::extensions.vector(768) as emb),
  elegiveis as materialized (
    select k.source_id, k.chunk_index, a.title, a.category, k.content, k.embedding
    from public.operator_knowledge_chunk k
    join public.operator_playbook_article a on a.id = k.source_id
    where k.embedding is not null and not k.embedding_stale
      and a.is_published and a.deleted_at is null
  )
  select e.source_id, e.chunk_index, e.title, e.category, e.content,
         1 - (e.embedding operator(extensions.<=>) q.emb) as similarity
  from elegiveis e, q
  order by e.embedding operator(extensions.<=>) q.emb
  limit greatest(1, least(coalesce(p_k, 6), 12));
$$;
revoke all on function public.match_operator_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.match_operator_knowledge(text, integer) to service_role;
