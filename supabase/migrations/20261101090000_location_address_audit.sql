-- Auditoria de endereço das unidades.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- Por quê. A refação da página de destinos descobriu uma unidade com endereço errado. Endereço
-- e pino de unidade parceira não são cosmética: a distância ao aeroporto sai de ST_Distance
-- sobre location.geog (ADR-001) e alimenta a ordenação da busca, o badge "mais perto do Tx", a
-- página do destino, o JSON-LD e o índice de preço. Um pino a 4 km errado reordena a vitrine
-- inteira e manda o cliente para a porta errada às 5h da manhã.
--
-- Desenho: duas camadas, e a correção NUNCA é automática.
--
--   1. Triagem (SQL puro, custo zero, roda sempre): `location_address_scan()`. Marca sinais
--      que dá para ver só olhando o próprio banco: sem geo, sem destino, longe demais do
--      destino ancorado, endereço sem número, endereço repetido entre duas unidades, pinos
--      colados, place_id que não é de estabelecimento.
--   2. Verificação (Places API, custo por chamada): Edge `location-address-audit`. Resolve o
--      lugar no Google e grava o endereço/coordenada de lá como PROPOSTA, com a distância
--      entre o nosso pino e o dele (`drift_m`), que é o sinal forte de pino errado.
--
-- A camada 2 propõe; quem grava é `hub_admin` pela tela do Manager. O E0.17-i já provou que
-- match errado é pior que nenhum: publicar o nome de um lugar com o pino de outro. Aqui o
-- estrago seria maior, porque estas unidades vendem.
--
-- O que a correção precisa arrastar junto (o motivo de existir uma RPC em vez de um UPDATE):
-- mudar lat/lng NÃO re-vincula o destino sozinho. A trigger `location_set_destination_trg` só
-- age em INSERT, de propósito (nunca pisar num override manual, ver DAT-04). Então uma
-- correção de coordenada que atravessa a fronteira de outro aeroporto deixaria a unidade
-- ancorada no destino antigo, e a distância exibida seria a distância certa até o aeroporto
-- errado. `manager_location_address_apply` recalcula o vínculo na mesma transação e devolve o
-- antes/depois de destino e distância.
--
-- A distância em si não tem cache: é view/RPC PostGIS sobre a coluna gerada `geog`, então
-- corrigir a coordenada já corrige busca, card, terminais e JSON-LD. O HTML do SSG é cache, e
-- a trigger `location_site_rebuild` (deploy automático) já republica o site no UPDATE.

-- ── 1. Política (limiares editáveis sem deploy) ───────────────────────────────────────────
-- Mesmo padrão de card_installment_policy/site_rebuild_policy: limiar é config, não código.

insert into public.app_setting (key, value, is_public)
values (
  'location_address_audit_policy',
  jsonb_build_object(
    'max_km_airport', 15,
    'max_km_other', 12,
    'pin_dup_meters', 50,
    'drift_alert_meters', 250,
    'name_similarity_strong', 0.85,
    'name_similarity_weak', 0.60,
    'max_km_strong', 15,
    'max_km_weak', 3,
    'verify_after_days', 90
  )::text,
  false
)
on conflict (key) do nothing;

create or replace function public.location_address_audit_policy()
returns jsonb
language sql
stable
set search_path = 'public'
as $$
  select coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'location_address_audit_policy'),
    '{}'::jsonb
  ) || '{}'::jsonb;
$$;

comment on function public.location_address_audit_policy() is
  'Limiares da auditoria de endereço (app_setting.location_address_audit_policy).';

-- ── 2. Tabela: uma linha por unidade, o último veredito ───────────────────────────────────
-- Uma linha por unidade (e não histórico) porque a pergunta da tela é "o que está errado
-- AGORA". O histórico de quem mudou o quê vive em location_address_change, abaixo.

create table if not exists public.location_address_audit (
  location_id uuid primary key references public.location(id) on delete cascade,

  -- camada 1 (triagem local)
  scanned_at timestamptz not null default now(),
  flags text[] not null default '{}',

  -- camada 2 (Places API)
  verified_at timestamptz,
  verify_status text not null default 'pending'
    check (verify_status in ('pending', 'ok', 'divergent', 'no_match', 'error')),
  fetch_error text,
  match_place_id text,
  match_name text,
  match_address text,
  match_latitude numeric,
  match_longitude numeric,
  match_maps_url text,
  match_business_status text,
  name_similarity numeric,
  -- distância entre o nosso pino e o do Google, em metros. O sinal forte de pino errado.
  drift_m numeric,

  -- revisão humana
  decision text not null default 'pending'
    check (decision in ('pending', 'applied', 'dismissed')),
  decision_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.location_address_audit is
  'Veredito corrente da auditoria de endereço por unidade: triagem local (flags) + proposta do Google (match_*). Só hub_admin lê. A correção é aplicada por manager_location_address_apply.';
comment on column public.location_address_audit.drift_m is
  'Distância em metros entre o pino gravado na unidade e o do Google. Sinal forte de pino errado.';
comment on column public.location_address_audit.decision is
  'pending = esperando revisão; applied = hub_admin gravou a correção; dismissed = revisado e mantido como está.';

drop trigger if exists location_address_audit_set_updated_at on public.location_address_audit;
create trigger location_address_audit_set_updated_at
  before update on public.location_address_audit
  for each row execute function public.set_updated_at();

alter table public.location_address_audit enable row level security;

-- Leitura só da equipe Movepark: o veredito diz "esta unidade pode estar no lugar errado", que
-- não é informação para o parceiro nem para o cliente antes de alguém conferir.
drop policy if exists location_address_audit_admin_read on public.location_address_audit;
create policy location_address_audit_admin_read on public.location_address_audit
  for select using (public.is_hub_admin());

-- Escrita nenhuma por PostgREST: quem grava é a Edge (service_role) e as RPCs definer.

-- ── 3. Histórico de correção (o rastro da auditoria) ──────────────────────────────────────

create table if not exists public.location_address_change (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.location(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  address_before text,
  address_after text,
  latitude_before numeric,
  longitude_before numeric,
  latitude_after numeric,
  longitude_after numeric,
  destination_before uuid references public.destination(id) on delete set null,
  destination_after uuid references public.destination(id) on delete set null,
  distance_km_before numeric,
  distance_km_after numeric,
  source text not null default 'audit',
  note text
);

create index if not exists location_address_change_location_idx
  on public.location_address_change (location_id, changed_at desc);

comment on table public.location_address_change is
  'Rastro de toda correção de endereço/pino aplicada pela auditoria: antes, depois, destino re-vinculado e distância resultante.';

alter table public.location_address_change enable row level security;

drop policy if exists location_address_change_admin_read on public.location_address_change;
create policy location_address_change_admin_read on public.location_address_change
  for select using (public.is_hub_admin());

-- ── 4. Triagem (camada 1): sinais que o próprio banco enxerga ────────────────────────────
-- Normalização do endereço para comparar duas unidades: sem acento, sem pontuação, sem
-- espaço. "Av. Novo Brasil, 954 - Cidade Industrial Satélite" e "Av. Novo Brasil, 954 -
-- Cidade Industrial Satélite de São Paulo" precisam bater, então a comparação é por
-- PREFIXO de rua+número, não pela string inteira: é o par (logradouro, número) que
-- identifica a porta, e o resto do texto é onde a variação mora.

create or replace function public.location_address_key(p_address text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select nullif(
    regexp_replace(
      lower(translate(
        coalesce(p_address, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      )),
      '[^a-z0-9]', '', 'g'
    ),
    ''
  );
$$;

comment on function public.location_address_key(text) is
  'Endereço normalizado (minúsculo, sem acento, sem pontuação) para detectar duas unidades declarando a mesma porta.';

-- Primeiro número do endereço: é o número da porta na esmagadora maioria dos casos, e o que
-- distingue "Av. Novo Brasil, 954" de "Av. Novo Brasil, 1200".
create or replace function public.location_address_number(p_address text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select (regexp_match(coalesce(p_address, ''), '(\d{1,6})'))[1];
$$;

create or replace function public.location_address_scan()
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_policy jsonb := public.location_address_audit_policy();
  v_max_air numeric := coalesce((v_policy->>'max_km_airport')::numeric, 15);
  v_max_other numeric := coalesce((v_policy->>'max_km_other')::numeric, 12);
  v_pin_dup numeric := coalesce((v_policy->>'pin_dup_meters')::numeric, 50);
  v_count integer;
begin
  with base as (
    select
      l.id,
      l.name,
      l.address,
      l.latitude,
      l.longitude,
      l.geog,
      l.destination_id,
      l.google_place_id,
      d.type::text as dest_type,
      case when l.geog is not null and d.geog is not null
        then st_distance(l.geog, d.geog) / 1000.0 end as dist_km,
      public.location_address_key(l.address) as addr_key,
      public.location_address_number(l.address) as addr_num
    from public.location l
    left join public.destination d on d.id = l.destination_id
    where l.deleted_at is null
  ),
  flagged as (
    select
      b.id,
      array_remove(array[
        case when b.latitude is null or b.longitude is null then 'sem_geo' end,
        case when b.destination_id is null and b.latitude is not null then 'sem_destino' end,
        case when b.google_place_id is null then 'sem_place_id' end,
        -- Place ID de estabelecimento começa por ChIJ. Os codificados longos (prefixo E) são
        -- de endereço/rota: resolvem para uma porta genérica, não para o negócio, e foi
        -- exatamente assim que uma unidade ficou com o pino a quilômetros do lote.
        case when b.google_place_id is not null and b.google_place_id not like 'ChIJ%'
          then 'place_id_nao_e_estabelecimento' end,
        case when b.dist_km is not null and b.dest_type = 'airport' and b.dist_km > v_max_air
          then 'longe_do_destino' end,
        case when b.dist_km is not null and b.dest_type <> 'airport' and b.dist_km > v_max_other
          then 'longe_do_destino' end,
        case when b.address is null or length(trim(b.address)) < 12 then 'endereco_incompleto' end,
        case when b.addr_num is null then 'endereco_sem_numero' end,
        case when exists (
          select 1 from base o
          where o.id <> b.id
            and b.addr_key is not null
            and b.addr_num is not null
            and o.addr_num = b.addr_num
            -- mesma porta declarada: os 18 primeiros caracteres normalizados cobrem
            -- logradouro + número sem depender do complemento/bairro escrito depois.
            and left(o.addr_key, 18) = left(b.addr_key, 18)
        ) then 'endereco_duplicado' end,
        case when exists (
          select 1 from base o
          where o.id <> b.id
            and o.geog is not null and b.geog is not null
            and st_dwithin(o.geog, b.geog, v_pin_dup)
        ) then 'pino_duplicado' end
      ], null) as flags
    from base b
  )
  insert into public.location_address_audit as a (location_id, flags, scanned_at)
  select f.id, f.flags, now() from flagged f
  on conflict (location_id) do update
    set flags = excluded.flags,
        scanned_at = excluded.scanned_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.location_address_scan() is
  'Camada 1 da auditoria: marca em location_address_audit.flags os sinais visíveis só com o banco. Sem custo de API. Chamada pelo cron, pela Edge e pelo botão do Manager.';

revoke all on function public.location_address_scan() from public;
-- A Edge (service_role) e o cron rodam a triagem antes de gastar chamada de API.
grant execute on function public.location_address_scan() to service_role;

-- ── 5. Edição da unidade invalida a verificação ───────────────────────────────────────────
-- Alguém mexeu no endereço ou no pino: o veredito do Google que estava ali passou a ser sobre
-- outro endereço. Volta para pendente em vez de continuar exibindo um "ok" vencido.
-- O guard `app.address_audit_apply` existe porque a própria RPC de aplicar faz esse UPDATE, e
-- sem ele a correção apagaria o registro da correção.

create or replace function public.location_address_audit_invalidate()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if coalesce(current_setting('app.address_audit_apply', true), '') = '1' then
    return null;
  end if;

  update public.location_address_audit
     set verify_status = 'pending',
         verified_at = null,
         fetch_error = null,
         match_place_id = null,
         match_name = null,
         match_address = null,
         match_latitude = null,
         match_longitude = null,
         match_maps_url = null,
         match_business_status = null,
         name_similarity = null,
         drift_m = null,
         decision = 'pending',
         decision_note = null,
         reviewed_at = null,
         reviewed_by = null
   where location_id = new.id;

  return null;
end;
$$;

drop trigger if exists location_address_audit_invalidate_trg on public.location;
create trigger location_address_audit_invalidate_trg
  after update of address, latitude, longitude, google_place_id on public.location
  for each row
  when (
    old.address is distinct from new.address
    or old.latitude is distinct from new.latitude
    or old.longitude is distinct from new.longitude
    or old.google_place_id is distinct from new.google_place_id
  )
  execute function public.location_address_audit_invalidate();

-- ── 6. Leitura do painel ──────────────────────────────────────────────────────────────────
-- RPC em vez de view + PostgREST porque a tela precisa juntar o estado atual da unidade, o
-- veredito e a distância corrente numa linha só, e porque o gate é hub_admin puro.

create or replace function public.manager_location_address_audit(
  p_only_flagged boolean default false
)
returns table (
  location_id uuid,
  location_name text,
  company_name text,
  slug text,
  status text,
  is_listed boolean,
  address text,
  latitude numeric,
  longitude numeric,
  google_place_id text,
  google_maps_url text,
  destination_id uuid,
  destination_code text,
  destination_name text,
  distance_km numeric,
  flags text[],
  scanned_at timestamptz,
  verified_at timestamptz,
  verify_status text,
  fetch_error text,
  match_place_id text,
  match_name text,
  match_address text,
  match_latitude numeric,
  match_longitude numeric,
  match_maps_url text,
  match_business_status text,
  name_similarity numeric,
  drift_m numeric,
  suggested_destination_code text,
  suggested_distance_km numeric,
  decision text,
  decision_note text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark vê a auditoria de endereços.' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.name,
    c.name,
    l.slug,
    l.status::text,
    l.is_listed,
    l.address,
    l.latitude,
    l.longitude,
    l.google_place_id,
    l.google_maps_url,
    l.destination_id,
    d.code,
    d.name,
    case when l.geog is not null and d.geog is not null
      then round((st_distance(l.geog, d.geog) / 1000.0)::numeric, 2) end,
    coalesce(a.flags, '{}'),
    a.scanned_at,
    a.verified_at,
    coalesce(a.verify_status, 'pending'),
    a.fetch_error,
    a.match_place_id,
    a.match_name,
    a.match_address,
    a.match_latitude,
    a.match_longitude,
    a.match_maps_url,
    a.match_business_status,
    a.name_similarity,
    a.drift_m,
    -- Para onde a unidade seria ancorada se o pino do Google fosse aceito. É o que responde
    -- "corrigir esta coordenada muda o aeroporto dela?" antes de alguém clicar em aplicar.
    sd.code,
    case when a.match_latitude is not null and sd.geog is not null
      then round((
        st_distance(
          st_setsrid(st_makepoint(a.match_longitude, a.match_latitude), 4326)::geography,
          sd.geog
        ) / 1000.0)::numeric, 2) end,
    coalesce(a.decision, 'pending'),
    a.decision_note,
    a.reviewed_at
  from public.location l
  join public.company c on c.id = l.company_id
  left join public.destination d on d.id = l.destination_id
  left join public.location_address_audit a on a.location_id = l.id
  left join lateral (
    select dd.code, dd.geog
    from public.destination dd
    where a.match_latitude is not null
      and dd.id = public.nearest_destination(a.match_latitude, a.match_longitude)
  ) sd on true
  where l.deleted_at is null
    and (
      not p_only_flagged
      or coalesce(array_length(a.flags, 1), 0) > 0
      or a.verify_status in ('divergent', 'no_match', 'error')
    )
  order by
    (coalesce(a.decision, 'pending') = 'pending') desc,
    l.is_listed desc,
    coalesce(a.drift_m, 0) desc,
    coalesce(array_length(a.flags, 1), 0) desc,
    c.name,
    l.name;
end;
$$;

comment on function public.manager_location_address_audit(boolean) is
  'Painel da auditoria de endereço: estado atual da unidade + veredito + para onde a coordenada proposta ancoraria. hub_admin.';

grant execute on function public.manager_location_address_audit(boolean) to authenticated;

-- ── 7. Aplicar a correção (o único caminho de escrita) ────────────────────────────────────
-- Parâmetro nulo = não mexe nesse campo. Não existe "limpar endereço" por aqui de propósito:
-- a auditoria corrige, não esvazia. Para apagar um campo, o formulário da unidade.

create or replace function public.manager_location_address_apply(
  p_location_id uuid,
  p_address text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_google_place_id text default null,
  p_google_maps_url text default null,
  p_relink_destination boolean default true,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_before public.location%rowtype;
  v_lat numeric;
  v_lng numeric;
  v_new_destination uuid;
  v_dist_before numeric;
  v_dist_after numeric;
  v_code_before text;
  v_code_after text;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark corrige endereço de unidade.' using errcode = '42501';
  end if;

  select * into v_before from public.location where id = p_location_id and deleted_at is null;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;

  if p_address is null and p_latitude is null and p_longitude is null
     and p_google_place_id is null and p_google_maps_url is null then
    raise exception 'Nada para aplicar: informe ao menos um campo.' using errcode = 'P0001';
  end if;

  -- Latitude e longitude andam juntas: aplicar só uma das duas produz um pino em lugar
  -- nenhum, que é pior que o pino errado que se queria corrigir.
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude e longitude precisam ser aplicadas juntas.' using errcode = 'P0001';
  end if;

  v_lat := coalesce(p_latitude, v_before.latitude);
  v_lng := coalesce(p_longitude, v_before.longitude);

  select round((st_distance(v_before.geog, d.geog) / 1000.0)::numeric, 2), d.code
    into v_dist_before, v_code_before
    from public.destination d where d.id = v_before.destination_id;

  -- O re-vínculo é o ponto inteiro desta RPC. A trigger de INSERT não cobre UPDATE (DAT-04:
  -- override manual nunca é pisado), então sem isto uma coordenada corrigida através da
  -- fronteira de outro aeroporto continuaria ancorada no destino antigo, exibindo a distância
  -- certa até o aeroporto errado.
  v_new_destination := v_before.destination_id;
  if p_relink_destination and p_latitude is not null then
    v_new_destination := coalesce(public.nearest_destination(v_lat, v_lng), v_before.destination_id);
  end if;

  perform set_config('app.address_audit_apply', '1', true);

  update public.location
     set address = coalesce(p_address, address),
         latitude = coalesce(p_latitude, latitude),
         longitude = coalesce(p_longitude, longitude),
         google_place_id = coalesce(p_google_place_id, google_place_id),
         google_maps_url = coalesce(p_google_maps_url, google_maps_url),
         destination_id = v_new_destination
   where id = p_location_id;

  perform set_config('app.address_audit_apply', '', true);

  select round((st_distance(l.geog, d.geog) / 1000.0)::numeric, 2), d.code
    into v_dist_after, v_code_after
    from public.location l
    join public.destination d on d.id = l.destination_id
   where l.id = p_location_id;

  insert into public.location_address_change (
    location_id, changed_by,
    address_before, address_after,
    latitude_before, longitude_before, latitude_after, longitude_after,
    destination_before, destination_after,
    distance_km_before, distance_km_after,
    source, note
  ) values (
    p_location_id, auth.uid(),
    v_before.address, coalesce(p_address, v_before.address),
    v_before.latitude, v_before.longitude, v_lat, v_lng,
    v_before.destination_id, v_new_destination,
    v_dist_before, v_dist_after,
    'audit', p_note
  );

  insert into public.location_address_audit as a (location_id, decision, decision_note, reviewed_at, reviewed_by)
  values (p_location_id, 'applied', p_note, now(), auth.uid())
  on conflict (location_id) do update
    set decision = 'applied',
        decision_note = p_note,
        reviewed_at = now(),
        reviewed_by = auth.uid();

  return jsonb_build_object(
    'location_id', p_location_id,
    'destination_before', v_code_before,
    'destination_after', v_code_after,
    'destination_changed', v_code_before is distinct from v_code_after,
    'distance_km_before', v_dist_before,
    'distance_km_after', v_dist_after
  );
end;
$$;

comment on function public.manager_location_address_apply(uuid, text, numeric, numeric, text, text, boolean, text) is
  'Aplica a correção de endereço/pino, re-vincula o destino (a trigger só cobre INSERT) e registra o antes/depois em location_address_change. hub_admin.';

grant execute on function public.manager_location_address_apply(uuid, text, numeric, numeric, text, text, boolean, text) to authenticated;

-- ── 8. Descartar (revisado e mantido) ─────────────────────────────────────────────────────
-- Sem isto, um caso conferido e correto volta na lista todo mês e a lista deixa de ser lida.

create or replace function public.manager_location_address_dismiss(
  p_location_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark revisa a auditoria de endereços.' using errcode = '42501';
  end if;

  insert into public.location_address_audit as a (location_id, decision, decision_note, reviewed_at, reviewed_by)
  values (p_location_id, 'dismissed', p_note, now(), auth.uid())
  on conflict (location_id) do update
    set decision = 'dismissed',
        decision_note = p_note,
        reviewed_at = now(),
        reviewed_by = auth.uid();
end;
$$;

grant execute on function public.manager_location_address_dismiss(uuid, text) to authenticated;

-- ── 9. Rodar a triagem pelo Manager ───────────────────────────────────────────────────────

create or replace function public.manager_location_address_scan()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark roda a auditoria de endereços.' using errcode = '42501';
  end if;
  return public.location_address_scan();
end;
$$;

grant execute on function public.manager_location_address_scan() to authenticated;

-- ── 10. Primeira passada ──────────────────────────────────────────────────────────────────
-- A tabela nasce preenchida: auditoria que estreia vazia não é lida.

select public.location_address_scan();
